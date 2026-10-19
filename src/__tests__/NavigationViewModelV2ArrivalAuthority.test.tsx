import { getDistance } from 'geolib';
import { seedRunningNavigation } from './navigationFixture';
import type { Coordinate, Place, V2ActiveRoute } from '../models/types';
import { V2DirectionsService } from '../services/V2DirectionsService';
import { V2NavigationAdapter } from '../services/V2NavigationAdapter';
import { VoiceService } from '../services/VoiceService';
import { useAppStore } from '../store/useAppStore';
import { useNavigationViewModelV2 } from '../viewmodels/NavigationViewModelV2';
import { act, renderHook, waitFor } from './test-utils';

// A5-02: arrival used to be a UI-only latch. After the arrival modal appeared, the engine kept
// processing fixes: a walker leaving the destination accumulated off-route evidence, attemptReroute
// replaced the completed route behind the modal and new instructions were spoken. These tests drive the
// real hook and store; only the routing provider and the preview->active adapter are stubbed.

jest.setTimeout(15_000);

const initialStoreState = useAppStore.getState();
const M_PER_DEG_LAT = 111_320;
const START: Coordinate = { latitude: 24.985, longitude: 67.02 }; // outside the venue: reroutes take the hybrid path
const M_PER_DEG_LON = M_PER_DEG_LAT * Math.cos((START.latitude * Math.PI) / 180);
const at = (origin: Coordinate, northM: number, eastM: number): Coordinate => ({
  latitude: origin.latitude + northM / M_PER_DEG_LAT,
  longitude: origin.longitude + eastM / M_PER_DEG_LON,
});

const destination: Place = {
  id: 'a502-destination', name: 'A5-02 destination', category: 'Block',
  description: 'Synthetic arrival fixture', coordinate: at(START, 100, 0), sourceVersion: 'v2',
};

type StepType = 'straight' | 'left' | 'right' | 'arrival';

function buildRoute(label: string, vertices: Coordinate[], types: StepType[]): V2ActiveRoute {
  const legs = vertices.slice(1).map((vertex, index) => getDistance(vertices[index], vertex));
  const totalDistanceM = legs.reduce((sum, leg) => sum + leg, 0);
  return {
    id: label, routeId: label, sourceVersion: 'v2',
    coordinates: vertices, nodes: [], segments: [], edges: [],
    totalDistance: totalDistanceM, totalDistanceM, estimatedTimeMin: Math.ceil(totalDistanceM / 1.4 / 60), etaMinutes: Math.ceil(totalDistanceM / 1.4 / 60),
    origin: { coordinate: vertices[0], label: `${label} start`, type: 'inside_snap' },
    destination: { coordinate: vertices[vertices.length - 1], label: destination.name, type: 'block', blockId: destination.id },
    metadata: { startedOutside: true, usesOfficialGateEntry: false, graphVersion: 'synthetic' },
    instructions: legs.map((leg, index) => ({
      id: `v2-step-${index + 1}`, text: `${label} step ${index + 1}`, type: types[index],
      coordinate: vertices[index + 1], routeIndex: index + 1, distance: leg, distanceM: leg,
    })),
  };
}

// 100 m heading north in four 25 m legs (each fix stays inside the plausible-forward cap). Like the production
// adapter, the arrival marker shares the last walking step's routeIndex, so it only becomes the active step once
// progress reaches the final node, while arrival itself latches within 20 m of it.
const verticesFrom = (origin: Coordinate) => [0, 1, 2, 3, 4].map((leg) => at(origin, 25 * leg, 0));
const vertices = verticesFrom(START);
const buildJourney = (label: string, origin: Coordinate = START) => {
  const route = buildRoute(label, verticesFrom(origin), ['straight', 'straight', 'straight', 'straight']);
  const last = route.coordinates.length - 1;
  route.instructions.push({
    id: `v2-step-${last + 1}`, text: `${label} step ${last + 1}`, type: 'arrival',
    coordinate: route.coordinates[last], routeIndex: last, distance: 0, distanceM: 0,
  });
  return route;
};
const destinationFix = vertices[vertices.length - 1];

const replacementFrom = (from: Coordinate) =>
  buildRoute('B', [from, at(from, 0, 25), at(from, 0, 50), at(from, 25, 50), at(from, 50, 50)], ['right', 'straight', 'left', 'arrival']);

const publish = (coordinate: Coordinate) =>
  act(async () => {
    useAppStore.setState({ currentLocation: { ...coordinate, accuracy: 5, observedAtMs: Date.now() }, currentLocationSource: 'live' });
  });

// Sustained short steps 150 m east of the destination: far past the off-route threshold, as in the emulator run.
const walkAwayFrom = async (anchor: Coordinate) => {
  for (let i = 0; i < 18; i += 1) await publish(at(anchor, 0.5 + i * 2, 150));
};

let speakSpy: jest.SpyInstance;
let stopSpeakingSpy: jest.SpyInstance;
let hybridSpy: jest.SpyInstance;

const stubHybridImmediate = () => {
  hybridSpy = jest.spyOn(V2DirectionsService, 'calculateHybridPreview').mockImplementation(async ({ request }) => ({
    status: 'ready', route: replacementFrom(request.currentLocation as Coordinate) as never, instructions: [], message: null,
  }));
};

// A reroute that stays pending until the test lets it finish; records the abort signal it was given.
const stubHybridDeferred = () => {
  const control: { finish: () => void; signal: AbortSignal | undefined } = { finish: () => undefined, signal: undefined };
  hybridSpy = jest.spyOn(V2DirectionsService, 'calculateHybridPreview').mockImplementation(({ request, signal }) => new Promise((resolve) => {
    control.signal = signal;
    control.finish = () => resolve({ status: 'ready', route: replacementFrom(request.currentLocation as Coordinate) as never, instructions: [], message: null });
  }));
  return control;
};

async function mountJourney(route: V2ActiveRoute, autoReroute = true) {
  useAppStore.setState({ settings: { ...initialStoreState.settings, autoReroute } });
  seedRunningNavigation(destination, route, route.instructions);
  const hook = await renderHook(() => useNavigationViewModelV2());
  await publish(at(START, 2, 0));
  return hook;
}

// Walks the journey fix by fix until the arrival latch is set: 15 m short of the final node, inside the 20 m radius.
const fixJustShortOfDestination = at(vertices[3], 10, 0);
async function walkToArrival(hook: Awaited<ReturnType<typeof mountJourney>>) {
  for (const vertex of vertices.slice(1, 4)) await publish(vertex);
  expect(hook.result.current.arrived).toBe(false);
  await publish(fixJustShortOfDestination);
  expect(hook.result.current.arrived).toBe(true);
}

beforeEach(() => {
  useAppStore.setState(initialStoreState, true);
  speakSpy = jest.spyOn(VoiceService, 'speakInstruction').mockImplementation(() => undefined as never);
  stopSpeakingSpy = jest.spyOn(VoiceService, 'stopSpeaking').mockImplementation(() => undefined as never);
  jest.spyOn(V2NavigationAdapter, 'fromPreview').mockImplementation(({ previewRoute }) => previewRoute as unknown as V2ActiveRoute);
});
afterEach(() => jest.restoreAllMocks());

describe('A5-02 after qualified arrival the journey is complete and nothing else may change it', () => {
  test('GPS fixes that walk away from the destination cannot reroute or replace the route', async () => {
    stubHybridImmediate();
    const journey = buildJourney('A');
    const hook = await mountJourney(journey);
    await walkToArrival(hook);
    speakSpy.mockClear();

    await walkAwayFrom(destinationFix);

    expect(hybridSpy).not.toHaveBeenCalled();
    expect(useAppStore.getState().activeRoute).toBe(journey);
    expect(useAppStore.getState().routeInstructions).toBe(journey.instructions);
    expect(hook.result.current.route).toBe(journey);
    expect(hook.result.current.arrived).toBe(true);
    expect(hook.result.current.reroutePending).toBe(false);
    // Nothing from a replacement route is ever spoken; at most the completed route's own closing step.
    expect(speakSpy).not.toHaveBeenCalledWith(expect.stringMatching(/^B step/), expect.anything());
    for (const [text] of speakSpy.mock.calls) expect(text).toMatch(/^A step/);
  });

  test('the arrival is still announced once when the latch fires short of the final node', async () => {
    stubHybridImmediate();
    const journey = buildJourney('A');
    const hook = await mountJourney(journey);
    await walkToArrival(hook);
    const arrivalText = journey.instructions[journey.instructions.length - 1].text;
    expect(speakSpy).not.toHaveBeenCalledWith(arrivalText, expect.anything());

    await publish(destinationFix);
    await publish(destinationFix);

    expect(speakSpy.mock.calls.filter(([text]) => text === arrivalText)).toHaveLength(1);
    expect(hook.result.current.currentStepIndex).toBe(journey.instructions.length - 1);
  });

  test('guard is not over-broad: the same walk-away before arrival still reroutes', async () => {
    stubHybridImmediate();
    const journey = buildJourney('A');
    const hook = await mountJourney(journey);
    expect(hook.result.current.arrived).toBe(false);

    await walkAwayFrom(at(START, 2, 0));
    await waitFor(() => expect(hook.result.current.route?.routeId).toBe('B'));

    expect(hybridSpy).toHaveBeenCalledTimes(1);
    expect(hook.result.current.arrived).toBe(false);
  });

  test('explicit retry and gate selection after arrival request nothing', async () => {
    stubHybridImmediate();
    const journey = buildJourney('A');
    const hook = await mountJourney(journey);
    await walkToArrival(hook);

    await act(() => hook.result.current.retryOutsideRoute());
    await act(() => hook.result.current.selectOutsideGate(hook.result.current.availableOutsideGates[0].id));

    expect(hybridSpy).not.toHaveBeenCalled();
    expect(useAppStore.getState().activeRoute).toBe(journey);
    expect(hook.result.current.reroutePending).toBe(false);
  });
});

describe('A5-02 a reroute that is still computing when the walker arrives', () => {
  async function arriveWhileRerouting() {
    const control = stubHybridDeferred();
    const journey = buildJourney('A');
    const hook = await mountJourney(journey);
    await publish(vertices[3]);
    let pending!: Promise<void>;
    await act(async () => { pending = hook.result.current.retryOutsideRoute(); });
    expect(hybridSpy).toHaveBeenCalledTimes(1);
    await publish(fixJustShortOfDestination);
    expect(hook.result.current.arrived).toBe(true);
    return { control, journey, hook, pending };
  }

  test('cannot replace the arrival-completed route when it finishes late', async () => {
    const { control, journey, hook, pending } = await arriveWhileRerouting();
    speakSpy.mockClear();

    await act(async () => { control.finish(); await pending; });

    expect(useAppStore.getState().activeRoute).toBe(journey);
    expect(hook.result.current.route).toBe(journey);
    expect(hook.result.current.arrived).toBe(true);
    expect(hook.result.current.reroutePending).toBe(false);
    expect(speakSpy).not.toHaveBeenCalledWith(expect.stringMatching(/^B step/), expect.anything());
  });

  test('is cancelled at the moment arrival latches', async () => {
    const { control, hook } = await arriveWhileRerouting();

    expect(control.signal?.aborted).toBe(true);
    // The "Rerouting…" state does not outlive the arrival while the aborted request is still settling.
    expect(hook.result.current.reroutePending).toBe(false);
  });

  test('Done during the arrival transition leaves nothing behind for the late result to resurrect', async () => {
    const { control, hook, pending } = await arriveWhileRerouting();

    await act(async () => { hook.result.current.handleExit(); });
    await act(async () => { control.finish(); await pending; });

    expect(useAppStore.getState().isNavigating).toBe(false);
    expect(useAppStore.getState().activeRoute).toBeNull();
    expect(hook.result.current.route).toBeNull();
    expect(hook.result.current.arrived).toBe(false);
  });
});

describe('A5-02 leaving and starting journeys still works', () => {
  test('Exit after arrival stops speech, ends the session and clears the latch', async () => {
    stubHybridImmediate();
    const hook = await mountJourney(buildJourney('A'));
    await walkToArrival(hook);
    stopSpeakingSpy.mockClear();

    await act(async () => { hook.result.current.handleExit(); });

    expect(stopSpeakingSpy).toHaveBeenCalledTimes(1);
    expect(useAppStore.getState().isNavigating).toBe(false);
    expect(useAppStore.getState().activeRoute).toBeNull();
    expect(hook.result.current.arrived).toBe(false);
  });

  test('a new journey after Exit starts at step 0, speaks, and reroutes normally', async () => {
    stubHybridImmediate();
    const hook = await mountJourney(buildJourney('A'));
    await walkToArrival(hook);
    await act(async () => { hook.result.current.handleExit(); });
    speakSpy.mockClear();

    // The walker is standing at the old destination, so the next trip begins there.
    const next = buildJourney('N', destinationFix);
    await act(async () => seedRunningNavigation(destination, next, next.instructions));
    await publish(at(destinationFix, 2, 0));

    expect(hook.result.current.route).toBe(next);
    expect(hook.result.current.arrived).toBe(false);
    expect(hook.result.current.currentStepIndex).toBe(0);
    expect(speakSpy).toHaveBeenCalledWith('N step 1', 'en');

    await walkAwayFrom(at(destinationFix, 2, 0));
    await waitFor(() => expect(hook.result.current.route?.routeId).toBe('B'));
    expect(hybridSpy).toHaveBeenCalledTimes(1);
  });

  test('a new session after navigation was stopped elsewhere (not via Exit) also clears the latch and reroutes', async () => {
    stubHybridImmediate();
    const hook = await mountJourney(buildJourney('A'));
    await walkToArrival(hook);
    await act(async () => useAppStore.getState().stopNavigation());

    const next = buildJourney('N', destinationFix);
    await act(async () => seedRunningNavigation(destination, next, next.instructions));
    await publish(at(destinationFix, 2, 0));
    expect(hook.result.current.arrived).toBe(false);
    expect(hook.result.current.currentStepIndex).toBe(0);

    await walkAwayFrom(at(destinationFix, 2, 0));
    await waitFor(() => expect(hook.result.current.route?.routeId).toBe('B'));
  });
});

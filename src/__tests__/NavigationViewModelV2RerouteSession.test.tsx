import { getDistance } from 'geolib';
import { seedRunningNavigation } from './navigationFixture';
import type { Coordinate, Place, V2ActiveRoute } from '../models/types';
import { V2DirectionsService } from '../services/V2DirectionsService';
import { V2NavigationAdapter } from '../services/V2NavigationAdapter';
import { VoiceService } from '../services/VoiceService';
import { useAppStore } from '../store/useAppStore';
import { useNavigationViewModelV2 } from '../viewmodels/NavigationViewModelV2';
import type { NavigationSession } from '../../packages/offline-navigation/src/domain/session';
import { act, renderHook } from './test-utils';

// B4a-2: reroute ownership is checked against one SDK NavigationSession per journey (per navigationSessionId),
// alongside the store's own session check. These drive the real hook and store; only the routing provider and the
// preview->active adapter are stubbed, and every reroute is a deferred promise the test settles explicitly.

jest.setTimeout(15_000);

const mockCreatedSessions: NavigationSession[] = [];
jest.mock('../../packages/offline-navigation/src/domain/session', () => {
  const actual = jest.requireActual('../../packages/offline-navigation/src/domain/session');
  return {
    ...actual,
    createNavigationSession: (id: string) => {
      const session = actual.createNavigationSession(id);
      mockCreatedSessions.push(session);
      return session;
    },
  };
});

const initialStoreState = useAppStore.getState();
const M_PER_DEG_LAT = 111_320;
const START: Coordinate = { latitude: 24.985, longitude: 67.02 }; // outside the venue: reroutes take the async hybrid path
const M_PER_DEG_LON = M_PER_DEG_LAT * Math.cos((START.latitude * Math.PI) / 180);
const at = (origin: Coordinate, northM: number, eastM: number): Coordinate => ({
  latitude: origin.latitude + northM / M_PER_DEG_LAT,
  longitude: origin.longitude + eastM / M_PER_DEG_LON,
});

const destination: Place = {
  id: 'b4a2-destination', name: 'B4a-2 destination', category: 'Block',
  description: 'Synthetic reroute-ownership fixture', coordinate: at(START, 100, 0), sourceVersion: 'v2',
};

function buildRoute(label: string, vertices: Coordinate[]): V2ActiveRoute {
  const legs = vertices.slice(1).map((vertex, index) => getDistance(vertices[index], vertex));
  const totalDistanceM = legs.reduce((sum, leg) => sum + leg, 0);
  return {
    id: label, routeId: label, sourceVersion: 'v2',
    coordinates: vertices, nodes: [], segments: [], edges: [],
    totalDistance: totalDistanceM, totalDistanceM, estimatedTimeMin: 2, etaMinutes: 2,
    origin: { coordinate: vertices[0], label: `${label} start`, type: 'inside_snap' },
    destination: { coordinate: vertices[vertices.length - 1], label: destination.name, type: 'block', blockId: destination.id },
    metadata: { startedOutside: true, usesOfficialGateEntry: false, graphVersion: 'synthetic' },
    instructions: legs.map((leg, index) => ({
      id: `v2-step-${index + 1}`, text: `${label} step ${index + 1}`, type: index === legs.length - 1 ? 'arrival' : 'straight',
      coordinate: vertices[index + 1], routeIndex: index + 1, distance: leg, distanceM: leg,
    })),
  };
}

const buildJourney = (label: string) => buildRoute(label, [0, 1, 2, 3, 4].map((leg) => at(START, 25 * leg, 0)));
const replacementFrom = (label: string, from: Coordinate) =>
  buildRoute(label, [from, at(from, 0, 25), at(from, 25, 25), at(from, 50, 25)]);

const publish = (coordinate: Coordinate | null) =>
  act(async () => {
    useAppStore.setState({ currentLocation: coordinate && { ...coordinate, accuracy: 5, observedAtMs: Date.now() }, currentLocationSource: 'live' });
  });

let speakSpy: jest.SpyInstance;

// Each reroute stays pending until the test settles it; replacement routes are labelled R1, R2, ... in request order.
function stubHybridDeferred() {
  const calls: Array<{ signal?: AbortSignal; finish: () => void; fail: () => void }> = [];
  jest.spyOn(V2DirectionsService, 'calculateHybridPreview').mockImplementation(({ request, signal }) => new Promise((resolve) => {
    const label = `R${calls.length + 1}`;
    calls.push({
      signal,
      finish: () => resolve({ status: 'ready', route: replacementFrom(label, request.currentLocation as Coordinate) as never, instructions: [], message: null }),
      fail: () => resolve({ status: 'unavailable', route: null, instructions: [], message: 'none' }),
    });
  }));
  return calls;
}

async function mountJourney(route = buildJourney('A')) {
  seedRunningNavigation(destination, route, route.instructions);
  const hook = await renderHook(() => useNavigationViewModelV2());
  await publish(at(START, 2, 0));
  return { hook, route };
}

async function startRetry(hook: Awaited<ReturnType<typeof mountJourney>>['hook']) {
  let pending!: Promise<void>;
  await act(async () => { pending = hook.result.current.retryOutsideRoute(); });
  return { pending };
}

beforeEach(() => {
  useAppStore.setState(initialStoreState, true);
  mockCreatedSessions.length = 0;
  speakSpy = jest.spyOn(VoiceService, 'speakInstruction').mockImplementation(() => undefined as never);
  jest.spyOn(VoiceService, 'stopSpeaking').mockImplementation(() => undefined as never);
  jest.spyOn(V2NavigationAdapter, 'fromPreview').mockImplementation(({ previewRoute }) => previewRoute as unknown as V2ActiveRoute);
});
afterEach(() => jest.restoreAllMocks());

describe('B4a-2 reroute commits only for the journey that requested it', () => {
  test('a successful reroute installs the replacement at step 0 and speaks its first step (A5-01)', async () => {
    const calls = stubHybridDeferred();
    const { hook } = await mountJourney();
    const { pending } = await startRetry(hook);
    expect(hook.result.current.reroutePending).toBe(true);
    speakSpy.mockClear();

    await act(async () => { calls[0].finish(); await pending; });
    await publish(at(START, 2, 0));

    expect(hook.result.current.route?.routeId).toBe('R1');
    expect(useAppStore.getState().routeInstructions).toBe(hook.result.current.route?.instructions);
    expect(hook.result.current.currentStepIndex).toBe(0);
    expect(hook.result.current.reroutePending).toBe(false);
    expect(speakSpy).toHaveBeenCalledWith('R1 step 1', 'en');
  });

  test('a superseded reroute that resolves last is ignored; the newest one wins', async () => {
    const calls = stubHybridDeferred();
    const { hook } = await mountJourney();
    const { pending: first } = await startRetry(hook);
    const { pending: second } = await startRetry(hook);
    expect(calls[0].signal?.aborted).toBe(true);

    await act(async () => { calls[1].finish(); await second; });
    expect(hook.result.current.route?.routeId).toBe('R2');
    await act(async () => { calls[0].finish(); await first; });

    expect(useAppStore.getState().activeRoute?.id).toBe('R2');
  });

  test('a new journey invalidates the previous journey\'s pending reroute', async () => {
    const calls = stubHybridDeferred();
    const { hook } = await mountJourney();
    const { pending } = await startRetry(hook);

    const next = buildJourney('N');
    await act(async () => seedRunningNavigation(destination, next, next.instructions));
    await act(async () => { calls[0].finish(); await pending; });

    expect(useAppStore.getState().activeRoute).toBe(next);
    expect(hook.result.current.route).toBe(next);
  });

  test('Exit while a reroute is pending: the late result cannot resurrect the journey', async () => {
    const calls = stubHybridDeferred();
    const { hook } = await mountJourney();
    const { pending } = await startRetry(hook);

    await act(async () => { hook.result.current.handleExit(); });
    await act(async () => { calls[0].finish(); await pending; });

    expect(useAppStore.getState().isNavigating).toBe(false);
    expect(useAppStore.getState().activeRoute).toBeNull();
    expect(useAppStore.getState().reroutePending).toBe(false);
  });

  test('a reroute that completes after unmount changes nothing', async () => {
    const calls = stubHybridDeferred();
    const { hook, route } = await mountJourney();
    const { pending } = await startRetry(hook);

    await act(async () => { hook.unmount(); });
    await act(async () => { calls[0].finish(); await pending; });

    expect(calls[0].signal?.aborted).toBe(true);
    expect(useAppStore.getState().activeRoute).toBe(route);
    expect(useAppStore.getState().reroutePending).toBe(false);
  });

  test('losing GPS authority while pending aborts the request and keeps the current route', async () => {
    const calls = stubHybridDeferred();
    const { hook, route } = await mountJourney();
    const { pending } = await startRetry(hook);

    await publish(null);
    expect(calls[0].signal?.aborted).toBe(true);
    await act(async () => { calls[0].finish(); await pending; });

    expect(useAppStore.getState().activeRoute).toBe(route);
    expect(hook.result.current.route).toBe(route);
  });

  test('a rejected reroute keeps the current route and clears the pending state', async () => {
    const calls = stubHybridDeferred();
    const { hook, route } = await mountJourney();
    const { pending } = await startRetry(hook);

    await act(async () => { calls[0].fail(); await pending; });

    expect(hook.result.current.route).toBe(route);
    expect(hook.result.current.reroutePending).toBe(false);
    expect(hook.result.current.rerouteStatusMessage).toBe('Keep following the current route.');
  });
});

describe('B4a-2 one SDK session per journey', () => {
  test('re-renders and a committed reroute reuse the session; a new journey disposes it; unmount disposes the last', async () => {
    const calls = stubHybridDeferred();
    const { hook } = await mountJourney();
    expect(mockCreatedSessions).toHaveLength(1);
    expect(mockCreatedSessions[0].state).toBe('active');

    for (let i = 0; i < 3; i += 1) await publish(at(START, 3 + i, 0));
    await act(async () => { hook.rerender(undefined as never); });
    const { pending } = await startRetry(hook);
    await act(async () => { calls[0].finish(); await pending; });
    expect(hook.result.current.route?.routeId).toBe('R1');
    expect(mockCreatedSessions).toHaveLength(1);

    const next = buildJourney('N');
    await act(async () => seedRunningNavigation(destination, next, next.instructions));
    expect(mockCreatedSessions).toHaveLength(2);
    expect(mockCreatedSessions[0].state).toBe('disposed');
    expect(mockCreatedSessions[1].state).toBe('active');
    expect(mockCreatedSessions[1].id).not.toBe(mockCreatedSessions[0].id);

    await act(async () => { hook.unmount(); });
    expect(mockCreatedSessions[1].state).toBe('disposed');
  });

  test('stopping navigation disposes the session; no session exists while idle', async () => {
    stubHybridDeferred();
    const { hook } = await mountJourney();
    await act(async () => { hook.result.current.handleExit(); });
    expect(mockCreatedSessions[0].state).toBe('disposed');
    await publish(at(START, 2, 0));
    expect(mockCreatedSessions).toHaveLength(1);
  });

  test('the SDK gate alone rejects a result once its session is cancelled (store and coordinator still allow it)', async () => {
    const calls = stubHybridDeferred();
    const { hook, route } = await mountJourney();
    const { pending } = await startRetry(hook);

    mockCreatedSessions[0].cancel();
    await act(async () => { calls[0].finish(); await pending; });

    expect(useAppStore.getState().isNavigating).toBe(true);
    expect(useAppStore.getState().activeRoute).toBe(route);
    expect(hook.result.current.route).toBe(route);
  });

  test('B4a-3: Exit or a new journey aborts the pending provider request via the session', async () => {
    const calls = stubHybridDeferred();
    const { hook } = await mountJourney();
    await startRetry(hook);
    await act(async () => { hook.result.current.handleExit(); });
    expect(calls[0].signal?.aborted).toBe(true);

    const again = buildJourney('B');
    await act(async () => seedRunningNavigation(destination, again, again.instructions));
    await publish(at(START, 2, 0));
    await startRetry(hook);
    expect(calls).toHaveLength(2);
    const next = buildJourney('N');
    await act(async () => seedRunningNavigation(destination, next, next.instructions));
    expect(calls[1].signal?.aborted).toBe(true);
  });

  test('B4a-3: arrival aborts a pending provider request', async () => {
    const calls = stubHybridDeferred();
    const { hook } = await mountJourney();
    await startRetry(hook);
    for (const north of [25, 50, 75, 90]) await publish(at(START, north, 0));
    expect(hook.result.current.arrived).toBe(true);
    expect(calls[0].signal?.aborted).toBe(true);
  });

  test('arrival cancels the journey session so no later reroute can commit', async () => {
    stubHybridDeferred();
    const { hook } = await mountJourney();
    for (const north of [25, 50, 75, 90]) await publish(at(START, north, 0));
    expect(hook.result.current.arrived).toBe(true);
    expect(mockCreatedSessions[0].state).toBe('cancelled');
  });
});

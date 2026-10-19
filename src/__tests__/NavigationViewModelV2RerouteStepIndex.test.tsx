import { getDistance } from 'geolib';
import { seedRunningNavigation } from './navigationFixture';
import type { Coordinate, Place, V2ActiveRoute } from '../models/types';
import { V2DirectionsService } from '../services/V2DirectionsService';
import { V2NavigationAdapter } from '../services/V2NavigationAdapter';
import { VoiceService } from '../services/VoiceService';
import { createProductionOutsideRouteSource } from '../services/outsideRouting/ProductionOutsideRouteSource';
import { calculateLiveManeuverDistanceV2 } from '../services/V2NavigationRuntimeService';
import { useAppStore } from '../store/useAppStore';
import { useNavigationViewModelV2 } from '../viewmodels/NavigationViewModelV2';
import { act, renderHook, waitFor } from './test-utils';

// A5-01: a successful reroute replaces the active route but used to leave the previous route's
// currentStepIndex in place, so the new route's first instructions were skipped (and a short
// replacement collapsed straight to "arrive"). These tests drive the real hook and store; only the
// routing provider and the preview->active adapter are stubbed so replacement geometry is exact.

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
  id: 'a501-destination', name: 'A5-01 destination', category: 'Block',
  description: 'Synthetic reroute fixture', coordinate: at(START, 600, 0), sourceVersion: 'v2',
};

type StepType = 'straight' | 'left' | 'right' | 'arrival';

// Instruction i ends at vertex i+1 (routeIndex i+1). Ids repeat across routes ("v2-step-N"), exactly as
// RoutingServiceV2 generates them; the label keeps each route's spoken text distinguishable.
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

// Old route: 5 legs of 120 m heading north.
const oldVertices = [0, 1, 2, 3, 4, 5].map((leg) => at(START, 120 * leg, 0));
const buildOldRoute = (label: string) => buildRoute(label, oldVertices, ['straight', 'straight', 'straight', 'straight', 'arrival']);
// 20 m past the third vertex: steps 0-2 are complete, step 3 ("Continue Straight", ~100 m) is active.
const fixAtOldStep3 = at(START, 120 * 3 + 20, 0);
const fixNearOldStart = at(START, 10, 0);

const leg = (route: V2ActiveRoute, index: number) => route.instructions[index].distanceM;
// Replacement routes start where the walker is, as production reroutes do. 25 m legs keep every later fix
// inside the per-fix plausible-forward cap so tests can walk the new route fix by fix.
const replacement = {
  fourStepsRightFirst: (from: Coordinate) => buildRoute('B', [from, at(from, 0, 25), at(from, 0, 50), at(from, 25, 50), at(from, 50, 50)], ['right', 'straight', 'left', 'arrival']),
  twoSteps: (from: Coordinate) => buildRoute('SHORT', [from, at(from, 0, 20), at(from, 20, 20)], ['right', 'arrival']),
  // The first leg ends 10 m from the destination, then loops away and comes back: arrival must wait for the final leg.
  loopPassingDestination: (from: Coordinate) => {
    const route = buildRoute('LOOP', [from, at(from, 0, 30), at(from, 60, 30), at(from, 60, 40), at(from, 0, 40)], ['right', 'left', 'right', 'arrival']);
    return route;
  },
};

type Factory = (from: Coordinate) => V2ActiveRoute;
const stubHybrid = (factory: Factory) =>
  jest.spyOn(V2DirectionsService, 'calculateHybridPreview').mockImplementation(async ({ request }) => ({
    status: 'ready', route: factory(request.currentLocation as Coordinate) as never, instructions: [], message: null,
  }));
// Keep the stubbed geometry: the real adapter would re-snap destination/instruction coordinates to the venue graph.
const stubAdapterPassThrough = () =>
  jest.spyOn(V2NavigationAdapter, 'fromPreview').mockImplementation(({ previewRoute }) => previewRoute as unknown as V2ActiveRoute);

const publish = (coordinate: Coordinate) =>
  act(async () => {
    useAppStore.setState({ currentLocation: { ...coordinate, accuracy: 5, observedAtMs: Date.now() }, currentLocationSource: 'live' });
  });

async function mountOnOldRoute(oldRoute: V2ActiveRoute, firstFix: Coordinate, autoReroute = false) {
  useAppStore.setState({ settings: { ...initialStoreState.settings, autoReroute } });
  seedRunningNavigation(destination, oldRoute, oldRoute.instructions);
  const renders: Array<{ routeId: string | null; index: number }> = [];
  const hook = await renderHook(() => {
    const viewModel = useNavigationViewModelV2();
    renders.push({ routeId: viewModel.route?.routeId ?? null, index: viewModel.currentStepIndex });
    return viewModel;
  });
  await publish(firstFix);
  return { hook, renders };
}

let speakSpy: jest.SpyInstance;
beforeEach(() => {
  useAppStore.setState(initialStoreState, true);
  speakSpy = jest.spyOn(VoiceService, 'speakInstruction').mockImplementation(() => undefined as never);
  jest.spyOn(VoiceService, 'stopSpeaking').mockImplementation(() => undefined as never);
});
afterEach(() => jest.restoreAllMocks());

describe('A5-01 successful reroute gives guidance that belongs to the replacement route', () => {
  test('1/2/10: after several completed steps the replacement route starts at its own first instruction', async () => {
    const oldRoute = buildOldRoute('OLD');
    stubHybrid(replacement.fourStepsRightFirst); stubAdapterPassThrough();
    const { hook } = await mountOnOldRoute(oldRoute, fixAtOldStep3);
    expect(hook.result.current.currentStepIndex).toBe(3);
    expect(hook.result.current.maneuverDistance).toBeGreaterThan(90);

    await act(() => hook.result.current.retryOutsideRoute());
    await waitFor(() => expect(hook.result.current.route?.routeId).toBe('B'));
    const next = useAppStore.getState().activeRoute as V2ActiveRoute;

    expect(hook.result.current.currentStepIndex).toBe(0);
    expect(hook.result.current.instructions[hook.result.current.currentStepIndex].text).toBe('B step 1');
    expect(hook.result.current.maneuverDistance).toBeCloseTo(leg(next, 0), 0);
    expect(hook.result.current.remainingDistance).toBeCloseTo(next.totalDistanceM, 0);
    expect(hook.result.current.arrived).toBe(false);
    // The spoken maneuver is the replacement route's own first instruction, not a stale mid-route step.
    expect(speakSpy).toHaveBeenLastCalledWith('B step 1', 'en');
    expect(speakSpy).not.toHaveBeenCalledWith('B step 4', expect.anything());
  });

  test('2/10: later fixes advance through the replacement route in order from that fresh state', async () => {
    const oldRoute = buildOldRoute('OLD');
    stubHybrid(replacement.fourStepsRightFirst); stubAdapterPassThrough();
    const { hook } = await mountOnOldRoute(oldRoute, fixAtOldStep3);
    await act(() => hook.result.current.retryOutsideRoute());
    await waitFor(() => expect(hook.result.current.route?.routeId).toBe('B'));
    const next = useAppStore.getState().activeRoute as V2ActiveRoute;

    const visited: number[] = [hook.result.current.currentStepIndex];
    for (const vertex of next.coordinates.slice(1)) {
      await publish(vertex);
      visited.push(hook.result.current.currentStepIndex);
    }
    // Monotonic, never skipping ahead of the walker, and ends on the arrival maneuver at the last vertex.
    expect(visited[0]).toBe(0);
    for (let i = 1; i < visited.length; i += 1) {
      expect(visited[i]).toBeGreaterThanOrEqual(visited[i - 1]);
      expect(visited[i] - visited[i - 1]).toBeLessThanOrEqual(1);
    }
    expect(visited[visited.length - 1]).toBe(next.instructions.length - 1);
    expect(speakSpy.mock.calls.map(([text]) => text).filter((text) => String(text).startsWith('B '))).toEqual([
      'B step 1', 'B step 2', 'B step 3', 'B step 4',
    ]);
  });

  test('3/9: a replacement shorter than the stale index shows its first step, not "arrive"', async () => {
    const oldRoute = buildOldRoute('OLD');
    stubHybrid(replacement.twoSteps); stubAdapterPassThrough();
    const { hook } = await mountOnOldRoute(oldRoute, fixAtOldStep3);
    expect(hook.result.current.currentStepIndex).toBe(3);

    await act(() => hook.result.current.retryOutsideRoute());
    await waitFor(() => expect(hook.result.current.route?.routeId).toBe('SHORT'));
    const next = useAppStore.getState().activeRoute as V2ActiveRoute;

    expect(next.instructions).toHaveLength(2);
    expect(hook.result.current.currentStepIndex).toBe(0);
    expect(hook.result.current.maneuverDistance).toBeCloseTo(leg(next, 0), 0);
    expect(hook.result.current.maneuverDistance).toBeGreaterThan(15);
    expect(speakSpy).not.toHaveBeenCalledWith('SHORT step 2', expect.anything());
  });

  test('4: a new first maneuver (turn right) is shown and spoken instead of the old route\'s straight', async () => {
    const oldRoute = buildOldRoute('OLD');
    stubHybrid(replacement.fourStepsRightFirst); stubAdapterPassThrough();
    const { hook } = await mountOnOldRoute(oldRoute, fixNearOldStart);
    expect(hook.result.current.currentStepIndex).toBe(0);
    expect(oldRoute.instructions[0].type).toBe('straight');

    await act(() => hook.result.current.retryOutsideRoute());
    await waitFor(() => expect(hook.result.current.route?.routeId).toBe('B'));

    expect(hook.result.current.instructions[hook.result.current.currentStepIndex]).toMatchObject({ type: 'right', text: 'B step 1' });
    // Both routes name their first step "v2-step-1": the replacement's first instruction must still be announced.
    expect(speakSpy).toHaveBeenCalledWith('OLD step 1', 'en');
    expect(speakSpy).toHaveBeenLastCalledWith('B step 1', 'en');
  });

  test('10: a locale change after a reroute re-speaks the replacement route\'s current step', async () => {
    const { useLocaleStore } = require('../i18n/localeStore');
    jest.spyOn(VoiceService, 'stop').mockImplementation(() => undefined as never);
    const oldRoute = buildOldRoute('OLD');
    stubHybrid(replacement.fourStepsRightFirst); stubAdapterPassThrough();
    const { hook } = await mountOnOldRoute(oldRoute, fixAtOldStep3);
    await act(() => hook.result.current.retryOutsideRoute());
    await waitFor(() => expect(hook.result.current.route?.routeId).toBe('B'));
    speakSpy.mockClear();

    try {
      await act(async () => { useLocaleStore.getState().setLocale('ur'); });
      expect(speakSpy).toHaveBeenLastCalledWith('B step 1', 'ur');
    } finally {
      await act(async () => { useLocaleStore.getState().setLocale('en'); });
    }
  });

  test('9: arrival is not inferred from the previous route\'s final-step index', async () => {
    const oldRoute = buildOldRoute('OLD');
    const stub = stubHybrid(replacement.loopPassingDestination); stubAdapterPassThrough();
    // Stale index 3 equals the loop route's final-instruction index. Its early leg ends 10 m from the destination.
    const { hook } = await mountOnOldRoute(oldRoute, fixAtOldStep3);
    await act(() => hook.result.current.retryOutsideRoute());
    await waitFor(() => expect(hook.result.current.route?.routeId).toBe('LOOP'));
    const loop = useAppStore.getState().activeRoute as V2ActiveRoute;
    const nearDestination = loop.coordinates[1];
    expect(getDistance(nearDestination, loop.destination.coordinate)).toBeLessThan(20);

    await publish(nearDestination);

    expect(stub).toHaveBeenCalledTimes(1);
    expect(hook.result.current.arrived).toBe(false);
    expect(hook.result.current.currentStepIndex).toBeLessThan(loop.instructions.length - 1);
  });

  test('2: no render ever pairs the replacement route with the previous route\'s step index', async () => {
    const oldRoute = buildOldRoute('OLD');
    stubHybrid(replacement.fourStepsRightFirst); stubAdapterPassThrough();
    const { hook, renders } = await mountOnOldRoute(oldRoute, fixAtOldStep3);
    await act(() => hook.result.current.retryOutsideRoute());
    await waitFor(() => expect(hook.result.current.route?.routeId).toBe('B'));

    const firstReplacementRender = renders.find((entry) => entry.routeId === 'B');
    expect(firstReplacementRender).toEqual({ routeId: 'B', index: 0 });
  });

  test('1: an ordinary off-route reroute (not an explicit retry) resets guidance too', async () => {
    const oldRoute = buildOldRoute('OLD');
    stubHybrid(replacement.fourStepsRightFirst); stubAdapterPassThrough();
    const { hook } = await mountOnOldRoute(oldRoute, fixAtOldStep3, true);
    expect(hook.result.current.currentStepIndex).toBe(3);

    // Sustained short steps 150 m east of the line, far past the off-route threshold (as in the emulator run).
    for (let i = 0; i < 18; i += 1) await publish(at(fixAtOldStep3, 0.5 + i * 2, 150));
    await waitFor(() => expect(hook.result.current.route?.routeId).toBe('B'));
    await waitFor(() => expect(useAppStore.getState().reroutePending).toBe(false));

    expect(hook.result.current.currentStepIndex).toBe(0);
    expect(hook.result.current.instructions[0].text).toBe('B step 1');
    expect(hook.result.current.arrived).toBe(false);
  });
});

describe('A5-01 guidance is untouched unless a replacement is actually committed', () => {
  test('5: a rejected reroute (no candidate) keeps the old route, step index and maneuver', async () => {
    const oldRoute = buildOldRoute('OLD');
    jest.spyOn(V2DirectionsService, 'calculateHybridPreview').mockResolvedValue({ status: 'unavailable', route: null, instructions: [], message: 'No replacement.' });
    const { hook } = await mountOnOldRoute(oldRoute, fixAtOldStep3);
    const maneuverBefore = hook.result.current.maneuverDistance;

    await act(() => hook.result.current.retryOutsideRoute());
    await waitFor(() => expect(useAppStore.getState().reroutePending).toBe(false));

    expect(useAppStore.getState().activeRoute).toBe(oldRoute);
    expect(hook.result.current.currentStepIndex).toBe(3);
    expect(hook.result.current.maneuverDistance).toBeCloseTo(maneuverBefore, 5);
    expect(hook.result.current.rerouteStatusMessage).toBe('Keep following the current route.');
  });

  test('5: a throw while building the replacement keeps the old route and step index', async () => {
    const oldRoute = buildOldRoute('OLD');
    stubHybrid(replacement.fourStepsRightFirst);
    jest.spyOn(V2NavigationAdapter, 'fromPreview').mockImplementation(() => { throw new Error('forced'); });
    const { hook } = await mountOnOldRoute(oldRoute, fixAtOldStep3);

    await act(() => hook.result.current.retryOutsideRoute());
    await waitFor(() => expect(useAppStore.getState().reroutePending).toBe(false));

    expect(useAppStore.getState().activeRoute).toBe(oldRoute);
    expect(hook.result.current.currentStepIndex).toBe(3);
  });

  test('5: a direct-guide candidate cannot replace the walking route or its step index', async () => {
    const oldRoute = buildOldRoute('OLD');
    jest.spyOn(V2DirectionsService, 'calculateHybridPreview').mockImplementation(async ({ request }) => ({
      status: 'ready',
      route: { ...replacement.fourStepsRightFirst(request.currentLocation as Coordinate), outsideRoute: { provider: 'direct-guide' } } as never,
      instructions: [], message: null,
    }));
    stubAdapterPassThrough();
    const { hook } = await mountOnOldRoute(oldRoute, fixAtOldStep3);

    await act(() => hook.result.current.retryOutsideRoute());
    await waitFor(() => expect(useAppStore.getState().reroutePending).toBe(false));

    expect(useAppStore.getState().activeRoute).toBe(oldRoute);
    expect(hook.result.current.currentStepIndex).toBe(3);
  });

  test('6/7: a reroute that completes after the journey was replaced cannot overwrite the new journey', async () => {
    const oldRoute = buildOldRoute('OLD');
    const newJourney = buildRoute('NEW', oldVertices, ['straight', 'straight', 'straight', 'straight', 'arrival']);
    let finishReroute!: () => void;
    jest.spyOn(V2DirectionsService, 'calculateHybridPreview').mockImplementation(({ request }) => new Promise((resolve) => {
      finishReroute = () => resolve({ status: 'ready', route: replacement.fourStepsRightFirst(request.currentLocation as Coordinate) as never, instructions: [], message: null });
    }));
    stubAdapterPassThrough();
    const { hook } = await mountOnOldRoute(oldRoute, fixAtOldStep3);
    expect(hook.result.current.currentStepIndex).toBe(3);

    let pending!: Promise<void>;
    await act(async () => { pending = hook.result.current.retryOutsideRoute(); });
    // The user ends the trip and starts another one while the reroute is still computing.
    await act(async () => useAppStore.getState().stopNavigation());
    await act(async () => seedRunningNavigation(destination, newJourney, newJourney.instructions));
    await publish(at(START, 5, 0));
    expect(hook.result.current.route?.routeId).toBe('NEW');
    const indexBefore = hook.result.current.currentStepIndex;
    speakSpy.mockClear();

    await act(async () => { finishReroute(); await pending; });

    expect(useAppStore.getState().activeRoute).toBe(newJourney);
    expect(useAppStore.getState().routeInstructions).toBe(newJourney.instructions);
    expect(hook.result.current.route?.routeId).toBe('NEW');
    expect(hook.result.current.currentStepIndex).toBe(indexBefore);
    expect(speakSpy).not.toHaveBeenCalledWith(expect.stringMatching(/^B step/), expect.anything());
  });

  test('7: a new navigation session starts at its own first step, never the last session\'s index', async () => {
    const oldRoute = buildOldRoute('OLD');
    const nextJourney = buildOldRoute('NEXT');
    const { hook, renders } = await mountOnOldRoute(oldRoute, fixAtOldStep3);
    expect(hook.result.current.currentStepIndex).toBe(3);

    await act(async () => useAppStore.getState().stopNavigation());
    // As in production, Start requires the live fix to sit at the new preview's origin.
    await publish(START);
    speakSpy.mockClear();
    await act(async () => seedRunningNavigation(destination, nextJourney, nextJourney.instructions));

    expect(hook.result.current.route?.routeId).toBe('NEXT');
    expect(hook.result.current.currentStepIndex).toBe(0);
    expect(hook.result.current.instructions[0].text).toBe('NEXT step 1');
    expect(speakSpy.mock.calls.map(([text]) => text)).not.toContain('NEXT step 4');
    // Not even a transient render pairs the new session's route with the last session's index.
    expect(renders.find((entry) => entry.routeId === 'NEXT')).toEqual({ routeId: 'NEXT', index: 0 });
  });

  test('8: losing GPS while a reroute is computing leaves the old route and step index intact', async () => {
    const oldRoute = buildOldRoute('OLD');
    let finishReroute!: () => void;
    jest.spyOn(V2DirectionsService, 'calculateHybridPreview').mockImplementation(({ request }) => new Promise((resolve) => {
      finishReroute = () => resolve({ status: 'ready', route: replacement.fourStepsRightFirst(request.currentLocation as Coordinate) as never, instructions: [], message: null });
    }));
    stubAdapterPassThrough();
    const { hook } = await mountOnOldRoute(oldRoute, fixAtOldStep3);
    expect(hook.result.current.currentStepIndex).toBe(3);

    let pending!: Promise<void>;
    await act(async () => { pending = hook.result.current.retryOutsideRoute(); });
    await act(async () => useAppStore.setState({ currentLocation: null }));
    await act(async () => { finishReroute(); await pending; });

    expect(useAppStore.getState().activeRoute).toBe(oldRoute);
    expect(hook.result.current.currentStepIndex).toBe(3);
    expect(hook.result.current.gpsSignalState).toBe('GPS_LOST');
    expect(speakSpy).not.toHaveBeenCalledWith(expect.stringMatching(/^B step/), expect.anything());

    // Guidance resumes on the retained route from the retained step once a live fix returns.
    await publish(at(START, 120 * 3 + 40, 0));
    expect(hook.result.current.currentStepIndex).toBe(3);
    expect(hook.result.current.route?.routeId).toBe('OLD');
  });
});

describe('A5-01 through the real hybrid router and adapter', () => {
  const proxyBefore = process.env.EXPO_PUBLIC_IJTEMA_ROUTING_PROXY_BASE_URL;
  const routingBefore = process.env.EXPO_PUBLIC_USE_IJTEMA_V2_ROUTING;
  let envRestore: () => void = () => undefined;
  afterAll(() => envRestore());
  const origin = { latitude: 24.9762, longitude: 67.011 };
  const realDestination: Place = {
    id: 'B34', name: 'Block 34', category: 'Block', description: 'Block 34',
    coordinate: { latitude: 24.966, longitude: 67.004 }, sourceVersion: 'v2',
  };

  test('a real reroute after several completed steps re-derives guidance from the new route', async () => {
    delete process.env.EXPO_PUBLIC_IJTEMA_ROUTING_PROXY_BASE_URL;
    process.env.EXPO_PUBLIC_USE_IJTEMA_V2_ROUTING = 'true';
    envRestore = () => {
      if (proxyBefore === undefined) delete process.env.EXPO_PUBLIC_IJTEMA_ROUTING_PROXY_BASE_URL; else process.env.EXPO_PUBLIC_IJTEMA_ROUTING_PROXY_BASE_URL = proxyBefore;
      if (routingBefore === undefined) delete process.env.EXPO_PUBLIC_USE_IJTEMA_V2_ROUTING; else process.env.EXPO_PUBLIC_USE_IJTEMA_V2_ROUTING = routingBefore;
    };
    const preview = await V2DirectionsService.calculateHybridPreview({
      request: { startPlace: null, destination: realDestination, currentLocation: origin, forceOutside: true },
      token: { requestId: 'a501-initial', requestVersion: 1 },
      signal: new AbortController().signal,
      outsideProvider: createProductionOutsideRouteSource({ googleProxyBaseUrl: undefined }),
    });
    if (preview.status !== 'ready' || !preview.route) throw new Error('Real route fixture must resolve.');
    const oldRoute = V2NavigationAdapter.fromPreview({ previewRoute: preview.route, destination: realDestination, currentLocation: { ...origin, accuracy: 5, observedAtMs: Date.now() } });
    expect(oldRoute.instructions.length).toBeGreaterThan(4);

    useAppStore.setState({ settings: { ...initialStoreState.settings, autoReroute: false } });
    seedRunningNavigation(realDestination, oldRoute, oldRoute.instructions);
    const hook = await renderHook(() => useNavigationViewModelV2());
    // Midway between the 3rd and 4th instruction boundaries.
    const a = oldRoute.coordinates[oldRoute.instructions[2].routeIndex];
    const b = oldRoute.coordinates[oldRoute.instructions[3].routeIndex];
    await publish({ latitude: (a.latitude + b.latitude) / 2, longitude: (a.longitude + b.longitude) / 2 });
    const staleIndex = hook.result.current.currentStepIndex;
    expect(staleIndex).toBeGreaterThanOrEqual(2);

    await act(() => hook.result.current.retryOutsideRoute());
    await waitFor(() => expect(useAppStore.getState().reroutePending).toBe(false), { timeout: 10_000 });
    const next = useAppStore.getState().activeRoute as V2ActiveRoute;
    expect(next).not.toBe(oldRoute);

    const fresh = calculateLiveManeuverDistanceV2({ route: next, currentStepIndex: 0, progressMeters: 0 });
    expect(hook.result.current.currentStepIndex).toBe(fresh.stepIndex);
    expect(hook.result.current.currentStepIndex).toBeLessThan(staleIndex);
    expect(hook.result.current.maneuverDistance).toBeCloseTo(fresh.maneuverDistanceM, 0);
    expect(hook.result.current.arrived).toBe(false);
  });
});

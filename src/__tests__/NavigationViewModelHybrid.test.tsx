import type { Place, V2ActiveRoute } from '../models/types';
import { LANDMARK_PLACES } from '../constants/data';
import { V2DirectionsService } from '../services/V2DirectionsService';
import { V2NavigationAdapter } from '../services/V2NavigationAdapter';
import { createProductionOutsideRouteSource } from '../services/outsideRouting/ProductionOutsideRouteSource';
import { useAppStore } from '../store/useAppStore';
import { useNavigationViewModelV2 } from '../viewmodels/NavigationViewModelV2';
import { act, renderHook, waitFor } from './test-utils';

const initialStoreState = useAppStore.getState();
const origin = { latitude: 24.9762, longitude: 67.011 };
const destination: Place = {
  id: 'B34',
  name: 'Block 34',
  category: 'Block',
  description: 'Block 34',
  coordinate: { latitude: 24.966, longitude: 67.004 },
  sourceVersion: 'v2',
};

// This suite's own async assertions (retryOutsideRoute, selectOutsideGate, ...) each run a
// real hybrid preview calculation and can legitimately take longer than Jest's 5s default —
// scoped to this file only (not jest.config.js's global testTimeout), because this file
// genuinely does more real work per test than a typical unit test. This is separate from, and
// intentionally larger than, the waitFor(..., { timeout }) values below: those should fail on
// their own with a specific "condition never became true" message well before this outer bound
// would ever fire — previously both used the *same* 5s figure, so under any load the two would
// race and this suite could fail with a generic Jest timeout instead of a diagnosable one.
jest.setTimeout(15_000);

// The real hybrid-OSM fixture computed below is deterministic for a fixed origin/destination
// and is never mutated in place by anything under test — every VM action that changes the
// active route calls setActiveRoute(...) with a *new* object rather than mutating this one (see
// NavigationViewModelV2.ts). Computing it once here instead of inside beforeEach (as before)
// means the suite pays for one real routing computation per run, not one per test — this was
// the actual source of this suite's load-sensitivity, not the waitFor timeouts themselves.
let sharedActiveRoute: V2ActiveRoute;

beforeAll(async () => {
  delete process.env.EXPO_PUBLIC_IJTEMA_ROUTING_PROXY_BASE_URL;
  process.env.EXPO_PUBLIC_USE_IJTEMA_V2_ROUTING = 'true';
  const preview = await V2DirectionsService.calculateHybridPreview({
    request: { startPlace: null, destination, currentLocation: origin, forceOutside: true },
    token: { requestId: 'navigation-initial', requestVersion: 1 },
    signal: new AbortController().signal,
    outsideProvider: createProductionOutsideRouteSource({ googleProxyBaseUrl: undefined }),
  });
  if (preview.status !== 'ready' || !preview.route) throw new Error('Hybrid navigation fixture must resolve.');
  sharedActiveRoute = V2NavigationAdapter.fromPreview({
    previewRoute: preview.route,
    destination,
    currentLocation: origin,
  });
});

beforeEach(() => {
  delete process.env.EXPO_PUBLIC_IJTEMA_ROUTING_PROXY_BASE_URL;
  process.env.EXPO_PUBLIC_USE_IJTEMA_V2_ROUTING = 'true';
  useAppStore.setState(initialStoreState, true);
  useAppStore.getState().startNavigation(destination, sharedActiveRoute, sharedActiveRoute.instructions);
  useAppStore.setState({ currentLocation: origin, currentLocationSource: 'live' });
});

describe('NavigationViewModelV2 hybrid rerouting', () => {
  test('preserves Facility place and metadata across hybrid reroute', async () => {
    const facility = LANDMARK_PLACES.find((place) => place.id === 'LM_MASJID_MAIN')!;
    const insidePreview = V2DirectionsService.calculatePreview({
      startPlace: null,
      destination: facility,
      currentLocation: { latitude: 24.966, longitude: 67.004 },
    });
    expect(insidePreview.status).toBe('ready');
    const facilityRoute = V2NavigationAdapter.fromPreview({
      previewRoute: insidePreview.route!,
      destination: facility,
      currentLocation: { latitude: 24.966, longitude: 67.004 },
    });
    useAppStore.getState().startNavigation(facility, facilityRoute, facilityRoute.instructions);
    useAppStore.setState({
      currentLocation: origin,
      currentLocationSource: 'live',
    });
    const previewSpy = jest.spyOn(V2DirectionsService, 'calculateHybridPreview');
    const hook = await renderHook(() => useNavigationViewModelV2());

    await act(() => hook.result.current.retryOutsideRoute());
    await waitFor(() => expect(hook.result.current.reroutePending).toBe(false), { timeout: 5_000 });

    expect(previewSpy).toHaveBeenCalledWith(expect.objectContaining({
      request: expect.objectContaining({
        destination: expect.objectContaining({
          id: 'LM_MASJID_MAIN',
          name: 'Main Masjid',
          category: 'Masjid',
          sourceVersion: 'v1',
        }),
      }),
    }));
    expect(useAppStore.getState().activeRoute).toMatchObject({
      destination: {
        type: 'facility',
        facilityId: 'LM_MASJID_MAIN',
        entryNodeId: 'P6',
        label: 'Main Masjid',
      },
    });
    previewSpy.mockRestore();
  });

  test('explicit retry uses hybrid flow and keeps navigation active', async () => {
    const hook = await renderHook(() => useNavigationViewModelV2());

    await act(() => hook.result.current.retryOutsideRoute());
    await waitFor(() => expect(hook.result.current.reroutePending).toBe(false), { timeout: 5_000 });

    expect(hook.result.current.route?.outsideRoute?.provider).toBe('offline-osm');
    expect(useAppStore.getState().isNavigating).toBe(true);
  });

  test('manual Gate 12 reroute stays authoritative', async () => {
    const hook = await renderHook(() => useNavigationViewModelV2());

    await act(() => hook.result.current.selectOutsideGate('GATE_12'));
    await waitFor(() => expect(hook.result.current.route?.startResolution?.gate?.id).toBe('GATE_12'), { timeout: 5_000 });

    expect(hook.result.current.route?.outsideRoute?.gateId).toBe('GATE_12');
    expect(hook.result.current.manualGateId).toBe('GATE_12');
    expect(useAppStore.getState().isNavigating).toBe(true);
  });

  test('retains current active route when replacement routing is unavailable', async () => {
    const routeBeforeRetry = useAppStore.getState().activeRoute;
    const previewSpy = jest.spyOn(V2DirectionsService, 'calculateHybridPreview').mockResolvedValueOnce({
      status: 'unavailable',
      route: null,
      instructions: [],
      message: 'Road routing is unavailable for this request.',
    });
    const hook = await renderHook(() => useNavigationViewModelV2());

    await act(() => hook.result.current.retryOutsideRoute());

    expect(useAppStore.getState().activeRoute).toBe(routeBeforeRetry);
    expect(useAppStore.getState().isNavigating).toBe(true);
    expect(hook.result.current.rerouteStatusMessage).toBe('Could not find a better route. Continuing current route.');
    previewSpy.mockRestore();
  });

  test('retains current active route when provider orchestration throws unexpectedly', async () => {
    const routeBeforeRetry = useAppStore.getState().activeRoute;
    const previewSpy = jest.spyOn(V2DirectionsService, 'calculateHybridPreview').mockRejectedValueOnce(new Error('provider exploded'));
    const hook = await renderHook(() => useNavigationViewModelV2());

    await act(() => hook.result.current.retryOutsideRoute());

    expect(useAppStore.getState().activeRoute).toBe(routeBeforeRetry);
    expect(hook.result.current.reroutePending).toBe(false);
    expect(hook.result.current.rerouteStatusMessage).toBe('Could not find a better route. Continuing current route.');
    previewSpy.mockRestore();
  });

  test('rapid GPS updates cannot start overlapping automatic outside reroutes', async () => {
    let resolvePreview: ((value: Awaited<ReturnType<typeof V2DirectionsService.calculateHybridPreview>>) => void) | undefined;
    const pendingPreview = new Promise<Awaited<ReturnType<typeof V2DirectionsService.calculateHybridPreview>>>((resolve) => {
      resolvePreview = resolve;
    });
    const previewSpy = jest.spyOn(V2DirectionsService, 'calculateHybridPreview').mockReturnValue(pendingPreview);
    await renderHook(() => useNavigationViewModelV2());
    const offRoutePoints = [
      { latitude: 24.9850, longitude: 67.0200, accuracy: 5 },
      { latitude: 24.9852, longitude: 67.0200, accuracy: 5 },
      { latitude: 24.9854, longitude: 67.0200, accuracy: 5 },
      { latitude: 24.9856, longitude: 67.0200, accuracy: 5 },
    ];

    for (const point of offRoutePoints) {
      await act(async () => useAppStore.setState({ currentLocation: point, currentLocationSource: 'live' }));
    }

    expect(previewSpy).toHaveBeenCalledTimes(1);
    resolvePreview?.({ status: 'unavailable', route: null, instructions: [], message: 'No replacement.' });
    await waitFor(() => expect(useAppStore.getState().reroutePending).toBe(false));
    previewSpy.mockRestore();
  });

  // NEW-01 R1: real hook, realistic pedestrian GPS cadence (~2m/fix — GPSManagerService's own
  // navigation-mode distanceInterval). "Moved distance" evidence measured between consecutive
  // fixes never crosses shouldTriggerReroute's 12m gate at this cadence even after sustained
  // off-route walking; it must be measured cumulatively from a stable off-route anchor instead.
  test('R1: sustained 2m-cadence off-route walking triggers exactly one automatic reroute', async () => {
    const previewSpy = jest
      .spyOn(V2DirectionsService, 'calculateHybridPreview')
      .mockResolvedValue({ status: 'unavailable', route: null, instructions: [], message: 'No replacement.' });
    await renderHook(() => useNavigationViewModelV2());

    const metersPerDegLat = 111320;
    const baseLat = 24.985;
    const longitude = 67.02;
    const stepMeters = 2;
    const steps = 18; // 18 * 2m = 36m cumulative anchor displacement, well past the 12m bar

    for (let i = 0; i < steps; i++) {
      const point = { latitude: baseLat + (i * stepMeters) / metersPerDegLat, longitude, accuracy: 5 };
      await act(async () => useAppStore.setState({ currentLocation: point, currentLocationSource: 'live' }));
    }

    expect(previewSpy).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(useAppStore.getState().reroutePending).toBe(false));
    previewSpy.mockRestore();
  });

  // NEW-01 R2: bounded GPS jitter around a fixed off-route point (never more than ~10m from the
  // anchor, well under the 12m evidence gate) must never accumulate into a reroute, however many
  // fixes arrive — proves the anchor model rejects noise instead of just rejecting slow movement.
  test('R2: bounded stationary GPS jitter does not trigger an automatic reroute', async () => {
    const previewSpy = jest
      .spyOn(V2DirectionsService, 'calculateHybridPreview')
      .mockResolvedValue({ status: 'unavailable', route: null, instructions: [], message: 'No replacement.' });
    await renderHook(() => useNavigationViewModelV2());

    const metersPerDegLat = 111320;
    const baseLat = 24.985;
    const longitude = 67.02;
    const jitterOffsetsM = [0, 3, -2, 4, -3, 2, -4, 3, -1, 4, -2, 3];

    for (const offsetM of jitterOffsetsM) {
      const point = { latitude: baseLat + offsetM / metersPerDegLat, longitude, accuracy: 5 };
      await act(async () => useAppStore.setState({ currentLocation: point, currentLocationSource: 'live' }));
    }

    expect(previewSpy).not.toHaveBeenCalled();
    previewSpy.mockRestore();
  });

  // NEW-01 R4: off-route evidence must restart from zero once the user returns on-route — a
  // stale anchor surviving the return could let a short second excursion look, from the OLD
  // anchor's point of view, like it already crossed the 12m bar.
  test('R4: returning on-route resets the off-route anchor for the next excursion', async () => {
    const previewSpy = jest
      .spyOn(V2DirectionsService, 'calculateHybridPreview')
      .mockResolvedValue({ status: 'unavailable', route: null, instructions: [], message: 'No replacement.' });
    await renderHook(() => useNavigationViewModelV2());

    const metersPerDegLat = 111320;
    const farAnchor = { latitude: 24.985, longitude: 67.02 }; // off-route, per R1 above
    // ~15m north of farAnchor — still off-route, and far enough from farAnchor that measuring
    // from the STALE anchor (bug) vs the reset anchor (fix) gives different verdicts below.
    const secondExcursionStart = { latitude: farAnchor.latitude + 15 / metersPerDegLat, longitude: farAnchor.longitude };

    // First excursion: one off-route fix, anchored at farAnchor.
    await act(async () => useAppStore.setState({
      currentLocation: { ...farAnchor, accuracy: 5 },
      currentLocationSource: 'live',
    }));

    // Return on-route: resets count/timer/anchor.
    await act(async () => useAppStore.setState({ currentLocation: { ...origin, accuracy: 5 }, currentLocationSource: 'live' }));
    expect(previewSpy).not.toHaveBeenCalled();

    // Second excursion: 3 fixes (satisfies the count>=3 gate) drifting only ~2m total from its
    // own start — under 12m from the correct (reset) anchor, but ~15-17m from the stale one.
    for (const stepM of [0, 1, 2]) {
      const point = {
        latitude: secondExcursionStart.latitude + stepM / metersPerDegLat,
        longitude: secondExcursionStart.longitude,
        accuracy: 5,
      };
      await act(async () => useAppStore.setState({ currentLocation: point, currentLocationSource: 'live' }));
    }

    expect(previewSpy).not.toHaveBeenCalled();
    previewSpy.mockRestore();
  });

  // NEW-01 R5: off-route evidence from a trip that ended (Done/Cancel) before reaching the
  // reroute gates must not seed the very next trip — otherwise a leftover count/anchor could
  // combine with the new trip's first real fix into a false-positive reroute.
  test('R5: off-route evidence does not survive Done/Cancel into the next trip', async () => {
    const previewSpy = jest
      .spyOn(V2DirectionsService, 'calculateHybridPreview')
      .mockResolvedValue({ status: 'unavailable', route: null, instructions: [], message: 'No replacement.' });
    const hook = await renderHook(() => useNavigationViewModelV2());

    // Trip A: 2 off-route fixes (below the count>=3 gate) far from trip B's route, then Done.
    const staleAnchor = { latitude: 24.99, longitude: 67.03 };
    await act(async () => useAppStore.setState({ currentLocation: { ...staleAnchor, accuracy: 5 }, currentLocationSource: 'live' }));
    await act(async () => useAppStore.setState({
      currentLocation: { latitude: staleAnchor.latitude + 3 / 111320, longitude: staleAnchor.longitude, accuracy: 5 },
      currentLocationSource: 'live',
    }));
    expect(previewSpy).not.toHaveBeenCalled();
    await act(async () => hook.result.current.handleExit());

    // Trip B: fresh route, first fix is off-route and far from staleAnchor. If evidence leaked,
    // this single fix would push count to 3 (2 + 1) with a huge stale-anchor distance — an
    // immediate false reroute on the very first fix of the new trip.
    await act(async () => {
      useAppStore.getState().startNavigation(destination, sharedActiveRoute, sharedActiveRoute.instructions);
      useAppStore.setState({ currentLocation: { latitude: 24.985, longitude: 67.02, accuracy: 5 }, currentLocationSource: 'live' });
    });

    expect(previewSpy).not.toHaveBeenCalled();
    previewSpy.mockRestore();
  });

  // NEW-01 R6: a successful reroute must reset the anchor relative to the replacement route —
  // otherwise leftover pre-reroute evidence could immediately re-fire against the new route.
  test('R6: a successful reroute resets off-route evidence for the replacement route', async () => {
    const previewSpy = jest.spyOn(V2DirectionsService, 'calculateHybridPreview').mockResolvedValue({
      status: 'ready',
      route: sharedActiveRoute,
      instructions: sharedActiveRoute.instructions,
    } as Awaited<ReturnType<typeof V2DirectionsService.calculateHybridPreview>>);
    await renderHook(() => useNavigationViewModelV2());

    const metersPerDegLat = 111320;
    const baseLat = 24.985;
    const longitude = 67.02;

    for (let i = 0; i < 18; i++) {
      const point = { latitude: baseLat + (i * 2) / metersPerDegLat, longitude, accuracy: 5 };
      await act(async () => useAppStore.setState({ currentLocation: point, currentLocationSource: 'live' }));
    }
    await waitFor(() => expect(useAppStore.getState().reroutePending).toBe(false));
    expect(previewSpy).toHaveBeenCalledTimes(1);

    // One more off-route fix right after the successful reroute: if evidence weren't reset, this
    // alone (count already >=3, anchor already far away) could immediately re-fire.
    await act(async () => useAppStore.setState({
      currentLocation: { latitude: baseLat + (18 * 2) / metersPerDegLat, longitude, accuracy: 5 },
      currentLocationSource: 'live',
    }));

    expect(previewSpy).toHaveBeenCalledTimes(1);
    previewSpy.mockRestore();
  });

  // NEW-01 R8: NEW-04's ARRIVED latch is terminal — sustained off-route drift after arrival must
  // never accumulate reroute evidence, start a timer, move the anchor, or request a reroute.
  test('R8: sustained off-route drift after ARRIVED triggers zero automatic reroutes', async () => {
    const previewSpy = jest
      .spyOn(V2DirectionsService, 'calculateHybridPreview')
      .mockResolvedValue({ status: 'unavailable', route: null, instructions: [], message: 'No replacement.' });
    const hook = await renderHook(() => useNavigationViewModelV2());

    // Arrive at the destination first.
    await act(async () => useAppStore.setState({
      currentLocation: { ...sharedActiveRoute.destination.coordinate, accuracy: 10 },
      currentLocationSource: 'live',
    }));
    expect(hook.result.current.arrived).toBe(true);

    // Same 2m-cadence off-route walk that triggers a reroute pre-arrival (R1) — now must not.
    const metersPerDegLat = 111320;
    const baseLat = 24.985;
    const longitude = 67.02;
    for (let i = 0; i < 18; i++) {
      const point = { latitude: baseLat + (i * 2) / metersPerDegLat, longitude, accuracy: 5 };
      await act(async () => useAppStore.setState({ currentLocation: point, currentLocationSource: 'live' }));
    }

    expect(previewSpy).not.toHaveBeenCalled();
    expect(hook.result.current.arrived).toBe(true);
    previewSpy.mockRestore();
  });

  // NEW-03: a manually selected outside entry gate is user routing intent for the whole
  // navigation session, not a one-shot property of a single calculated route. The automatic
  // NEW-01 off-route reroute at the location-watch effect's `void attemptReroute(currentLocation)`
  // call (no RerouteOptions) must still honor it, same as the explicit retryOutsideRoute() path.
  describe('NEW-03: manual gate retention through automatic reroute', () => {
    // selectOutsideGate() itself runs a reroute (setting lastRerouteAtRef), and the automatic
    // path's own evidence gate refuses to fire inside REROUTE_COOLDOWN_MS (25s) of the last
    // reroute — real, correct anti-flap behavior, not part of what NEW-03 is testing. Spying on
    // Date.now() (not full fake timers, which would also stall RTL's waitFor polling) lets each
    // test fast-forward past that cooldown between steps while keeping real promise/timer
    // scheduling intact.
    let dateNowSpy: jest.SpyInstance<number, []>;
    let simulatedNowMs: number;
    const COOLDOWN_CLEAR_MS = 26_000;

    beforeEach(() => {
      simulatedNowMs = Date.now();
      dateNowSpy = jest.spyOn(Date, 'now').mockImplementation(() => simulatedNowMs);
    });

    afterEach(() => {
      dateNowSpy.mockRestore();
    });

    test('M2: automatic off-route reroute request still carries the manually selected gate', async () => {
      const previewSpy = jest
        .spyOn(V2DirectionsService, 'calculateHybridPreview')
        .mockResolvedValue({ status: 'unavailable', route: null, instructions: [], message: 'No replacement.' });
      const hook = await renderHook(() => useNavigationViewModelV2());

      await act(() => hook.result.current.selectOutsideGate('GATE_12'));
      await waitFor(() => expect(hook.result.current.manualGateId).toBe('GATE_12'));
      previewSpy.mockClear();
      simulatedNowMs += COOLDOWN_CLEAR_MS;

      // Same sustained 2m-cadence off-route walk as R1 above — proven to cross the automatic
      // reroute evidence bar while never leaving the outside branch of attemptReroute.
      const metersPerDegLat = 111320;
      const baseLat = 24.985;
      const longitude = 67.02;
      for (let i = 0; i < 18; i++) {
        const point = { latitude: baseLat + (i * 2) / metersPerDegLat, longitude, accuracy: 5 };
        await act(async () => useAppStore.setState({ currentLocation: point, currentLocationSource: 'live' }));
      }
      await waitFor(() => expect(useAppStore.getState().reroutePending).toBe(false));

      expect(previewSpy).toHaveBeenCalledTimes(1);
      expect(previewSpy).toHaveBeenCalledWith(expect.objectContaining({
        request: expect.objectContaining({ manualGateId: 'GATE_12' }),
      }));
      previewSpy.mockRestore();
    });

    test('M3: a second automatic reroute after the first still carries the manually selected gate', async () => {
      const previewSpy = jest
        .spyOn(V2DirectionsService, 'calculateHybridPreview')
        .mockResolvedValue({ status: 'unavailable', route: null, instructions: [], message: 'No replacement.' });
      const hook = await renderHook(() => useNavigationViewModelV2());

      await act(() => hook.result.current.selectOutsideGate('GATE_12'));
      await waitFor(() => expect(hook.result.current.manualGateId).toBe('GATE_12'));
      previewSpy.mockClear();
      simulatedNowMs += COOLDOWN_CLEAR_MS;

      const metersPerDegLat = 111320;
      const baseLat = 24.985;
      const longitude = 67.02;
      for (let i = 0; i < 18; i++) {
        const point = { latitude: baseLat + (i * 2) / metersPerDegLat, longitude, accuracy: 5 };
        await act(async () => useAppStore.setState({ currentLocation: point, currentLocationSource: 'live' }));
      }
      await waitFor(() => expect(useAppStore.getState().reroutePending).toBe(false));
      expect(previewSpy).toHaveBeenCalledTimes(1);

      // Return on-route to reset the off-route anchor (per R4), clear cooldown again, then drift
      // off-route far enough from the reset anchor for a second reroute.
      await act(async () => useAppStore.setState({ currentLocation: origin, currentLocationSource: 'live' }));
      simulatedNowMs += COOLDOWN_CLEAR_MS;
      const secondBaseLat = 24.986;
      for (let i = 0; i < 18; i++) {
        const point = { latitude: secondBaseLat + (i * 2) / metersPerDegLat, longitude, accuracy: 5 };
        await act(async () => useAppStore.setState({ currentLocation: point, currentLocationSource: 'live' }));
      }
      await waitFor(() => expect(useAppStore.getState().reroutePending).toBe(false));

      expect(previewSpy).toHaveBeenCalledTimes(2);
      for (const call of previewSpy.mock.calls) {
        expect(call[0]).toMatchObject({ request: expect.objectContaining({ manualGateId: 'GATE_12' }) });
      }
      previewSpy.mockRestore();
    });

    test('M5/M6: manual gate survives a failed automatic reroute and the following explicit retry', async () => {
      const previewSpy = jest
        .spyOn(V2DirectionsService, 'calculateHybridPreview')
        .mockResolvedValue({ status: 'unavailable', route: null, instructions: [], message: 'No replacement.' });
      const hook = await renderHook(() => useNavigationViewModelV2());

      await act(() => hook.result.current.selectOutsideGate('GATE_12'));
      await waitFor(() => expect(hook.result.current.manualGateId).toBe('GATE_12'));
      previewSpy.mockClear();
      simulatedNowMs += COOLDOWN_CLEAR_MS;

      const metersPerDegLat = 111320;
      const baseLat = 24.985;
      const longitude = 67.02;
      for (let i = 0; i < 18; i++) {
        const point = { latitude: baseLat + (i * 2) / metersPerDegLat, longitude, accuracy: 5 };
        await act(async () => useAppStore.setState({ currentLocation: point, currentLocationSource: 'live' }));
      }
      await waitFor(() => expect(useAppStore.getState().reroutePending).toBe(false));
      expect(previewSpy).toHaveBeenCalledTimes(1);
      // Failure keeps current route/session intent — manualGateId state must be untouched.
      expect(hook.result.current.manualGateId).toBe('GATE_12');

      await act(() => hook.result.current.retryOutsideRoute());
      await waitFor(() => expect(hook.result.current.reroutePending).toBe(false));

      expect(previewSpy).toHaveBeenCalledTimes(2);
      expect(previewSpy).toHaveBeenLastCalledWith(expect.objectContaining({
        request: expect.objectContaining({ manualGateId: 'GATE_12' }),
      }));
      previewSpy.mockRestore();
    });

    test('M1: a manual gate baked into the initial route seeds session intent without selectOutsideGate', async () => {
      const preview = await V2DirectionsService.calculateHybridPreview({
        request: {
          startPlace: null,
          destination,
          currentLocation: origin,
          forceOutside: true,
          manualGateId: 'GATE_12',
        },
        token: { requestId: 'manual-gate-initial', requestVersion: 1 },
        signal: new AbortController().signal,
        outsideProvider: createProductionOutsideRouteSource({ googleProxyBaseUrl: undefined }),
      });
      if (preview.status !== 'ready' || !preview.route) throw new Error('Manual Gate 12 fixture must resolve.');
      const manualGateRoute = V2NavigationAdapter.fromPreview({
        previewRoute: preview.route,
        destination,
        currentLocation: origin,
      });
      expect(manualGateRoute.origin.manuallySelectedGate).toBe(true);
      expect(manualGateRoute.origin.gateId).toBe('GATE_12');

      useAppStore.getState().startNavigation(destination, manualGateRoute, manualGateRoute.instructions);
      useAppStore.setState({ currentLocation: origin, currentLocationSource: 'live' });
      const hook = await renderHook(() => useNavigationViewModelV2());

      // No selectOutsideGate() call anywhere — the pick came entirely from the preview route.
      expect(hook.result.current.manualGateId).toBe('GATE_12');
    });

    test('M7: explicitly picking a different gate replaces the prior manual gate with no leak', async () => {
      const previewSpy = jest
        .spyOn(V2DirectionsService, 'calculateHybridPreview')
        .mockResolvedValue({ status: 'unavailable', route: null, instructions: [], message: 'No replacement.' });
      const hook = await renderHook(() => useNavigationViewModelV2());

      await act(() => hook.result.current.selectOutsideGate('GATE_12'));
      await waitFor(() => expect(hook.result.current.manualGateId).toBe('GATE_12'));
      previewSpy.mockClear();

      await act(() => hook.result.current.selectOutsideGate('GATE_20'));
      await waitFor(() => expect(hook.result.current.manualGateId).toBe('GATE_20'));

      expect(previewSpy).toHaveBeenLastCalledWith(expect.objectContaining({
        request: expect.objectContaining({ manualGateId: 'GATE_20' }),
      }));
      simulatedNowMs += COOLDOWN_CLEAR_MS;
      previewSpy.mockClear();

      const metersPerDegLat = 111320;
      const baseLat = 24.985;
      const longitude = 67.02;
      for (let i = 0; i < 18; i++) {
        const point = { latitude: baseLat + (i * 2) / metersPerDegLat, longitude, accuracy: 5 };
        await act(async () => useAppStore.setState({ currentLocation: point, currentLocationSource: 'live' }));
      }
      await waitFor(() => expect(useAppStore.getState().reroutePending).toBe(false));

      expect(previewSpy).toHaveBeenCalledTimes(1);
      expect(previewSpy).toHaveBeenCalledWith(expect.objectContaining({
        request: expect.objectContaining({ manualGateId: 'GATE_20' }),
      }));
      previewSpy.mockRestore();
    });

    test('M8: a stale manual gate from a finished trip does not leak into a fresh automatic-mode trip', async () => {
      const previewSpy = jest
        .spyOn(V2DirectionsService, 'calculateHybridPreview')
        .mockResolvedValue({ status: 'unavailable', route: null, instructions: [], message: 'No replacement.' });
      const hook = await renderHook(() => useNavigationViewModelV2());

      await act(() => hook.result.current.selectOutsideGate('GATE_12'));
      await waitFor(() => expect(hook.result.current.manualGateId).toBe('GATE_12'));

      await act(async () => hook.result.current.handleExit());

      // New trip, no manual gate chosen — starts a fresh navigationSessionId.
      await act(async () => {
        useAppStore.getState().startNavigation(destination, sharedActiveRoute, sharedActiveRoute.instructions);
        useAppStore.setState({ currentLocation: origin, currentLocationSource: 'live' });
      });

      expect(hook.result.current.manualGateId).toBeNull();
      previewSpy.mockRestore();
    });

    test('M10: automatic gate mode (no manual selection) is unaffected — automatic reroute still omits manualGateId', async () => {
      const previewSpy = jest
        .spyOn(V2DirectionsService, 'calculateHybridPreview')
        .mockResolvedValue({ status: 'unavailable', route: null, instructions: [], message: 'No replacement.' });
      await renderHook(() => useNavigationViewModelV2());

      const metersPerDegLat = 111320;
      const baseLat = 24.985;
      const longitude = 67.02;
      for (let i = 0; i < 18; i++) {
        const point = { latitude: baseLat + (i * 2) / metersPerDegLat, longitude, accuracy: 5 };
        await act(async () => useAppStore.setState({ currentLocation: point, currentLocationSource: 'live' }));
      }
      await waitFor(() => expect(useAppStore.getState().reroutePending).toBe(false));

      expect(previewSpy).toHaveBeenCalledTimes(1);
      expect(previewSpy).toHaveBeenCalledWith(expect.objectContaining({
        request: expect.objectContaining({ manualGateId: undefined }),
      }));
      previewSpy.mockRestore();
    });
  });
});

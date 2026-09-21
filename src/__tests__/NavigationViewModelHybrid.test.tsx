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

  // #60: consecutive-fix distance is capped near zero by GPSManagerService's own navigation-mode
  // distanceInterval (~2m), so gating reroute evidence on fix-to-fix displacement makes the 12m
  // movement bar unreachable at realistic pedestrian cadence even while genuinely off-route.
  test('sustained short-step off-route walking accumulates evidence and reroutes once', async () => {
    const previewSpy = jest
      .spyOn(V2DirectionsService, 'calculateHybridPreview')
      .mockResolvedValue({ status: 'unavailable', route: null, instructions: [], message: 'No replacement.' });
    await renderHook(() => useNavigationViewModelV2());

    const metersPerDegLat = 111320;
    const baseLat = 24.985;
    const longitude = 67.02;
    const stepMeters = 2;
    const steps = 18; // 18 * 2m = 36m, well past the 12m bar, each single-fix hop far under it

    for (let i = 0; i < steps; i++) {
      const point = { latitude: baseLat + (i * stepMeters) / metersPerDegLat, longitude, accuracy: 5 };
      await act(async () => useAppStore.setState({ currentLocation: point, currentLocationSource: 'live' }));
    }

    expect(previewSpy).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(useAppStore.getState().reroutePending).toBe(false));
    previewSpy.mockRestore();
  });

  // #60: off-route evidence (consecutive-fix count + accumulated anchor distance) is
  // session-scoped bookkeeping and must not survive into a newly started trip — otherwise a
  // near-threshold streak from the trip just finished could fire a reroute on the very first
  // fix of the next one.
  test('starting a new trip does not inherit off-route evidence from the previous one', async () => {
    const previewSpy = jest
      .spyOn(V2DirectionsService, 'calculateHybridPreview')
      .mockResolvedValue({ status: 'unavailable', route: null, instructions: [], message: 'No replacement.' });
    await renderHook(() => useNavigationViewModelV2());

    // Two short-step (~2m) off-route fixes on trip A — builds up count/anchor bookkeeping
    // without itself crossing the 12m movement bar, so trip A never reroutes on its own.
    const metersPerDegLat = 111320;
    const tripAPoints = [
      { latitude: 24.985, longitude: 67.02, accuracy: 5 },
      { latitude: 24.985 + 2 / metersPerDegLat, longitude: 67.02, accuracy: 5 },
    ];
    for (const point of tripAPoints) {
      await act(async () => useAppStore.setState({ currentLocation: point, currentLocationSource: 'live' }));
    }

    // End trip A and start a new trip on the SAME route/destination — same off-route geometry
    // as trip A (so the fix below is unambiguously off-route again), but a fresh session.
    // Deliberately do NOT feed an on-route fix in between: that would itself reset the
    // count/anchor via the existing "back on route" branch and mask the bug under test. This
    // models a trip whose very first live fix is already off-route.
    await act(async () => useAppStore.getState().stopNavigation());
    await act(async () =>
      useAppStore.getState().startNavigation(destination, sharedActiveRoute, sharedActiveRoute.instructions),
    );

    // One large off-route jump as the new trip's first fix — far enough from trip A's last
    // point (~556m) that a per-fix (not just cumulative) distance check would also clear 12m.
    // If trip A's count survived, this is the 3rd consecutive off-route fix, and distance
    // against a stale (or wrongly-live) anchor from trip A would clear 12m too — both
    // shouldTriggerReroute conditions would be met.
    await act(async () =>
      useAppStore.setState({
        currentLocation: { latitude: 24.99, longitude: 67.02, accuracy: 5 },
        currentLocationSource: 'live',
      }),
    );

    expect(previewSpy).not.toHaveBeenCalled();
    previewSpy.mockRestore();
  });
});

import { computeDestinationPoint } from 'geolib';
import type { Place, V2ActiveRoute } from '../models/types';
import { V2DirectionsService } from '../services/V2DirectionsService';
import { V2NavigationAdapter } from '../services/V2NavigationAdapter';
import { createProductionOutsideRouteSource } from '../services/outsideRouting/ProductionOutsideRouteSource';
import { useAppStore } from '../store/useAppStore';
import { useNavigationViewModelV2 } from '../viewmodels/NavigationViewModelV2';
import { act, renderHook, RenderHookResult, waitFor } from './test-utils';

const initialStoreState = useAppStore.getState();
const origin = { latitude: 24.9762, longitude: 67.011 };
const destinationPlace: Place = {
  id: 'B34',
  name: 'Block 34',
  category: 'Block',
  description: 'Block 34',
  coordinate: { latitude: 24.966, longitude: 67.004 },
  sourceVersion: 'v2',
};

jest.setTimeout(15_000);

let sharedActiveRoute: V2ActiveRoute;

beforeAll(async () => {
  delete process.env.EXPO_PUBLIC_IJTEMA_ROUTING_PROXY_BASE_URL;
  process.env.EXPO_PUBLIC_USE_IJTEMA_V2_ROUTING = 'true';
  const preview = await V2DirectionsService.calculateHybridPreview({
    request: { startPlace: null, destination: destinationPlace, currentLocation: origin, forceOutside: true },
    token: { requestId: 'navigation-arrival', requestVersion: 1 },
    signal: new AbortController().signal,
    outsideProvider: createProductionOutsideRouteSource({ googleProxyBaseUrl: undefined }),
  });
  if (preview.status !== 'ready' || !preview.route) throw new Error('Hybrid navigation fixture must resolve.');
  sharedActiveRoute = V2NavigationAdapter.fromPreview({
    previewRoute: preview.route,
    destination: destinationPlace,
    currentLocation: origin,
  });
});

beforeEach(() => {
  delete process.env.EXPO_PUBLIC_IJTEMA_ROUTING_PROXY_BASE_URL;
  process.env.EXPO_PUBLIC_USE_IJTEMA_V2_ROUTING = 'true';
  useAppStore.setState(initialStoreState, true);
  useAppStore.getState().startNavigation(destinationPlace, sharedActiveRoute, sharedActiveRoute.instructions);
  useAppStore.setState({ currentLocation: origin, currentLocationSource: 'live' });
});

type Hook = RenderHookResult<ReturnType<typeof useNavigationViewModelV2>, unknown>;

function nearDestination(distanceM: number, bearing: number) {
  if (distanceM === 0) return { ...sharedActiveRoute.destination.coordinate };
  return computeDestinationPoint(sharedActiveRoute.destination.coordinate, distanceM, bearing);
}

// Pushes one live-navigation GPS fix through the real store -> real hook path (the same
// currentLocation write GPSManagerService performs in production) and returns the resulting
// `arrived` value.
async function pushFix(hook: Hook, distanceM: number, accuracy: number, bearing = 45) {
  const point = nearDestination(distanceM, bearing);
  await act(async () => {
    useAppStore.setState({
      currentLocation: { latitude: point.latitude, longitude: point.longitude, accuracy },
      currentLocationSource: 'live',
    });
  });
  return hook.result.current.arrived;
}

function rerouteWithinSameSession() {
  const rerouted: V2ActiveRoute = { ...sharedActiveRoute, routeId: `${sharedActiveRoute.routeId}-rerouted` };
  return act(async () => useAppStore.getState().setActiveRoute(rerouted));
}

describe('NavigationViewModelV2 arrival latch', () => {
  test('1. dist<20 & accuracy<15 arrives immediately on one fix', async () => {
    const hook = await renderHook(() => useNavigationViewModelV2());
    await pushFix(hook, 10, 10);
    expect(hook.result.current.arrived).toBe(true);
  });

  test('2. accuracy=15 fast path arrives on one fix', async () => {
    const hook = await renderHook(() => useNavigationViewModelV2());
    await pushFix(hook, 10, 15);
    expect(hook.result.current.arrived).toBe(true);
  });

  test('3. accuracy=20 requires two consecutive fixes', async () => {
    const hook = await renderHook(() => useNavigationViewModelV2());
    await pushFix(hook, 10, 20);
    expect(hook.result.current.arrived).toBe(false);
    await pushFix(hook, 10, 20, 46);
    expect(hook.result.current.arrived).toBe(true);
  });

  test('4. accuracy=25 requires two consecutive fixes', async () => {
    const hook = await renderHook(() => useNavigationViewModelV2());
    await pushFix(hook, 10, 25);
    expect(hook.result.current.arrived).toBe(false);
    await pushFix(hook, 10, 25, 46);
    expect(hook.result.current.arrived).toBe(true);
  });

  test('5. accuracy=26 never arrives, even repeated', async () => {
    const hook = await renderHook(() => useNavigationViewModelV2());
    for (let i = 0; i < 5; i += 1) {
      await pushFix(hook, 10, 26, 45 + i);
      expect(hook.result.current.arrived).toBe(false);
    }
  });

  test('6. accuracy=30 at destination stays false', async () => {
    const hook = await renderHook(() => useNavigationViewModelV2());
    await pushFix(hook, 10, 30);
    expect(hook.result.current.arrived).toBe(false);
  });

  test('7. accuracy=50 at destination stays false', async () => {
    const hook = await renderHook(() => useNavigationViewModelV2());
    await pushFix(hook, 10, 50);
    expect(hook.result.current.arrived).toBe(false);
  });

  test('8. accuracy=60/100 at destination stays false', async () => {
    const hook = await renderHook(() => useNavigationViewModelV2());
    await pushFix(hook, 10, 60);
    expect(hook.result.current.arrived).toBe(false);
    await pushFix(hook, 10, 100, 90);
    expect(hook.result.current.arrived).toBe(false);
  });

  test('9. moderate + bad-accuracy + moderate stays false (accuracy break resets pending evidence)', async () => {
    const hook = await renderHook(() => useNavigationViewModelV2());
    await pushFix(hook, 10, 22);
    expect(hook.result.current.arrived).toBe(false);
    await pushFix(hook, 10, 30, 46);
    expect(hook.result.current.arrived).toBe(false);
    await pushFix(hook, 10, 22, 47);
    expect(hook.result.current.arrived).toBe(false);
  });

  test('consecutive-evidence rule: out-of-radius fix between two qualifying fixes resets pending evidence', async () => {
    const hook = await renderHook(() => useNavigationViewModelV2());
    await pushFix(hook, 10, 22);
    expect(hook.result.current.arrived).toBe(false);
    await pushFix(hook, 60, 22, 46);
    expect(hook.result.current.arrived).toBe(false);
    await pushFix(hook, 10, 22, 47);
    expect(hook.result.current.arrived).toBe(false);
  });

  test('a fix swallowed by the poor-accuracy-movement filter does not reset pending corroboration', async () => {
    const hook = await renderHook(() => useNavigationViewModelV2());
    await pushFix(hook, 10, 22);
    expect(hook.result.current.arrived).toBe(false);
    // accuracy>50 and (near-zero) movement from the last accepted fix is swallowed by
    // shouldIgnorePoorAccuracyMovementV2 before arrival is ever evaluated for it — it must not
    // count as a disqualifying observation.
    await pushFix(hook, 10, 90);
    expect(hook.result.current.arrived).toBe(false);
    await pushFix(hook, 10, 22, 46);
    expect(hook.result.current.arrived).toBe(true);
  });

  test('reroute through the real production pipeline clears pending corroboration even when the new routeId coincides with the old one', async () => {
    // RoutingServiceV2 derives routeId deterministically from the resolved start/end graph
    // nodes, so an in-venue reroute whose new start snaps to the same nearest node as the
    // current route produces an identical routeId — the route?.routeId-keyed effect would never
    // fire for that case. attemptReroute must clear pending corroboration itself, unconditionally,
    // not rely on routeId changing. Exercise the real inside-venue reroute path (not a
    // hand-mutated routeId) to prove it.
    const hook = await renderHook(() => useNavigationViewModelV2());
    await pushFix(hook, 10, 22);
    expect(hook.result.current.arrived).toBe(false);

    await act(async () => hook.result.current.retryOutsideRoute());
    await waitFor(() => expect(hook.result.current.reroutePending).toBe(false), { timeout: 5_000 });

    await pushFix(hook, 10, 22, 46);
    expect(hook.result.current.arrived).toBe(false);
  });

  test('10. weak fixes then a good (<=15m accuracy) fix arrives', async () => {
    const hook = await renderHook(() => useNavigationViewModelV2());
    await pushFix(hook, 10, 60);
    await pushFix(hook, 10, 100, 46);
    expect(hook.result.current.arrived).toBe(false);
    await pushFix(hook, 10, 12, 47);
    expect(hook.result.current.arrived).toBe(true);
  });

  test('11. arrived then 25-50m drift remains arrived', async () => {
    const hook = await renderHook(() => useNavigationViewModelV2());
    await pushFix(hook, 10, 10);
    expect(hook.result.current.arrived).toBe(true);
    await pushFix(hook, 40, 10, 46);
    expect(hook.result.current.arrived).toBe(true);
  });

  test('12. arrived then overshoot remains arrived', async () => {
    const hook = await renderHook(() => useNavigationViewModelV2());
    await pushFix(hook, 10, 10);
    expect(hook.result.current.arrived).toBe(true);
    await pushFix(hook, 80, 10, 200);
    expect(hook.result.current.arrived).toBe(true);
  });

  test('13. weak/stale-like recovery does not falsely arrive early', async () => {
    const hook = await renderHook(() => useNavigationViewModelV2());
    await pushFix(hook, 10, 100);
    await pushFix(hook, 60, 90, 46);
    await pushFix(hook, 10, 100, 47);
    expect(hook.result.current.arrived).toBe(false);
    await pushFix(hook, 10, 12, 48);
    expect(hook.result.current.arrived).toBe(true);
  });

  test('14. one moderate fix -> reroute -> next moderate fix alone stays false', async () => {
    const hook = await renderHook(() => useNavigationViewModelV2());
    await pushFix(hook, 10, 22);
    expect(hook.result.current.arrived).toBe(false);
    await rerouteWithinSameSession();
    await pushFix(hook, 10, 22, 46);
    expect(hook.result.current.arrived).toBe(false);
  });

  test('15. arrived -> reroute (routeId change) within same session remains arrived', async () => {
    const hook = await renderHook(() => useNavigationViewModelV2());
    await pushFix(hook, 10, 10);
    expect(hook.result.current.arrived).toBe(true);
    await rerouteWithinSameSession();
    expect(hook.result.current.arrived).toBe(true);
  });

  test('16. Done/cancel resets arrival', async () => {
    const hook = await renderHook(() => useNavigationViewModelV2());
    await pushFix(hook, 10, 10);
    expect(hook.result.current.arrived).toBe(true);
    await act(async () => useAppStore.getState().stopNavigation());
    expect(hook.result.current.arrived).toBe(false);
  });

  test('17. next navigationSessionId (new trip) resets arrival', async () => {
    const hook = await renderHook(() => useNavigationViewModelV2());
    await pushFix(hook, 10, 10);
    expect(hook.result.current.arrived).toBe(true);
    await act(async () =>
      useAppStore.getState().startNavigation(destinationPlace, sharedActiveRoute, sharedActiveRoute.instructions),
    );
    expect(hook.result.current.arrived).toBe(false);
  });

  test('18. repeated post-arrival qualifying fixes do not disturb the latch', async () => {
    const hook = await renderHook(() => useNavigationViewModelV2());
    await pushFix(hook, 10, 10);
    expect(hook.result.current.arrived).toBe(true);
    await pushFix(hook, 10, 10, 46);
    await pushFix(hook, 10, 12, 47);
    expect(hook.result.current.arrived).toBe(true);
  });
});

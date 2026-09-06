import type { Place, V2ActiveRoute } from '../models/types';
import { SearchService } from '../services/SearchService';
import { V2DirectionsService } from '../services/V2DirectionsService';
import { V2NavigationAdapter } from '../services/V2NavigationAdapter';
import { RoutingServiceV2 } from '../services/RoutingServiceV2';
import { destinationToRoutingV2 } from '../services/V2NavigationRuntimeService';
import { useAppStore } from '../store/useAppStore';
import { useNavigationViewModelV2 } from '../viewmodels/NavigationViewModelV2';
import { act, renderHook, waitFor } from './test-utils';

// NEW-02 regression: a reroute that fails to find a route must never reinterpret the
// destination as another type (the historical bug fell through to { type: 'block', blockId: '' }
// because destinationToRoutingV2 had no special_route branch). Exercises the real
// destination-reconstruction path (buildV2RerouteRequest -> RoutingServiceV2.calculateRoute)
// via the hook's retryOutsideRoute(), with RoutingServiceV2.calculateRoute mocked to fail using
// the same jest.spyOn seam already used on this service (see HomeScreenVenueStatus.test.tsx).

const initialStoreState = useAppStore.getState();
const gate08 = SearchService.search('Gate 08')[0];
const shahrNorth = SearchService.search('Shahr-e-Pindal North')[0] as Place;

jest.setTimeout(15_000);

let sharedActiveRoute: V2ActiveRoute;

beforeAll(() => {
  process.env.EXPO_PUBLIC_USE_IJTEMA_V2_ROUTING = 'true';
  const preview = V2DirectionsService.calculatePreview({
    startPlace: gate08,
    destination: shahrNorth,
    currentLocation: null,
    walkingSpeedMs: 1.4,
  });
  if (preview.status !== 'ready' || !preview.route) throw new Error('Shahr-e-Pindal North fixture must resolve.');
  sharedActiveRoute = V2NavigationAdapter.fromPreview({
    previewRoute: preview.route,
    destination: shahrNorth,
    startPlace: gate08,
  });
  expect(sharedActiveRoute.destination.type).toBe('special_route');
  expect(sharedActiveRoute.destination.specialRouteId).toBe(shahrNorth.id);
});

beforeEach(() => {
  process.env.EXPO_PUBLIC_USE_IJTEMA_V2_ROUTING = 'true';
  useAppStore.setState(initialStoreState, true);
  useAppStore.getState().startNavigation(shahrNorth, sharedActiveRoute, sharedActiveRoute.instructions);
  useAppStore.setState({ currentLocation: sharedActiveRoute.destination.coordinate, currentLocationSource: 'live' });
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('Shahr-e-Pindal reroute failure preserves destination identity (NEW-02)', () => {
  test('failed reroute keeps special_route/North identity; retry request still carries it', async () => {
    const calculateRouteSpy = jest.spyOn(RoutingServiceV2, 'calculateRoute').mockReturnValue(null);
    const hook = await renderHook(() => useNavigationViewModelV2());

    // First reroute attempt fails (mocked).
    await act(async () => hook.result.current.retryOutsideRoute());
    await waitFor(() => expect(hook.result.current.reroutePending).toBe(false));

    expect(hook.result.current.rerouteStatusMessage).toBe(
      'Could not find a better route. Continuing current route.',
    );
    // Session destination identity must be untouched by the failure.
    const afterFirstFailure = useAppStore.getState().activeRoute!;
    expect(afterFirstFailure.destination.type).toBe('special_route');
    expect(afterFirstFailure.destination.specialRouteId).toBe(shahrNorth.id);
    expect(afterFirstFailure.routeId).toBe(sharedActiveRoute.routeId);

    // Second (retry) reroute attempt fails again (still mocked).
    await act(async () => hook.result.current.retryOutsideRoute());
    await waitFor(() => expect(hook.result.current.reroutePending).toBe(false));

    // Both calculateRoute calls (initial + retry) must have received a special_route
    // destination with the exact North canonical id — never a block/gate/rasta fallback,
    // never an empty blockId.
    expect(calculateRouteSpy).toHaveBeenCalledTimes(2);
    for (const call of calculateRouteSpy.mock.calls) {
      const request = call[0] as { destination: { type: string; blockId?: string; routeId?: string } };
      expect(request.destination.type).toBe('special_route');
      expect(request.destination.routeId).toBe(shahrNorth.id);
      expect(request.destination.blockId).toBeUndefined();
    }

    const afterRetryFailure = useAppStore.getState().activeRoute!;
    expect(afterRetryFailure.destination.type).toBe('special_route');
    expect(afterRetryFailure.destination.specialRouteId).toBe(shahrNorth.id);

    // The current session destination, reconstructed via the real conversion path, must
    // still resolve to special_route/North — never block/gate/rasta, never an empty blockId.
    const currentAsRoutingDestination = destinationToRoutingV2(afterRetryFailure);
    expect(currentAsRoutingDestination.type).toBe('special_route');
    expect((currentAsRoutingDestination as { routeId: string }).routeId).toBe(shahrNorth.id);
  });
});

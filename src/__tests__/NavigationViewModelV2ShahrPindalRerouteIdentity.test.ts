import { seedRunningNavigation } from './navigationFixture';
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { getDistance } from 'geolib';
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
const inVenueWalker = (SearchService.search('Block 1')[0] as Place).coordinate;

const VARIANTS = ['North', 'South', 'West'] as const;
type Variant = (typeof VARIANTS)[number];

const placesByVariant: Record<Variant, Place> = {
  North: SearchService.search('Shahr-e-Pindal North')[0] as Place,
  South: SearchService.search('Shahr-e-Pindal South')[0] as Place,
  West: SearchService.search('Shahr-e-Pindal West')[0] as Place,
};

jest.setTimeout(15_000);

const routesByVariant = {} as Record<Variant, V2ActiveRoute>;

beforeAll(() => {
  process.env.EXPO_PUBLIC_USE_IJTEMA_V2_ROUTING = 'true';
  for (const variant of VARIANTS) {
    const destination = placesByVariant[variant];
    const preview = V2DirectionsService.calculatePreview({
      startPlace: gate08,
      destination,
      currentLocation: null,
      walkingSpeedMs: 1.4,
    });
    if (preview.status !== 'ready' || !preview.route) throw new Error(`Shahr-e-Pindal ${variant} fixture must resolve.`);
    const activeRoute = V2NavigationAdapter.fromPreview({
      previewRoute: preview.route,
      destination,
      startPlace: gate08,
    });
    expect(activeRoute.destination.type).toBe('special_route');
    expect(activeRoute.destination.specialRouteId).toBe(destination.id);
    routesByVariant[variant] = activeRoute;
  }
});

function startVariant(variant: Variant) {
  const destination = placesByVariant[variant];
  const activeRoute = routesByVariant[variant];
  useAppStore.setState(initialStoreState, true);
  seedRunningNavigation(destination, activeRoute, activeRoute.instructions);
  // An in-venue walker well outside the 20 m arrival radius: a fix on the destination would be an arrival (A5-02),
  // which forbids reroutes.
  expect(getDistance(inVenueWalker, activeRoute.destination.coordinate)).toBeGreaterThan(50);
  useAppStore.setState({ currentLocation: { ...inVenueWalker, accuracy: 5, observedAtMs: Date.now() }, currentLocationSource: 'live' });
  return { destination, activeRoute };
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe('Shahr-e-Pindal reroute failure preserves destination identity (NEW-02 / AUD-02)', () => {
  test.each(VARIANTS)('failed reroute keeps special_route/%s identity; retry request still carries it', async (variant) => {
    process.env.EXPO_PUBLIC_USE_IJTEMA_V2_ROUTING = 'true';
    const { destination, activeRoute: sharedActiveRoute } = startVariant(variant);
    const calculateRouteSpy = jest.spyOn(RoutingServiceV2, 'calculateRoute').mockReturnValue(null);
    const hook = await renderHook(() => useNavigationViewModelV2());

    // First reroute attempt fails (mocked).
    await act(async () => hook.result.current.retryOutsideRoute());
    await waitFor(() => expect(hook.result.current.reroutePending).toBe(false));

    expect(hook.result.current.rerouteStatusMessage).toBe(
      'Keep following the current route.',
    );
    // Session destination identity must be untouched by the failure.
    const afterFirstFailure = useAppStore.getState().activeRoute!;
    expect(afterFirstFailure.destination.type).toBe('special_route');
    expect(afterFirstFailure.destination.specialRouteId).toBe(destination.id);
    expect(afterFirstFailure.routeId).toBe(sharedActiveRoute.routeId);

    // Second (retry) reroute attempt fails again (still mocked).
    await act(async () => hook.result.current.retryOutsideRoute());
    await waitFor(() => expect(hook.result.current.reroutePending).toBe(false));

    // Both calculateRoute calls (initial + retry) must have received a special_route
    // destination with the exact canonical id for this variant — never a block/gate/rasta
    // fallback, never an empty blockId.
    expect(calculateRouteSpy).toHaveBeenCalledTimes(2);
    for (const call of calculateRouteSpy.mock.calls) {
      const request = call[0] as { destination: { type: string; blockId?: string; routeId?: string } };
      expect(request.destination.type).toBe('special_route');
      expect(request.destination.routeId).toBe(destination.id);
      expect(request.destination.blockId).toBeUndefined();
    }

    const afterRetryFailure = useAppStore.getState().activeRoute!;
    expect(afterRetryFailure.destination.type).toBe('special_route');
    expect(afterRetryFailure.destination.specialRouteId).toBe(destination.id);

    // The current session destination, reconstructed via the real conversion path, must
    // still resolve to special_route/this variant — never block/gate/rasta, never an empty blockId.
    const currentAsRoutingDestination = destinationToRoutingV2(afterRetryFailure);
    expect(currentAsRoutingDestination.type).toBe('special_route');
    expect((currentAsRoutingDestination as { routeId: string }).routeId).toBe(destination.id);
  });
});

describe('Shahr-e-Pindal successful reroute preserves destination identity (AUD-02)', () => {
  test('a reroute that DOES find a replacement route still carries special_route/North identity through to the new active route', async () => {
    process.env.EXPO_PUBLIC_USE_IJTEMA_V2_ROUTING = 'true';
    const { destination, activeRoute: sharedActiveRoute } = startVariant('North');
    const replacementRoute: V2ActiveRoute = {
      ...sharedActiveRoute,
      routeId: `${sharedActiveRoute.routeId}-rerouted`,
    };
    const calculateRouteSpy = jest.spyOn(RoutingServiceV2, 'calculateRoute').mockReturnValue(replacementRoute);
    const hook = await renderHook(() => useNavigationViewModelV2());

    await act(async () => hook.result.current.retryOutsideRoute());
    await waitFor(() => expect(hook.result.current.reroutePending).toBe(false));

    expect(calculateRouteSpy).toHaveBeenCalledTimes(1);
    const request = calculateRouteSpy.mock.calls[0][0] as { destination: { type: string; blockId?: string; routeId?: string } };
    expect(request.destination.type).toBe('special_route');
    expect(request.destination.routeId).toBe(destination.id);
    expect(request.destination.blockId).toBeUndefined();

    // The reroute pipeline derives its own routeId deterministically rather than passing the
    // mocked return value through untouched — the contract this test protects is destination
    // identity, not routeId pass-through fidelity.
    const afterSuccess = useAppStore.getState().activeRoute!;
    expect(afterSuccess.destination.type).toBe('special_route');
    expect(afterSuccess.destination.specialRouteId).toBe(destination.id);
  });
});

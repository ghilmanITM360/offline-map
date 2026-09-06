/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Place, RouteAlternative, RoutePreview } from '../models/types';
import { useAppStore } from '../store/useAppStore';
import { RoutingService } from '../services/RoutingService';
import { InstructionService } from '../services/InstructionService';
import { useDirectionsViewModel } from '../viewmodels/DirectionsViewModel';
import { act, renderHook, waitFor } from './test-utils';

// P1-A/P1-B stabilization coverage: activeRoute/routeInstructions in the global store must
// always mirror the ViewModel's own local route/instructions state (never stale in either
// direction), and an older in-flight calculateRoute() request must never overwrite state a
// newer one already committed. See DirectionsViewModel.ts calculateRoute's resetRouteState()
// and requestGenerationRef.

const initialStoreState = useAppStore.getState();
const origin = { latitude: 24.9762, longitude: 67.011 };

function legacyPlace(id: string): Place {
  return {
    id,
    name: id,
    category: 'CustomPoint',
    description: id,
    coordinate: origin,
    sourceVersion: 'v1',
  };
}

function fakeRoute(nodeIds: string[]): RoutePreview {
  return {
    sourceVersion: 'v1',
    id: `route-${nodeIds.join('-')}`,
    coordinates: [origin, origin],
    nodes: nodeIds,
    totalDistance: 100,
    estimatedTimeMin: 2,
    segments: [],
  };
}

beforeEach(() => {
  useAppStore.setState(initialStoreState, true);
  useAppStore.setState({
    currentLocation: origin,
    currentLocationSource: 'live',
    lastKnownLocation: origin,
  });
  jest.spyOn(RoutingService, 'isInsideVenue').mockReturnValue(true);
  jest.spyOn(InstructionService, 'generateInstructions').mockReturnValue([
    { id: 'i1', text: 'Continue', distance: 10, type: 'straight', coordinate: origin },
  ]);
});

afterEach(() => {
  jest.restoreAllMocks();
});

function mockNodeResolution(destId: string) {
  jest.spyOn(RoutingService, 'resolveDestinationNodesFromPlace').mockReturnValue([destId]);
  jest.spyOn(RoutingService, 'explainRouteNodeResolution').mockReturnValue({
    startNodeIds: ['START'],
    targetNodeIds: [destId],
  } as ReturnType<typeof RoutingService.explainRouteNodeResolution>);
}

describe('DirectionsViewModel — route ownership (local/global) and stale-request guard', () => {
  test('1. successful calculation sets both local route and global activeRoute', async () => {
    const destA = legacyPlace('DEST_A');
    mockNodeResolution('DEST_A');
    const alts: RouteAlternative[] = [{ label: 'Fastest', labelUr: 'تیز ترین', route: fakeRoute(['START', 'DEST_A']) }];
    jest.spyOn(RoutingService, 'calculateRoutes').mockReturnValue(alts);

    const hook = await renderHook(() => useDirectionsViewModel(destA));
    await waitFor(() => expect(hook.result.current.loadState).toBe('ready'));

    expect(hook.result.current.route).toBe(alts[0].route);
    expect(useAppStore.getState().activeRoute).toBe(alts[0].route);
  });

  test('2. a failed calculation clears both local route and global activeRoute — no stale route survives', async () => {
    const destA = legacyPlace('DEST_A');
    mockNodeResolution('DEST_A');
    const alts: RouteAlternative[] = [{ label: 'Fastest', labelUr: 'تیز ترین', route: fakeRoute(['START', 'DEST_A']) }];
    const calcSpy = jest.spyOn(RoutingService, 'calculateRoutes').mockReturnValue(alts);

    const hook = await renderHook((dest: Place | null) => useDirectionsViewModel(dest), { initialProps: destA });
    await waitFor(() => expect(hook.result.current.loadState).toBe('ready'));
    expect(useAppStore.getState().activeRoute).toBe(alts[0].route);

    // Next calculation for the same destination finds no usable route.
    calcSpy.mockReturnValue([]);
    await act(() => hook.result.current.calculateRoute());

    await waitFor(() => expect(hook.result.current.loadState).toBe('error'));
    expect(hook.result.current.route).toBeNull();
    expect(useAppStore.getState().activeRoute).toBeNull();
  });

  test('3. destination change immediately invalidates the previous route in both local and global state', async () => {
    const destA = legacyPlace('DEST_A');
    mockNodeResolution('DEST_A');
    jest.spyOn(RoutingService, 'calculateRoutes').mockReturnValue([
      { label: 'Fastest', labelUr: 'تیز ترین', route: fakeRoute(['START', 'DEST_A']) },
    ]);

    const hook = await renderHook((dest: Place | null) => useDirectionsViewModel(dest), { initialProps: destA });
    await waitFor(() => expect(hook.result.current.loadState).toBe('ready'));
    expect(useAppStore.getState().activeRoute).not.toBeNull();

    // Switching to a destination with no resolvable route (no node-resolution mock configured
    // for it — resolveDestinationNodesFromPlace/explainRouteNodeResolution keep returning
    // DEST_A's plan, which is a same-pair once matched against the new id) must not leave the
    // old route/global state behind.
    const destB = legacyPlace('DEST_B');
    jest.spyOn(RoutingService, 'explainRouteNodeResolution').mockReturnValue({
      startNodeIds: ['DEST_B'],
      targetNodeIds: ['DEST_B'],
    } as ReturnType<typeof RoutingService.explainRouteNodeResolution>);
    await act(() => hook.rerender(destB));

    await waitFor(() => expect(hook.result.current.loadState).toBe('error'));
    expect(hook.result.current.route).toBeNull();
    expect(useAppStore.getState().activeRoute).toBeNull();
  });

  test('4. cancelling the route (destination cleared) clears local and global route state together', async () => {
    const destA = legacyPlace('DEST_A');
    mockNodeResolution('DEST_A');
    jest.spyOn(RoutingService, 'calculateRoutes').mockReturnValue([
      { label: 'Fastest', labelUr: 'تیز ترین', route: fakeRoute(['START', 'DEST_A']) },
    ]);

    const hook = await renderHook((dest: Place | null) => useDirectionsViewModel(dest), { initialProps: destA as Place | null });
    await waitFor(() => expect(hook.result.current.loadState).toBe('ready'));

    await act(() => hook.rerender(null));

    await waitFor(() => expect(hook.result.current.loadState).toBe('error'));
    expect(hook.result.current.route).toBeNull();
    expect(useAppStore.getState().activeRoute).toBeNull();
  });

  test('5. an older in-flight request cannot overwrite a newer one that already completed (race guard)', async () => {
    const destA = legacyPlace('DEST_A');
    const destB = legacyPlace('DEST_B');
    const routeA: RouteAlternative[] = [{ label: 'Fastest', labelUr: 'تیز ترین', route: fakeRoute(['START', 'DEST_A']) }];
    const routeB: RouteAlternative[] = [{ label: 'Fastest', labelUr: 'تیز ترین', route: fakeRoute(['START', 'DEST_B']) }];

    let resolveA: (alts: RouteAlternative[]) => void = () => {};
    const deferredA = new Promise<RouteAlternative[]>((resolve) => {
      resolveA = resolve;
    });

    jest.spyOn(RoutingService, 'resolveDestinationNodesFromPlace').mockImplementation((place) => [place.id]);
    jest.spyOn(RoutingService, 'explainRouteNodeResolution').mockImplementation((_origin, destNodeIds) => ({
      startNodeIds: ['START'],
      targetNodeIds: destNodeIds,
    } as ReturnType<typeof RoutingService.explainRouteNodeResolution>));
    jest.spyOn(RoutingService, 'calculateRoutes').mockImplementation((_origin, destNodeIds) => {
      // Destination A's underlying computation is slow (deferred); destination B's resolves
      // immediately — reproducing "A starts, B starts and finishes first, A finishes late".
      if (destNodeIds[0] === 'DEST_A') return deferredA as unknown as RouteAlternative[];
      return routeB;
    });

    const hook = await renderHook((dest: Place | null) => useDirectionsViewModel(dest), { initialProps: destA });
    await waitFor(() => expect(hook.result.current.loadState).toBe('loading'));

    await act(() => hook.rerender(destB));
    await waitFor(() => expect(hook.result.current.loadState).toBe('ready'));
    expect(hook.result.current.route).toBe(routeB[0].route);
    expect(useAppStore.getState().activeRoute).toBe(routeB[0].route);

    // Destination A's stale request now resolves — it must be a no-op.
    await act(async () => {
      resolveA(routeA);
      await deferredA;
    });

    expect(hook.result.current.route).toBe(routeB[0].route);
    expect(hook.result.current.loadState).toBe('ready');
    expect(useAppStore.getState().activeRoute).toBe(routeB[0].route);
  });

  test('6. closing directions while a route is in flight prevents the unmounted request from publishing stale route state', async () => {
    const destA = legacyPlace('DEST_A');
    const routeA: RouteAlternative[] = [{ label: 'Fastest', labelUr: 'تیز ترین', route: fakeRoute(['START', 'DEST_A']) }];
    let resolveA: (alts: RouteAlternative[]) => void = () => {};
    const deferredA = new Promise<RouteAlternative[]>((resolve) => {
      resolveA = resolve;
    });
    mockNodeResolution('DEST_A');
    jest.spyOn(RoutingService, 'calculateRoutes').mockReturnValue(deferredA as unknown as RouteAlternative[]);

    const hook = await renderHook(() => useDirectionsViewModel(destA));
    await waitFor(() => expect(hook.result.current.loadState).toBe('loading'));

    await hook.unmount();
    await act(async () => {
      resolveA(routeA);
      await deferredA;
    });

    expect(useAppStore.getState().activeRoute).toBeNull();
    expect(useAppStore.getState().routeInstructions).toEqual([]);
  });
});

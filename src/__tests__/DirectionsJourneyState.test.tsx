/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// The Directions view model exposes the one authoritative journey state, and offers a start only for a ready route.

import { outsideGuideSummary } from '../services/JourneyPresentationState';
import { V2PlaceAdapter } from '../services/V2PlaceAdapter';
import { V2DirectionsService } from '../services/V2DirectionsService';
import { useAppStore } from '../store/useAppStore';
import { useDirectionsViewModel } from '../viewmodels/DirectionsViewModel';
import type { Place } from '../models/types';
import { act, renderHook, waitFor } from './test-utils';

const initialStoreState = useAppStore.getState();
const destination = V2PlaceAdapter.getPlaceById('B1')!;
const insideStart = V2PlaceAdapter.getPlaceById('B27')!;
const farOutside: Place = {
  id: 'far-outside',
  name: 'Far outside',
  category: 'CustomPoint',
  description: 'A point outside the street-graph coverage',
  coordinate: { latitude: 24.9, longitude: 67.01 },
  sourceVersion: 'v1',
};
const liveInside = () => ({ latitude: 24.9636, longitude: 67.0063, accuracy: 8, observedAtMs: Date.now() });

beforeEach(() => {
  delete process.env.EXPO_PUBLIC_IJTEMA_ROUTING_PROXY_BASE_URL;
  process.env.EXPO_PUBLIC_USE_IJTEMA_V2_ROUTING = 'true';
  useAppStore.setState(initialStoreState, true);
  useAppStore.setState({ currentLocation: null, currentLocationSource: null, hasLocationPermission: true, locationPermissionPrecision: 'fine' });
});
afterEach(() => jest.restoreAllMocks());

describe('journey state exposed by the Directions view model', () => {
  test('destination only: NEEDS_START, and nothing is startable', async () => {
    const hook = await renderHook(() => useDirectionsViewModel(destination));
    await waitFor(() => expect(hook.result.current.journeyState).toBe('NEEDS_START'));
    expect(hook.result.current.startAction).toBeNull();
    expect(hook.result.current.canStartNavigation).toBe(false);
  });

  test('a fresh live fix: LIVE_READY with the live Start Navigation action', async () => {
    useAppStore.setState({ currentLocation: liveInside(), currentLocationSource: 'live' });
    const hook = await renderHook(() => useDirectionsViewModel(destination));
    await waitFor(() => expect(hook.result.current.journeyState).toBe('LIVE_READY'), { timeout: 8_000 });
    expect(hook.result.current.startAction?.kind).toBe('start');
    expect(hook.result.current.canStartNavigation).toBe(true);
  });

  test('a chosen start: MANUAL_GUIDE_READY, a route guide that can never start live navigation', async () => {
    const hook = await renderHook(() => useDirectionsViewModel(destination));
    await act(async () => hook.result.current.setManualStartPlace(insideStart));
    await waitFor(() => expect(hook.result.current.journeyState).toBe('MANUAL_GUIDE_READY'), { timeout: 8_000 });
    expect(hook.result.current.startAction?.kind).toBe('route_guide');
    expect(hook.result.current.canStartNavigation).toBe(false);
  });

  test('a start far outside: OUTSIDE_VENUE_GUIDE, whose distance is the straight line to the gate, not a walk', async () => {
    const hook = await renderHook(() => useDirectionsViewModel(destination));
    await act(async () => hook.result.current.setManualStartPlace(farOutside));
    await waitFor(() => expect(hook.result.current.journeyState).toBe('OUTSIDE_VENUE_GUIDE'), { timeout: 8_000 });

    const route = hook.result.current.route as NonNullable<typeof hook.result.current.route> & {
      outsideRoute: { provider: string; distanceM: number; gateId: string; distanceKind: string; roadFollowing: boolean };
      startConnectorDistanceM: number;
      routeCostM: number;
    };
    expect(route.outsideRoute).toMatchObject({ provider: 'direct-guide', distanceKind: 'direct-distance', roadFollowing: false });
    expect(outsideGuideSummary(route as never)).toEqual({
      gateId: route.outsideRoute.gateId,
      straightLineDistanceM: Math.round(route.outsideRoute.distanceM),
    });
    // The displayed total is physical metres (straight line + the walk inside); the selection cost is a separate
    // field that also carries gate penalties and is never shown as a distance.
    expect(route.totalDistance).toBeGreaterThan(route.outsideRoute.distanceM);
    expect(route.startConnectorDistanceM).toBeGreaterThanOrEqual(route.outsideRoute.distanceM);
    expect(typeof route.routeCostM).toBe('number');
  });

  test('a real outside walking route is not an outside guide', async () => {
    const hook = await renderHook(() => useDirectionsViewModel(destination));
    const nearOutside: Place = { ...farOutside, id: 'near-outside', coordinate: { latitude: 24.9762, longitude: 67.011 } };
    await act(async () => hook.result.current.setManualStartPlace(nearOutside));
    await waitFor(() => expect(hook.result.current.route).not.toBeNull(), { timeout: 8_000 });
    expect(hook.result.current.route?.outsideRoute?.provider).toBe('offline-osm');
    expect(hook.result.current.journeyState).toBe('MANUAL_GUIDE_READY');
    expect(outsideGuideSummary(hook.result.current.route as never)).toBeNull();
  });

  test('same place: SAME_PLACE and nothing is startable', async () => {
    const hook = await renderHook(() => useDirectionsViewModel(destination));
    await act(async () => hook.result.current.setManualStartPlace(destination));
    await waitFor(() => expect(hook.result.current.journeyState).toBe('SAME_PLACE'));
    expect(hook.result.current.startAction).toBeNull();
    expect(hook.result.current.canStartNavigation).toBe(false);
  });

  test('route failure: ROUTE_FAILURE and no startable action', async () => {
    jest.spyOn(V2DirectionsService, 'calculatePreview').mockReturnValue({
      status: 'unavailable', route: null, instructions: [], message: "We couldn't find a walking route.",
    });
    const hook = await renderHook(() => useDirectionsViewModel(destination));
    await act(async () => hook.result.current.setManualStartPlace(insideStart));
    await waitFor(() => expect(hook.result.current.journeyState).toBe('ROUTE_FAILURE'));
    expect(hook.result.current.startAction).toBeNull();
    expect(hook.result.current.canStartNavigation).toBe(false);
  });
});

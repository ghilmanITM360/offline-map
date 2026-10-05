/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// #95: the legacy V1 Block path used to report arrival from a flat 20m distance to the destination
// alone, so an earlier leg that passes near the destination ended the trip with hundreds of metres
// of route left. V2 already requires final-leg progress; V1 must require that the user's progress
// along the route has reached the end of the route, not just that the raw fix is close.

import * as Location from 'expo-location';
import { getDistance } from 'geolib';
import type { Coordinate, Place, V1RoutePreview } from '../models/types';
import { GPSManagerService } from '../services/GPSManagerService';
import { useAppStore } from '../store/useAppStore';
import { useNavigationViewModel } from '../viewmodels/NavigationViewModel';
import { act, renderHook } from './test-utils';

const initialStoreState = useAppStore.getState();
const coordinates: Coordinate[] = [
  { latitude: 24.965, longitude: 67.0041 },
  // This early leg passes about 10m from the destination, then turns away.
  { latitude: 24.966, longitude: 67.0041 },
  { latitude: 24.967, longitude: 67.006 },
  { latitude: 24.966, longitude: 67.006 },
  { latitude: 24.966, longitude: 67.004 },
];
const destination: Place = {
  id: 'arrival-loop', name: 'Loop destination', category: 'Block',
  description: 'Synthetic route fixture', coordinate: coordinates[4],
};
const totalDistance = coordinates.slice(1).reduce(
  (total, coordinate, index) => total + getDistance(coordinates[index], coordinate), 0,
);
const route: V1RoutePreview = {
  id: 'arrival-loop', sourceVersion: 'v1', coordinates, nodes: [], segments: [],
  totalDistance, estimatedTimeMin: 10,
};

const publish = (c: Coordinate) =>
  (GPSManagerService as unknown as { publishFix(l: Location.LocationObject): void }).publishFix({
    coords: { latitude: c.latitude, longitude: c.longitude, heading: null, accuracy: 5 },
    timestamp: Date.now(),
  } as Location.LocationObject);

beforeEach(() => {
  useAppStore.setState(initialStoreState, true);
  useAppStore.setState({ currentLocation: coordinates[0], currentLocationSource: 'live' });
  useAppStore.getState().startNavigation(destination, route, []);
});

describe('V1 arrival requires route progress (#95)', () => {
  test('passing within 20m on an early leg does not report arrival', async () => {
    const hook = await renderHook(() => useNavigationViewModel());
    await act(async () => publish(coordinates[1]));
    expect(hook.result.current.remainingDistance).toBeGreaterThan(300);
    expect(hook.result.current.arrived).toBe(false);
  });

  test('walking the whole route then reaching the destination reports arrival', async () => {
    const hook = await renderHook(() => useNavigationViewModel());
    for (const c of coordinates.slice(1)) {
      await act(async () => publish(c));
    }
    expect(hook.result.current.arrived).toBe(true);
  });

  test('a fix on the final leg within 20m of the destination reports arrival', async () => {
    const hook = await renderHook(() => useNavigationViewModel());
    await act(async () => publish(coordinates[3]));
    await act(async () => publish({ latitude: 24.966, longitude: 67.00405 }));
    expect(hook.result.current.arrived).toBe(true);
  });
});

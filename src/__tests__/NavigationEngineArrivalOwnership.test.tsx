import { seedRunningNavigation } from './navigationFixture';
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// #305: HomeScreen mounts both navigation engines and ORs their `arrived` flags into one global
// arrival. Only the engine that owns the active session may arrive. During a V2 journey the V1
// engine owns no route, so its progress guard (#95) has nothing to measure and used to wave a bare
// 20 m proximity through as arrival — clearing the recovery marker and announcing arrival early.

import * as Location from 'expo-location';
import type { Coordinate, Place, V2ActiveRoute, V1RoutePreview } from '../models/types';
import { GPSManagerService } from '../services/GPSManagerService';
import { useAppStore } from '../store/useAppStore';
import { useNavigationViewModel } from '../viewmodels/NavigationViewModel';
import { useNavigationViewModelV2 } from '../viewmodels/NavigationViewModelV2';
import { VoiceService } from '../services/VoiceService';
import { act, renderHook } from './test-utils';

jest.mock('../services/VoiceService', () => ({ VoiceService: { speak: jest.fn(), stop: jest.fn() } }));

const initialStoreState = useAppStore.getState();
const start: Coordinate = { latitude: 24.965, longitude: 67.0041 };
const destinationCoordinate: Coordinate = { latitude: 24.9662, longitude: 67.0041 };
const destination: Place = {
  id: 'ownership-dest', name: 'Ownership destination', category: 'Block',
  description: 'Synthetic fixture', coordinate: destinationCoordinate,
};

// Only `sourceVersion` decides ownership; the V1 hook never reads any other field of a V2 route.
const v2Route = { id: 'v2-route', sourceVersion: 'v2', totalDistanceM: 600, instructions: [] } as unknown as V2ActiveRoute;
const v1Route: V1RoutePreview = {
  id: 'v1-route', sourceVersion: 'v1', coordinates: [start, destinationCoordinate], nodes: [], segments: [],
  totalDistance: 134, estimatedTimeMin: 2,
};

const publish = (c: Coordinate) =>
  (GPSManagerService as unknown as { publishFix(l: Location.LocationObject): void }).publishFix({
    coords: { latitude: c.latitude, longitude: c.longitude, heading: null, accuracy: 5 },
    timestamp: Date.now(),
  } as Location.LocationObject);

beforeEach(() => {
  jest.clearAllMocks();
  useAppStore.setState(initialStoreState, true);
  useAppStore.setState({ currentLocation: start, currentLocationSource: 'live' });
});

describe('only the engine that owns the active session may arrive (#305)', () => {
  test('V1 stays idle during a V2 journey even when a fix lands on the destination', async () => {
    seedRunningNavigation(destination, v2Route, []);
    const hook = await renderHook(() => useNavigationViewModel());
    await act(async () => publish(destinationCoordinate));
    expect(hook.result.current.arrived).toBe(false);
    expect(useAppStore.getState().unfinishedJourney).not.toBeNull();
    expect(VoiceService.speak).not.toHaveBeenCalled();
  });

  test('V1 does not publish a snapped position over a V2 journey', async () => {
    seedRunningNavigation(destination, v2Route, []);
    useAppStore.setState({ snappedLocation: null });
    await renderHook(() => useNavigationViewModel());
    await act(async () => publish(destinationCoordinate));
    expect(useAppStore.getState().snappedLocation).toBeNull();
  });

  test('V2 stays idle during a V1 journey even when a fix lands on the destination', async () => {
    seedRunningNavigation(destination, v1Route, []);
    const hook = await renderHook(() => useNavigationViewModelV2());
    await act(async () => publish(destinationCoordinate));
    expect(hook.result.current.arrived).toBe(false);
  });

  test('V1 still arrives normally on a V1 journey', async () => {
    seedRunningNavigation(destination, v1Route, []);
    const hook = await renderHook(() => useNavigationViewModel());
    await act(async () => publish({ latitude: 24.9661, longitude: 67.0041 }));
    expect(hook.result.current.arrived).toBe(true);
    expect(useAppStore.getState().unfinishedJourney).toBeNull();
  });
});

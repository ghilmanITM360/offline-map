import { seedRunningNavigation } from './navigationFixture';
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// #188: queued V1 reroutes must not outlive their navigation session.

import * as Location from 'expo-location';
import type { Place } from '../models/types';
import { IJTEMA_DATA } from '../constants/data';
import { GPSManagerService } from '../services/GPSManagerService';
import { RoutingService } from '../services/RoutingService';
import { useAppStore } from '../store/useAppStore';
import { useNavigationViewModel } from '../viewmodels/NavigationViewModel';
import { act, renderHook } from './test-utils';

const initialStoreState = useAppStore.getState();
const origin = { latitude: IJTEMA_DATA.nodes.S1.lat, longitude: IJTEMA_DATA.nodes.S1.lng };
const block = IJTEMA_DATA.blocks.B1;
// No sourceVersion: a legacy destination, i.e. the V1 path.
const destination: Place = {
  id: block.id,
  name: block.name,
  category: 'Block',
  description: block.name,
  coordinate: block.center,
};

const METERS_PER_DEG_LAT = 111320;

const publish = (latitude: number, longitude: number) =>
  (GPSManagerService as unknown as { publishFix(l: Location.LocationObject): void }).publishFix({
    coords: { latitude, longitude, heading: null, accuracy: 5 },
    timestamp: Date.now(),
  } as Location.LocationObject);

// Sustained walk far off any route, 20m per fix, starting at `startLat`.
async function walkOffRoute(startLat: number) {
  for (let i = 0; i < 6; i++) {
    await act(async () => publish(startLat + (i * 20) / METERS_PER_DEG_LAT, 67.03));
  }
}

beforeEach(() => {
  useAppStore.setState(initialStoreState, true);
  useAppStore.setState({ currentLocation: origin, currentLocationSource: 'live' });
  seedRunningNavigation(destination);
});

describe('V1 queued reroute cancellation', () => {
  afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks(); });

  test('external stop cancels queued reroute before it rebuilds a retired destination', async () => {
    jest.useFakeTimers();
    const routeSpy = jest.spyOn(RoutingService, 'calculateRoute');
    await renderHook(() => useNavigationViewModel());
    routeSpy.mockClear();
    await walkOffRoute(24.985);
    expect(useAppStore.getState().reroutePending).toBe(true);
    await act(async () => useAppStore.getState().stopNavigation());
    await act(async () => jest.advanceTimersByTime(300));
    expect(routeSpy).not.toHaveBeenCalled();
    expect(useAppStore.getState().isNavigating).toBe(false);
  });

  test('replacement trip cancels queued work even when destination object is reused', async () => {
    jest.useFakeTimers();
    const routeSpy = jest.spyOn(RoutingService, 'calculateRoute');
    await renderHook(() => useNavigationViewModel());
    await walkOffRoute(24.985);
    expect(useAppStore.getState().reroutePending).toBe(true);
    await act(async () => {
      useAppStore.getState().stopNavigation();
      seedRunningNavigation(destination);
    });
    routeSpy.mockClear();
    await act(async () => jest.advanceTimersByTime(300));
    expect(routeSpy).not.toHaveBeenCalled();
    expect(useAppStore.getState().reroutePending).toBe(false);
  });

  test('unmount cancels queued reroute', async () => {
    jest.useFakeTimers();
    const routeSpy = jest.spyOn(RoutingService, 'calculateRoute');
    const hook = await renderHook(() => useNavigationViewModel());
    await walkOffRoute(24.985);
    expect(useAppStore.getState().reroutePending).toBe(true);
    routeSpy.mockClear();
    await hook.unmount();
    await act(async () => jest.advanceTimersByTime(300));
    expect(routeSpy).not.toHaveBeenCalled();
  });

  test('direct replacement retires pending state when old timer fires before effects flush', async () => {
    jest.useFakeTimers();
    const routeSpy = jest.spyOn(RoutingService, 'calculateRoute');
    await renderHook(() => useNavigationViewModel());
    await walkOffRoute(24.985);
    expect(useAppStore.getState().reroutePending).toBe(true);
    routeSpy.mockClear();
    await act(async () => {
      seedRunningNavigation(destination);
      jest.advanceTimersByTime(300);
    });
    // Replacement initializes its own route once, without the retired reroute's snapped node.
    expect(routeSpy).toHaveBeenCalledTimes(1);
    expect(routeSpy.mock.calls[0][2]).toBeUndefined();
    expect(useAppStore.getState().reroutePending).toBe(false);
  });
});

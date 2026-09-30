/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// #149: the legacy V1 NavigationViewModel must get the same lifecycle resets V2 got in
// #111 (arrival latch on exit) and #113 (reroute cooldown must not bleed into the next trip).

import * as Location from 'expo-location';
import type { Place } from '../models/types';
import { IJTEMA_DATA } from '../constants/data';
import { GPSManagerService } from '../services/GPSManagerService';
import { RoutingService } from '../services/RoutingService';
import { useAppStore } from '../store/useAppStore';
import { useNavigationViewModel } from '../viewmodels/NavigationViewModel';
import { act, renderHook, waitFor } from './test-utils';

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
  useAppStore.getState().startNavigation(destination);
});

describe('NavigationViewModel (V1) lifecycle resets (#149)', () => {
  test('handleExit clears arrived so the next render is not stuck in ARRIVAL', async () => {
    const hook = await renderHook(() => useNavigationViewModel());
    await act(async () => publish(block.center.latitude, block.center.longitude));
    expect(hook.result.current.arrived).toBe(true);

    await act(async () => hook.result.current.handleExit());

    expect(hook.result.current.arrived).toBe(false);
  });

  test('a started reroute completes: the pending timer survives its own status-message re-render', async () => {
    const routeSpy = jest.spyOn(RoutingService, 'calculateRoute');
    await renderHook(() => useNavigationViewModel());

    routeSpy.mockClear();
    await walkOffRoute(24.985);

    await waitFor(() => expect(routeSpy).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(useAppStore.getState().reroutePending).toBe(false));
    routeSpy.mockRestore();
  });

  test.each(['exit first', 'same destination object'])('reroute cooldown resets for a new trip: %s', async (restart) => {
    const routeSpy = jest.spyOn(RoutingService, 'calculateRoute');
    await renderHook(() => useNavigationViewModel());

    routeSpy.mockClear();
    await walkOffRoute(24.985);
    await waitFor(() => expect(routeSpy).toHaveBeenCalledTimes(1));

    // End trip A and start trip B at once, well inside the 25 s cooldown.
    if (restart === 'exit first') {
      await act(async () => useAppStore.getState().stopNavigation());
    }
    await act(async () => useAppStore.getState().startNavigation(destination));
    routeSpy.mockClear();

    await walkOffRoute(24.992);
    await waitFor(() => expect(routeSpy).toHaveBeenCalledTimes(1));
    routeSpy.mockRestore();
  });
});

test('same-object restart clears the previous trip arrival latch', async () => {
  const hook = await renderHook(() => useNavigationViewModel());
  await act(async () => publish(block.center.latitude, block.center.longitude));
  expect(hook.result.current.arrived).toBe(true);
  await act(async () => useAppStore.getState().startNavigation(destination));
  expect(hook.result.current.arrived).toBe(false);
});

test('same-object restart calculates its route from the current origin', async () => {
  const routeSpy = jest.spyOn(RoutingService, 'calculateRoute');
  await renderHook(() => useNavigationViewModel());
  const newOrigin = { latitude: origin.latitude + 0.0001, longitude: origin.longitude };
  await act(async () => useAppStore.setState({ currentLocation: newOrigin }));
  routeSpy.mockClear();
  await act(async () => useAppStore.getState().startNavigation(destination));
  expect(routeSpy).toHaveBeenCalledWith(newOrigin, expect.anything(), undefined, expect.any(Number));
  routeSpy.mockRestore();
});

import { seedRunningNavigation } from './navigationFixture';
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// #139 Option B: arrival finishes a journey on the legacy V1 path too, so the unfinished-journey
// marker is cleared when arrival is detected, not only when the user taps Done.

import * as Location from 'expo-location';
import type { Place } from '../models/types';
import { IJTEMA_DATA } from '../constants/data';
import { GPSManagerService } from '../services/GPSManagerService';
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

const publish = (latitude: number, longitude: number) =>
  (GPSManagerService as unknown as { publishFix(l: Location.LocationObject): void }).publishFix({
    coords: { latitude, longitude, heading: null, accuracy: 5 },
    timestamp: Date.now(),
  } as Location.LocationObject);

beforeEach(() => {
  useAppStore.setState(initialStoreState, true);
  useAppStore.setState({ currentLocation: origin, currentLocationSource: 'live' });
  seedRunningNavigation(destination);
});

test('V1 arrival clears the unfinished-journey marker', async () => {
  const hook = await renderHook(() => useNavigationViewModel());
  expect(useAppStore.getState().unfinishedJourney).not.toBeNull();

  await act(async () => publish(block.center.latitude, block.center.longitude));

  expect(hook.result.current.arrived).toBe(true);
  expect(useAppStore.getState().unfinishedJourney).toBeNull();
});

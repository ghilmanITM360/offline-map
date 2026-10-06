/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// NAV-004: the legacy V1 NavigationViewModel must get the background-resume GPS freshness V2 has
// (NAV-P0-001 / RESUME-01): a fresh fix is forced on foreground, a historical backlog fix is not
// consumed as the resumed position, and a stale position is flagged until a fresh fix arrives.

import { AppState } from 'react-native';
import * as Location from 'expo-location';
import type { Place } from '../models/types';
import { IJTEMA_DATA } from '../constants/data';
import { GPS_LOST_TIMEOUT_MS } from '../constants/navigation';
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
const FIVE_MINUTES_MS = 5 * 60 * 1000;

const publish = (latitude: number, longitude: number, timestamp = Date.now()) =>
  (GPSManagerService as unknown as { publishFix(l: Location.LocationObject): void }).publishFix({
    coords: { latitude, longitude, heading: null, accuracy: 5 },
    timestamp,
  } as Location.LocationObject);

// Minimal AppState 'change' emitter. remove() really unregisters, so a leaked listener shows up
// as an extra forceFix call after unmount.
let appStateListeners: Set<(s: string) => void>;
const emitAppState = (state: string) =>
  act(async () => {
    appStateListeners.forEach((listener) => listener(state));
  });

let forceFixSpy: jest.SpyInstance;

// GPSManagerService registers its own AppState listener lazily; do it now, against the real
// AppState, so it never lands in the emitter below and its reconcile stays out of these tests.
beforeAll(() => {
  (GPSManagerService as unknown as { ensureAppStateListener(): void }).ensureAppStateListener();
});

beforeEach(() => {
  appStateListeners = new Set();
  jest.spyOn(AppState, 'addEventListener').mockImplementation(((_event: string, listener: (s: string) => void) => {
    appStateListeners.add(listener);
    return { remove: () => appStateListeners.delete(listener) };
  }) as never);
  forceFixSpy = jest.spyOn(GPSManagerService, 'forceFix').mockResolvedValue(null);
  useAppStore.setState(initialStoreState, true);
  useAppStore.setState({ currentLocation: origin, currentLocationSource: 'live' });
  useAppStore.getState().startNavigation(destination);
});

afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

describe('NavigationViewModel (V1) background-resume GPS freshness (NAV-004)', () => {
  test('foreground resume forces one fresh fix; nothing leaks after unmount', async () => {
    const hook = await renderHook(() => useNavigationViewModel());

    await emitAppState('background');
    expect(forceFixSpy).not.toHaveBeenCalled();
    await emitAppState('active');
    expect(forceFixSpy).toHaveBeenCalledTimes(1);

    await act(async () => hook.unmount());
    await emitAppState('active');
    expect(forceFixSpy).toHaveBeenCalledTimes(1);
  });

  test('no navigation session -> resume does not request a fix', async () => {
    useAppStore.getState().stopNavigation();
    await renderHook(() => useNavigationViewModel());

    await emitAppState('active');

    expect(forceFixSpy).not.toHaveBeenCalled();
  });

  test('a historical backlog fix after resume is not consumed as the resumed position', async () => {
    const hook = await renderHook(() => useNavigationViewModel());
    const t0 = Date.now();
    await act(async () => publish(origin.latitude, origin.longitude, t0));

    await emitAppState('background');
    await emitAppState('active');

    // Cached fix from before the resume, sitting AT the destination (worst case: false arrival).
    await act(async () => publish(block.center.latitude, block.center.longitude, t0 - FIVE_MINUTES_MS));
    expect(hook.result.current.arrived).toBe(false);

    // A genuinely fresh fix at the destination is still accepted immediately.
    await act(async () => publish(block.center.latitude, block.center.longitude, Date.now()));
    expect(hook.result.current.arrived).toBe(true);
  });

  test('resume after a GPS gap flags the position as stale until a fresh fix arrives', async () => {
    jest.useFakeTimers();
    const hook = await renderHook(() => useNavigationViewModel());
    await act(async () => publish(origin.latitude, origin.longitude));

    // Quick app switch: still fresh, no notice.
    await emitAppState('active');
    expect(hook.result.current.rerouteStatusMessage).toBeNull();

    await act(async () => {
      jest.advanceTimersByTime(GPS_LOST_TIMEOUT_MS + 1500);
    });
    await emitAppState('active');
    expect(hook.result.current.rerouteStatusMessage).toMatch(/Finding your location/i);

    await act(async () => publish(origin.latitude, origin.longitude));
    expect(hook.result.current.rerouteStatusMessage).toBeNull();
  });
});

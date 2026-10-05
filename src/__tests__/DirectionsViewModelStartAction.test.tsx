/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { V2PlaceAdapter } from '../services/V2PlaceAdapter';
import { LocationAccessService, type LocationResolveResult } from '../services/LocationAccessService';
import { useAppStore } from '../store/useAppStore';
import { useDirectionsViewModel } from '../viewmodels/DirectionsViewModel';
import { act, renderHook, waitFor } from './test-utils';

const initialStoreState = useAppStore.getState();
const destination = V2PlaceAdapter.getPlaceById('B1')!;
const blockStart = V2PlaceAdapter.getPlaceById('B27')!;

const granted = { granted: true, canAskAgain: true, status: 'granted', precision: 'fine', servicesEnabled: true, servicesState: 'enabled' } as const;
const resolved = (over: Partial<LocationResolveResult>): LocationResolveResult =>
  ({ ok: true, coordinate: null, source: 'live', permissionState: granted as never, message: null, ...over });

async function readyHook() {
  const hook = await renderHook(() => useDirectionsViewModel(destination));
  await act(async () => hook.result.current.setManualStartPlace(blockStart));
  await waitFor(() => expect(hook.result.current.loadState).toBe('ready'), { timeout: 8_000 });
  return hook;
}

beforeEach(() => {
  process.env.EXPO_PUBLIC_USE_IJTEMA_V2_ROUTING = 'true';
  useAppStore.setState(initialStoreState, true);
  useAppStore.setState({ currentLocation: null, currentLocationSource: null, hasLocationPermission: true, locationPermissionPrecision: 'fine' });
});
afterEach(() => jest.restoreAllMocks());

describe('Start action for a chosen (manual) start', () => {
  test('1/7/8: Block 27 -> Block 1 with no fix keeps the route and offers an enabled location action', async () => {
    const hook = await readyHook();
    expect(hook.result.current.route).not.toBeNull();
    expect(hook.result.current.canStartNavigation).toBe(false); // safety rule unchanged
    expect(hook.result.current.startAction).toMatchObject({ kind: 'use_location', primaryLabel: 'Use my location & start' });
  });

  test('2: permission not granted offers "Turn on location & start"', async () => {
    useAppStore.setState({ hasLocationPermission: false, locationPermissionPrecision: 'none' });
    const hook = await readyHook();
    expect(hook.result.current.startAction?.kind).toBe('turn_on_location');
  });

  test('3: a fresh precise fix at the chosen start starts navigation automatically', async () => {
    const hook = await readyHook();
    const first = (hook.result.current.route as { coordinates: { latitude: number; longitude: number }[] }).coordinates[0];
    jest.spyOn(LocationAccessService, 'resolveCurrentLocation').mockResolvedValue(
      resolved({ coordinate: { ...first, accuracy: 8, observedAtMs: Date.now() } }),
    );
    const startNow = jest.fn();
    await act(async () => hook.result.current.runStartAction(startNow));
    expect(startNow).toHaveBeenCalledTimes(1);
  });

  test('4/9: a fresh fix far from the chosen start does NOT start; the sheet switches to "not near"', async () => {
    const hook = await readyHook();
    jest.spyOn(LocationAccessService, 'resolveCurrentLocation').mockResolvedValue(
      resolved({ coordinate: { latitude: 24.99, longitude: 67.05, accuracy: 8, observedAtMs: Date.now() } }),
    );
    const startNow = jest.fn();
    await act(async () => hook.result.current.runStartAction(startNow));
    expect(startNow).not.toHaveBeenCalled();
    expect(useAppStore.getState().isNavigating).toBe(false);
    await waitFor(() => expect(hook.result.current.startAction).toMatchObject({ kind: 'not_near', primaryLabel: 'Start from my location' }));
    expect(hook.result.current.startAction?.title).toContain("You're not near");
  });

  test('"Start from my location" recalculates from the real position instead of mutating the old start', async () => {
    const hook = await readyHook();
    await act(async () => useAppStore.setState({ currentLocation: { latitude: 24.9636, longitude: 67.0063, accuracy: 8, observedAtMs: Date.now() }, currentLocationSource: 'live' }));
    await waitFor(() => expect(hook.result.current.startAction?.kind).toBe('not_near'));
    jest.spyOn(LocationAccessService, 'resolveCurrentLocation').mockResolvedValue(
      resolved({ coordinate: { latitude: 24.9636, longitude: 67.0063, accuracy: 8, observedAtMs: Date.now() } }),
    );
    await act(async () => hook.result.current.runStartAction(jest.fn()));
    await waitFor(() => expect(hook.result.current.startSource).toBe('live_gps'));
    expect(hook.result.current.manualStart).toBeNull();
  });

  test('5: approximate-only permission never starts, even when a fix looks accurate', async () => {
    const hook = await readyHook();
    const open = jest.spyOn(LocationAccessService, 'openAppSettings').mockResolvedValue(true);
    jest.spyOn(LocationAccessService, 'resolveCurrentLocation').mockResolvedValue(
      resolved({
        coordinate: { latitude: 24.96, longitude: 67.0, accuracy: 5, observedAtMs: Date.now() },
        permissionState: { ...granted, precision: 'coarse' } as never,
      }),
    );
    const startNow = jest.fn();
    await act(async () => hook.result.current.runStartAction(startNow));
    expect(startNow).not.toHaveBeenCalled();
    expect(open).toHaveBeenCalledTimes(1);
    expect(hook.result.current.startAttempt).toBe('settings');
  });

  test('6: no fix at all gives one recovery state and leaves the route and actions in place', async () => {
    const hook = await readyHook();
    jest.spyOn(LocationAccessService, 'resolveCurrentLocation').mockResolvedValue(
      resolved({ ok: false, source: null, message: 'Current location is unavailable. Choose start manually.' }),
    );
    const startNow = jest.fn();
    await act(async () => hook.result.current.runStartAction(startNow));
    expect(startNow).not.toHaveBeenCalled();
    expect(hook.result.current.startAttempt).toBe('failed');
    expect(hook.result.current.route).not.toBeNull();
    expect(hook.result.current.startAction?.kind).toBe('use_location');
  });

  test('a last-known (non-live) result is not accepted as a live fix', async () => {
    const hook = await readyHook();
    jest.spyOn(LocationAccessService, 'resolveCurrentLocation').mockResolvedValue(
      resolved({ source: 'device_last_known', coordinate: { latitude: 24.96, longitude: 67.0, accuracy: 8, observedAtMs: Date.now() } }),
    );
    const startNow = jest.fn();
    await act(async () => hook.result.current.runStartAction(startNow));
    expect(startNow).not.toHaveBeenCalled();
    expect(hook.result.current.startAttempt).toBe('failed');
  });

  test('permission blocked for good sends the user to system settings', async () => {
    const hook = await readyHook();
    const open = jest.spyOn(LocationAccessService, 'openAppSettings').mockResolvedValue(true);
    jest.spyOn(LocationAccessService, 'resolveCurrentLocation').mockResolvedValue(
      resolved({ ok: false, source: null, permissionState: { ...granted, granted: false, canAskAgain: false, precision: 'none' } as never }),
    );
    await act(async () => hook.result.current.runStartAction(jest.fn()));
    expect(open).toHaveBeenCalledTimes(1);
    expect(hook.result.current.startAttempt).toBe('settings');
  });
});

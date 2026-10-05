/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { V2NavigationAdapter } from '../services/V2NavigationAdapter';
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

  test('3/9: a fresh precise fix replaces the manual start, then navigation starts from the recomputed route', async () => {
    const hook = await readyHook();
    const staleRoute = hook.result.current.route;
    jest.spyOn(LocationAccessService, 'resolveCurrentLocation').mockResolvedValue(
      resolved({ coordinate: { latitude: 24.9636, longitude: 67.0063, accuracy: 8, observedAtMs: Date.now() } }),
    );
    const startNow = jest.fn();
    await act(async () => hook.result.current.runStartAction(startNow));
    // The planned Block 27 start is never used as if it were live GPS: the start is now the fix itself.
    expect(hook.result.current.startSource).toBe('live_gps');
    expect(hook.result.current.manualStart).toBeNull();
    await waitFor(() => expect(startNow).toHaveBeenCalledTimes(1), { timeout: 8_000 });
    expect(hook.result.current.route).not.toBe(staleRoute);
  });

  test('once the start is the live fix, the button is a plain Start Navigation that starts directly', async () => {
    const hook = await readyHook();
    jest.spyOn(LocationAccessService, 'resolveCurrentLocation').mockResolvedValue(
      resolved({ coordinate: { latitude: 24.9636, longitude: 67.0063, accuracy: 8, observedAtMs: Date.now() } }),
    );
    const first = jest.fn();
    await act(async () => hook.result.current.runStartAction(first));
    await waitFor(() => expect(first).toHaveBeenCalledTimes(1), { timeout: 8_000 });
    await waitFor(() => expect(hook.result.current.startAction?.kind).toBe('start'));
    const second = jest.fn();
    await act(async () => hook.result.current.runStartAction(second));
    expect(second).toHaveBeenCalledTimes(1);
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

  test('#307: device location services off is its own outcome and opens location settings, not app settings', async () => {
    const hook = await readyHook();
    const openApp = jest.spyOn(LocationAccessService, 'openAppSettings').mockResolvedValue(true);
    const openLocation = jest.spyOn(LocationAccessService, 'openLocationSettings').mockResolvedValue(true);
    jest.spyOn(LocationAccessService, 'resolveCurrentLocation').mockResolvedValue(
      resolved({ ok: false, source: null, permissionState: { ...granted, servicesEnabled: false, servicesState: 'disabled' } as never }),
    );
    const startNow = jest.fn();
    await act(async () => hook.result.current.runStartAction(startNow));
    expect(startNow).not.toHaveBeenCalled();
    expect(openLocation).toHaveBeenCalledTimes(1);
    expect(openApp).not.toHaveBeenCalled();
    expect(hook.result.current.startAttempt).toBe('services_off');
    expect(hook.result.current.route).not.toBeNull(); // the route guide stays available
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

  test('#301: a recompute that finishes after navigation started never replaces the active route', async () => {
    const hook = await readyHook();
    const preview = hook.result.current.route as never;
    const active = V2NavigationAdapter.fromPreview({
      previewRoute: preview,
      destination,
      startPlace: null,
      currentLocation: (preview as { coordinates: never[] }).coordinates[0],
    });
    await act(async () => useAppStore.getState().startNavigation(destination, active, active.instructions));
    // The live fix keeps moving while the sheet is still unmounting: the origin changes and the route recomputes.
    await act(async () => hook.result.current.setManualStartPlace(V2PlaceAdapter.getPlaceById('B28')!));
    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(useAppStore.getState().activeRoute).toBe(active);
    expect((useAppStore.getState().activeRoute as { origin?: unknown }).origin).toBeDefined();
  });
});

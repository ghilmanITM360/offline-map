/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { V2PlaceAdapter } from '../services/V2PlaceAdapter';
import { useAppStore } from '../store/useAppStore';
import { useDirectionsViewModel } from '../viewmodels/DirectionsViewModel';
import { act, renderHook, waitFor } from './test-utils';

const initialStoreState = useAppStore.getState();
const b1 = V2PlaceAdapter.getPlaceById('B1')!;
const b27 = V2PlaceAdapter.getPlaceById('B27')!;

beforeEach(() => {
  process.env.EXPO_PUBLIC_USE_IJTEMA_V2_ROUTING = 'true';
  useAppStore.setState(initialStoreState, true);
  useAppStore.setState({ currentLocation: null, currentLocationSource: null, hasLocationPermission: true, locationPermissionPrecision: 'fine' });
});

// The owner's screenshot: "Route ready / 1 min · 0 m" with a disabled Start and a v2 sentence.
describe('Route ready is only ever a usable route', () => {
  test('start and destination being the same place is "already there", never a ready route', async () => {
    const hook = await renderHook(() => useDirectionsViewModel(b1));
    await act(async () => hook.result.current.setManualStartPlace(b1));
    await waitFor(() => expect(hook.result.current.loadState).not.toBe('loading'), { timeout: 8_000 });
    expect(hook.result.current.loadState).toBe('same_place');
    expect(hook.result.current.route).toBeNull();
  });

  test('a start that cannot be routed after a good route does not leave the old route marked ready', async () => {
    const hook = await renderHook(() => useDirectionsViewModel(b1));
    await act(async () => hook.result.current.setManualStartPlace(b27));
    await waitFor(() => expect(hook.result.current.loadState).toBe('ready'), { timeout: 8_000 });
    await act(async () => hook.result.current.setManualStartPlace({ ...b27, id: 'X', isRoutable: false, isStartRoutable: false }));
    await waitFor(() => expect(hook.result.current.loadState).not.toBe('loading'), { timeout: 8_000 });
    expect(hook.result.current.loadState).toBe('error');
    expect(hook.result.current.route).toBeNull();
  });

  test('no message a user sees names a version, flag or internal term', async () => {
    const hook = await renderHook(() => useDirectionsViewModel(b1));
    await act(async () => hook.result.current.setManualStartPlace(b27));
    await waitFor(() => expect(hook.result.current.loadState).toBe('ready'), { timeout: 8_000 });
    expect(hook.result.current.startNavigationDisabledReason ?? '').not.toMatch(/\bv[12]\b|flag|EXPO_PUBLIC/i);
  });
});

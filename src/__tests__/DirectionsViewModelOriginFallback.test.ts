/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Place } from '../models/types';
import { useAppStore } from '../store/useAppStore';
import { LocationAccessService } from '../services/LocationAccessService';
import { useDirectionsViewModel } from '../viewmodels/DirectionsViewModel';
import { act, renderHook, waitFor } from './test-utils';

jest.mock('../services/LocationAccessService', () => ({
  LocationAccessService: {
    resolveCurrentLocation: jest.fn(),
    openAppSettings: jest.fn().mockResolvedValue(true),
  },
}));

const resolveCurrentLocation = LocationAccessService.resolveCurrentLocation as jest.Mock;

const initialStoreState = useAppStore.getState();

const destination: Place = {
  id: 'B34',
  name: 'Block 34',
  category: 'Block',
  description: 'Block 34',
  coordinate: { latitude: 24.966, longitude: 67.004 },
  sourceVersion: 'v2',
};

const deniedPermissionState = { granted: false, canAskAgain: true, status: 'denied', servicesEnabled: true } as any;
const grantedPermissionState = { granted: true, canAskAgain: true, status: 'granted', servicesEnabled: true } as any;

beforeEach(() => {
  process.env.EXPO_PUBLIC_USE_IJTEMA_V2_ROUTING = 'true';
  useAppStore.setState(initialStoreState, true);
  jest.clearAllMocks();
});

describe('DirectionsViewModel — canonical automatic origin fallback (NEW UX Phase B/N)', () => {
  test('falls back to the canonical B2 place, visibly disclosed, when permission is denied', async () => {
    resolveCurrentLocation.mockResolvedValue({
      ok: false,
      coordinate: null,
      source: null,
      permissionState: deniedPermissionState,
      message: 'Location permission is required to use your current position.',
    });

    const hook = await renderHook(() => useDirectionsViewModel(destination));

    await waitFor(() => expect(hook.result.current.startSource).toBe('fallback_place'), { timeout: 5_000 });
    expect(hook.result.current.isCurrentLocationStartActive).toBe(false);
    expect(hook.result.current.startSourceLabel).toMatch(/Block 2/);
    expect(hook.result.current.startSourceSupportingCopy).toMatch(/unavailable/i);
    await waitFor(() => expect(hook.result.current.loadState).toBe('ready'), { timeout: 5_000 });
    expect(hook.result.current.activeOriginCoordinate).toBeTruthy();
  });

  test('never fakes a live position when falling back to B2', async () => {
    resolveCurrentLocation.mockResolvedValue({
      ok: false,
      coordinate: null,
      source: null,
      permissionState: deniedPermissionState,
      message: 'no fix',
    });

    const hook = await renderHook(() => useDirectionsViewModel(destination));

    await waitFor(() => expect(hook.result.current.startSource).toBe('fallback_place'));
    expect(hook.result.current.isCurrentLocationStartActive).toBe(false);
  });

  test('prefers live current location over B2 when GPS is usable', async () => {
    const coordinate = { latitude: 24.9762, longitude: 67.011 };
    resolveCurrentLocation.mockResolvedValue({
      ok: true,
      coordinate,
      source: 'live',
      permissionState: grantedPermissionState,
      message: null,
    });

    const hook = await renderHook(() => useDirectionsViewModel(destination));

    await waitFor(() => expect(hook.result.current.startSource).toBe('live_gps'));
    expect(hook.result.current.isCurrentLocationStartActive).toBe(true);
    expect(hook.result.current.activeOriginCoordinate).toEqual(coordinate);
  });

  test('does not override an explicit manual start choice with the automatic B2 fallback', async () => {
    resolveCurrentLocation.mockResolvedValue({
      ok: false,
      coordinate: null,
      source: null,
      permissionState: deniedPermissionState,
      message: 'no fix',
    });

    const hook = await renderHook(() => useDirectionsViewModel(destination));
    await act(() => hook.result.current.chooseManualStart());

    // Give any in-flight automatic resolution a chance to (incorrectly) fire.
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(hook.result.current.startSource).toBe('manual_place');
    expect(hook.result.current.showManualStartSearch).toBe(true);
  });
});

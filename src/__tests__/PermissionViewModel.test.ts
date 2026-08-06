/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Alert } from 'react-native';
import * as Location from 'expo-location';
import { usePermissionViewModel } from '../viewmodels/PermissionViewModel';
import { OfflineMapService } from '../services/OfflineMapService';
import { OfflineMapStatusService } from '../services/OfflineMapStatusService';
import { ConnectivityService } from '../services/ConnectivityService';
import { OnboardingStatusService } from '../services/OnboardingStatusService';
import { useAppStore } from '../store/useAppStore';
import { act, renderHook } from './test-utils';

jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn(),
  getForegroundPermissionsAsync: jest.fn(),
  PermissionStatus: { GRANTED: 'granted', DENIED: 'denied', UNDETERMINED: 'undetermined' },
}));

jest.mock('../services/OfflineMapService', () => ({
  OfflineMapService: { getMapStatus: jest.fn() },
}));

jest.mock('../services/OfflineMapStatusService', () => ({
  OfflineMapStatusService: { validateAtStartup: jest.fn() },
}));

jest.mock('../services/ConnectivityService', () => ({
  ConnectivityService: { isConnected: jest.fn() },
}));

jest.mock('../services/OnboardingStatusService', () => ({
  OnboardingStatusService: {
    setSkippedLocationPermission: jest.fn(),
    clearSkippedLocationPermissionOnGrant: jest.fn(),
  },
}));

const initialStoreState = useAppStore.getState();
const mockNavigation = { replace: jest.fn() };

function pressAlertButton(text: string) {
  const call = (Alert.alert as jest.Mock).mock.calls.at(-1);
  const buttons = call?.[2] as Array<{ text: string; onPress?: () => void }>;
  const button = buttons.find((b) => b.text === text);
  button?.onPress?.();
}

beforeEach(() => {
  jest.clearAllMocks();
  useAppStore.setState(initialStoreState, true);
  (OfflineMapService.getMapStatus as jest.Mock).mockResolvedValue({ isDownloaded: true });
  (OfflineMapStatusService.validateAtStartup as jest.Mock).mockResolvedValue({ status: 'downloaded' });
  (ConnectivityService.isConnected as jest.Mock).mockResolvedValue(true);
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

describe('usePermissionViewModel — Continue Without Location persistence', () => {
  it('does not persist a skip decision merely by opening the confirmation dialog', async () => {
    const { result } = await renderHook(() => usePermissionViewModel());
    await act(() => {
      result.current.skipPermission(mockNavigation);
    });
    expect(OnboardingStatusService.setSkippedLocationPermission).not.toHaveBeenCalled();
  });

  it('does not persist a skip decision on Cancel', async () => {
    const { result } = await renderHook(() => usePermissionViewModel());
    await act(() => {
      result.current.skipPermission(mockNavigation);
    });
    await act(async () => {
      pressAlertButton('Cancel');
    });
    expect(OnboardingStatusService.setSkippedLocationPermission).not.toHaveBeenCalled();
    expect(mockNavigation.replace).not.toHaveBeenCalled();
  });

  it('persists the skip decision only after the user confirms "Continue Without Location"', async () => {
    const { result } = await renderHook(() => usePermissionViewModel());
    await act(() => {
      result.current.skipPermission(mockNavigation);
    });
    await act(async () => {
      pressAlertButton('Continue Without Location');
    });
    expect(OnboardingStatusService.setSkippedLocationPermission).toHaveBeenCalledWith(true);
    expect(mockNavigation.replace).toHaveBeenCalledWith('Main');
  });

  it('clears/supersedes the skip flag once a real permission grant is confirmed', async () => {
    (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted' });
    const { result } = await renderHook(() => usePermissionViewModel());

    await act(async () => {
      await result.current.requestPermission(mockNavigation);
    });

    expect(useAppStore.getState().hasLocationPermission).toBe(true);
    expect(OnboardingStatusService.clearSkippedLocationPermissionOnGrant).toHaveBeenCalledWith(true);
    expect(mockNavigation.replace).toHaveBeenCalledWith('Main');
  });

  it('does not clear the skip flag when permission is requested but denied', async () => {
    (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'denied' });
    (Location.getForegroundPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'denied', canAskAgain: true });
    const { result } = await renderHook(() => usePermissionViewModel());

    await act(async () => {
      await result.current.requestPermission(mockNavigation);
    });

    expect(OnboardingStatusService.clearSkippedLocationPermissionOnGrant).not.toHaveBeenCalled();
    expect(mockNavigation.replace).not.toHaveBeenCalled();
  });

  it('does not clear the skip flag when the permission prompt is cancelled/dismissed without a decision', async () => {
    (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'undetermined' });
    (Location.getForegroundPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'undetermined', canAskAgain: true });
    const { result } = await renderHook(() => usePermissionViewModel());

    await act(async () => {
      await result.current.requestPermission(mockNavigation);
    });

    expect(OnboardingStatusService.clearSkippedLocationPermissionOnGrant).not.toHaveBeenCalled();
    expect(mockNavigation.replace).not.toHaveBeenCalled();
  });

  it('stays on-screen and shows a non-technical error when persisting the skip choice fails — it does not navigate on as if it had saved', async () => {
    (OnboardingStatusService.setSkippedLocationPermission as jest.Mock).mockRejectedValueOnce(new Error('disk full'));
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const { result } = await renderHook(() => usePermissionViewModel());

    await act(() => {
      result.current.skipPermission(mockNavigation);
    });
    await act(async () => {
      pressAlertButton('Continue Without Location');
    });

    expect(mockNavigation.replace).not.toHaveBeenCalled();
    expect(result.current.loading).toBe(false);
    const failureAlert = (Alert.alert as jest.Mock).mock.calls.at(-1);
    expect(failureAlert?.[0]).toEqual(expect.stringContaining("Couldn't save"));
    expect(errorSpy).toHaveBeenCalled();

    errorSpy.mockRestore();
  });

  it('a retry after a failed skip persistence can still succeed', async () => {
    (OnboardingStatusService.setSkippedLocationPermission as jest.Mock).mockRejectedValueOnce(new Error('disk full'));
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const { result } = await renderHook(() => usePermissionViewModel());

    await act(() => {
      result.current.skipPermission(mockNavigation);
    });
    await act(async () => {
      pressAlertButton('Continue Without Location');
    });
    expect(mockNavigation.replace).not.toHaveBeenCalled();

    (OnboardingStatusService.setSkippedLocationPermission as jest.Mock).mockResolvedValueOnce(undefined);
    await act(() => {
      result.current.skipPermission(mockNavigation);
    });
    await act(async () => {
      pressAlertButton('Continue Without Location');
    });

    expect(OnboardingStatusService.setSkippedLocationPermission).toHaveBeenLastCalledWith(true);
    expect(mockNavigation.replace).toHaveBeenCalledWith('Main');

    errorSpy.mockRestore();
  });

  it('prevents a rapid repeated confirmation from persisting or navigating more than once', async () => {
    let resolveSkip!: () => void;
    (OnboardingStatusService.setSkippedLocationPermission as jest.Mock).mockImplementation(
      () => new Promise<void>((resolve) => { resolveSkip = resolve; }),
    );
    const { result } = await renderHook(() => usePermissionViewModel());

    await act(() => {
      result.current.skipPermission(mockNavigation);
    });
    const call = (Alert.alert as jest.Mock).mock.calls.at(-1);
    const buttons = call?.[2] as Array<{ text: string; onPress?: () => void }>;
    const confirmButton = buttons.find((b) => b.text === 'Continue Without Location');

    await act(async () => {
      confirmButton?.onPress?.();
      confirmButton?.onPress?.(); // rapid second tap before the first persistence call resolves
      await Promise.resolve();
    });

    expect(OnboardingStatusService.setSkippedLocationPermission).toHaveBeenCalledTimes(1);
    expect(result.current.loading).toBe(true);

    await act(async () => {
      resolveSkip();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockNavigation.replace).toHaveBeenCalledTimes(1);
    expect(result.current.loading).toBe(false);
  });
});

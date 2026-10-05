/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Alert, Linking } from 'react-native';
import * as Location from 'expo-location';
import { usePermissionViewModel } from '../viewmodels/PermissionViewModel';
import { OnboardingStatusService } from '../services/OnboardingStatusService';
import { useAppStore } from '../store/useAppStore';
import { act, renderHook } from './test-utils';

jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn(),
  getForegroundPermissionsAsync: jest.fn(),
  PermissionStatus: { GRANTED: 'granted', DENIED: 'denied', UNDETERMINED: 'undetermined' },
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
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

describe('usePermissionViewModel — requestPermission denial handling', () => {
  it('LOC-02: denied with canAskAgain=true shows a retry rationale, not a Settings redirect', async () => {
    (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'denied' });
    (Location.getForegroundPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'denied', canAskAgain: true });
    jest.spyOn(Linking, 'openSettings').mockImplementation(() => Promise.resolve());

    const { result } = await renderHook(() => usePermissionViewModel());
    await act(async () => {
      await result.current.requestPermission(mockNavigation);
    });

    expect(Alert.alert).toHaveBeenCalledWith(
      "Location isn't on yet",
      expect.any(String),
      expect.any(Array),
    );
    expect(Linking.openSettings).not.toHaveBeenCalled();
  });

  it('LOC-03: permanent denial (canAskAgain=false) offers Settings once, with no repeated prompt', async () => {
    (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'denied' });
    (Location.getForegroundPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'denied', canAskAgain: false });
    jest.spyOn(Linking, 'openSettings').mockImplementation(() => Promise.resolve());

    const { result } = await renderHook(() => usePermissionViewModel());
    await act(async () => {
      await result.current.requestPermission(mockNavigation);
    });

    expect(Alert.alert).toHaveBeenCalledTimes(1);
    expect(Alert.alert).toHaveBeenCalledWith(
      'Location access is off',
      'Enable location access in Settings to use navigation.',
      expect.any(Array),
    );

    pressAlertButton('Open Settings');
    expect(Linking.openSettings).toHaveBeenCalledTimes(1);

    // A second manual retry tap is a fresh user action, not an automatic loop — still just one
    // alert per tap, never more.
    await act(async () => {
      await result.current.requestPermission(mockNavigation);
    });
    expect(Alert.alert).toHaveBeenCalledTimes(2);
  });

  it('PERM-006: a rejected permission-request promise surfaces a visible Alert, not just a console log', async () => {
    (Location.requestForegroundPermissionsAsync as jest.Mock).mockRejectedValueOnce(new Error('native module unavailable'));
    jest.spyOn(console, 'error').mockImplementation(() => {});

    const { result } = await renderHook(() => usePermissionViewModel());
    await act(async () => {
      await result.current.requestPermission(mockNavigation);
    });

    expect(Alert.alert).toHaveBeenCalledWith(
      "Couldn't check location permission",
      expect.any(String),
      expect.any(Array),
    );
    expect(result.current.loading).toBe(false);
  });
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
    expect(mockNavigation.replace).toHaveBeenCalledWith('LocationsDirectory');
  });

  it('clears/supersedes the skip flag once a real permission grant is confirmed', async () => {
    (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted' });
    const { result } = await renderHook(() => usePermissionViewModel());

    await act(async () => {
      await result.current.requestPermission(mockNavigation);
    });

    expect(useAppStore.getState().hasLocationPermission).toBe(true);
    expect(OnboardingStatusService.clearSkippedLocationPermissionOnGrant).toHaveBeenCalledWith(true);
    expect(mockNavigation.replace).toHaveBeenCalledWith('LocationsDirectory');
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
    expect(mockNavigation.replace).toHaveBeenCalledWith('LocationsDirectory');

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

describe('usePermissionViewModel — Continue Without Location confirmation is guarded across unmount', () => {
  function deferredSkipPersistence() {
    let resolve!: () => void;
    let reject!: (error: unknown) => void;
    const promise = new Promise<void>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    (OnboardingStatusService.setSkippedLocationPermission as jest.Mock).mockImplementation(() => promise);
    return { resolve, reject };
  }

  async function confirmViaAlert(result: { current: ReturnType<typeof usePermissionViewModel> }) {
    await act(() => {
      result.current.skipPermission(mockNavigation);
    });
    const call = (Alert.alert as jest.Mock).mock.calls.at(-1);
    const buttons = call?.[2] as Array<{ text: string; onPress?: () => void }>;
    const confirmButton = buttons.find((b) => b.text === 'Continue Without Location');
    await act(async () => {
      confirmButton?.onPress?.();
    });
  }

  it('1. unmounting while persistence is pending suppresses the eventual success navigation', async () => {
    const { resolve } = deferredSkipPersistence();
    const { result, unmount } = await renderHook(() => usePermissionViewModel());

    await confirmViaAlert(result);
    expect(OnboardingStatusService.setSkippedLocationPermission).toHaveBeenCalledTimes(1);

    await act(async () => {
      await unmount();
    });

    await act(async () => {
      resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockNavigation.replace).not.toHaveBeenCalled();
  });

  it('2. unmounting before persistence rejects suppresses the retry Alert and console.error', async () => {
    const { reject } = deferredSkipPersistence();
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const { result, unmount } = await renderHook(() => usePermissionViewModel());

    await confirmViaAlert(result);
    (Alert.alert as jest.Mock).mockClear(); // clear the confirmation-dialog call itself

    await act(async () => {
      await unmount();
    });

    await act(async () => {
      reject(new Error('disk full'));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(Alert.alert).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
    expect(mockNavigation.replace).not.toHaveBeenCalled();

    errorSpy.mockRestore();
  });

  it('4. an old failed request completing after a newer (remounted) retry begins does not affect the newer attempt', async () => {
    const { reject } = deferredSkipPersistence();
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    // First mount: start a confirmation that will be left pending, then unmount (simulating
    // the user backing out of the Permission screen) before it settles.
    const first = await renderHook(() => usePermissionViewModel());
    await confirmViaAlert(first.result);
    await act(async () => {
      await first.unmount();
    });

    // Second mount (simulating the user navigating back to Permission and retrying): its own
    // confirmation succeeds normally, independent of the first attempt still being unsettled.
    (OnboardingStatusService.setSkippedLocationPermission as jest.Mock).mockResolvedValueOnce(undefined);
    const second = await renderHook(() => usePermissionViewModel());
    await confirmViaAlert(second.result);

    expect(mockNavigation.replace).toHaveBeenCalledTimes(1);
    expect(mockNavigation.replace).toHaveBeenCalledWith('LocationsDirectory');

    // The first (unmounted) attempt's persistence now finally rejects, late — must not affect
    // anything: no additional Alert, no additional navigation, no error thrown.
    await act(async () => {
      reject(new Error('disk full — stale'));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockNavigation.replace).toHaveBeenCalledTimes(1);

    errorSpy.mockRestore();
  });

  it('5. rapid double confirmation remains suppressed even with the unmount guard in place', async () => {
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
      confirmButton?.onPress?.();
      await Promise.resolve();
    });

    expect(OnboardingStatusService.setSkippedLocationPermission).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveSkip();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockNavigation.replace).toHaveBeenCalledTimes(1);
  });

  it('6. one successful mounted confirmation still navigates normally', async () => {
    (OnboardingStatusService.setSkippedLocationPermission as jest.Mock).mockResolvedValue(undefined);
    const { result } = await renderHook(() => usePermissionViewModel());

    await confirmViaAlert(result);

    expect(mockNavigation.replace).toHaveBeenCalledWith('LocationsDirectory');
    expect(result.current.loading).toBe(false);
  });

  it('7. unmounting mid-confirmation produces no act()/unmounted-state warnings', async () => {
    const { resolve } = deferredSkipPersistence();
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const { result, unmount } = await renderHook(() => usePermissionViewModel());

    await confirmViaAlert(result);
    await act(async () => {
      await unmount();
    });
    await act(async () => {
      resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    const allWarnings = [...warnSpy.mock.calls, ...errorSpy.mock.calls].map((args) => String(args[0]));
    expect(allWarnings.some((message) => /not wrapped in act/i.test(message))).toBe(false);
    expect(allWarnings.some((message) => /unmounted component/i.test(message))).toBe(false);

    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });
});

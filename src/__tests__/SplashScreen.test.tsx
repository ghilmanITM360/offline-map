/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import * as Location from 'expo-location';
import { SplashScreen } from '../views/screens/SplashScreen';
import { OfflineMapService } from '../services/OfflineMapService';
import { OfflineMapStatusService } from '../services/OfflineMapStatusService';
import { ConnectivityService } from '../services/ConnectivityService';
import { OnboardingStatusService } from '../services/OnboardingStatusService';
import { useAppStore } from '../store/useAppStore';
import { act, render } from './test-utils';

jest.mock('expo-location', () => ({
  getForegroundPermissionsAsync: jest.fn(),
  PermissionStatus: { GRANTED: 'granted', DENIED: 'denied', UNDETERMINED: 'undetermined' },
}));

jest.mock('../services/OfflineMapService', () => ({
  OfflineMapService: { getMapStatus: jest.fn() },
}));

jest.mock('../services/OfflineMapStatusService', () => ({
  OfflineMapStatusService: {
    validateAtStartup: jest.fn(),
    isGraphOnlyModeEnabled: jest.fn(),
    isSkippedOnlineModeEnabled: jest.fn(),
  },
}));

jest.mock('../services/ConnectivityService', () => ({
  ConnectivityService: { isConnected: jest.fn() },
}));

jest.mock('../services/OnboardingStatusService', () => ({
  OnboardingStatusService: {
    hasSeenWelcome: jest.fn(),
    hasSkippedLocationPermission: jest.fn(),
    setSkippedLocationPermission: jest.fn(),
    clearSkippedLocationPermissionOnGrant: jest.fn(),
  },
}));

const mockReplaceSpy = jest.fn();
// Stable object reference across renders, matching real react-navigation's useNavigation()
// (backed by context, not a fresh object per call) — SplashScreen's effect depends on
// `navigation`, so an unstable mock reference would spuriously re-run/cleanup the effect on
// every unrelated store change and break the isMountedRef guard this suite exercises.
const mockNavigation = { replace: mockReplaceSpy };
jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  return { ...actual, useNavigation: () => mockNavigation };
});

const initialStoreState = useAppStore.getState();
const realPersistOptions = useAppStore.persist.getOptions();

// Lets each test control exactly when the store's rehydration pass "completes", independent
// of SplashScreen's other awaited checks — mirrors the technique in
// useAppStoreHydration.test.ts. Resolving with `null` simulates a fresh install (nothing
// stored yet); resolving with `{ state, version }` simulates a returning user's real
// persisted values arriving as part of the same rehydration pass.
function controllableStorage() {
  let resolveGetItem!: (value: unknown) => void;
  let rejectGetItem!: (error: unknown) => void;
  const getItemPromise = new Promise((resolve, reject) => {
    resolveGetItem = resolve;
    rejectGetItem = reject;
  });
  return {
    storage: {
      getItem: () => getItemPromise,
      setItem: () => Promise.resolve(),
      removeItem: () => Promise.resolve(),
    },
    resolve: (value: unknown) => resolveGetItem(value),
    reject: (error: unknown) => rejectGetItem(error),
  };
}

async function flush() {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(2000);
  });
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  useAppStore.setState(initialStoreState, true);
  (Location.getForegroundPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted', canAskAgain: true });
  (OfflineMapService.getMapStatus as jest.Mock).mockResolvedValue({ isDownloaded: true, downloadDate: null, sizeMB: 24.5 });
  (OfflineMapStatusService.validateAtStartup as jest.Mock).mockResolvedValue({ status: 'downloaded', manifest: null });
  (OfflineMapStatusService.isGraphOnlyModeEnabled as jest.Mock).mockResolvedValue(false);
  (OfflineMapStatusService.isSkippedOnlineModeEnabled as jest.Mock).mockResolvedValue(false);
  (ConnectivityService.isConnected as jest.Mock).mockResolvedValue(true);
  (OnboardingStatusService.hasSeenWelcome as jest.Mock).mockResolvedValue(true);
  (OnboardingStatusService.hasSkippedLocationPermission as jest.Mock).mockResolvedValue(false);
  (OnboardingStatusService.setSkippedLocationPermission as jest.Mock).mockResolvedValue(undefined);
  (OnboardingStatusService.clearSkippedLocationPermissionOnGrant as jest.Mock).mockResolvedValue(undefined);
});

afterEach(() => {
  jest.useRealTimers();
  useAppStore.persist.setOptions(realPersistOptions);
});

describe('SplashScreen — persisted-store hydration gate', () => {
  it('fresh install: navigates to Welcome only after hydration completes', async () => {
    (OnboardingStatusService.hasSeenWelcome as jest.Mock).mockResolvedValue(false);
    const controllable = controllableStorage();
    useAppStore.persist.setOptions({ storage: controllable.storage });
    const rehydratePromise = useAppStore.persist.rehydrate();

    await act(async () => {
      render(<SplashScreen />);
    });
    // Every other check (including the 1500ms minimum-visible timer) can settle, but
    // navigation must stay withheld while the store is still unhydrated.
    await flush();
    expect(mockReplaceSpy).not.toHaveBeenCalled();

    await act(async () => {
      controllable.resolve(null);
      await rehydratePromise;
    });
    await flush();

    expect(mockReplaceSpy).toHaveBeenCalledTimes(1);
    expect(mockReplaceSpy).toHaveBeenCalledWith('Welcome');
  });

  it('returning user: navigates to Main only after hydration completes, exactly once', async () => {
    const controllable = controllableStorage();
    useAppStore.persist.setOptions({ storage: controllable.storage });
    const rehydratePromise = useAppStore.persist.rehydrate();

    await act(async () => {
      render(<SplashScreen />);
    });
    await flush();
    expect(mockReplaceSpy).not.toHaveBeenCalled();

    await act(async () => {
      controllable.resolve(null);
      await rehydratePromise;
    });
    await flush();

    expect(mockReplaceSpy).toHaveBeenCalledTimes(1);
    expect(mockReplaceSpy).toHaveBeenCalledWith('Main');
  });

  it('does not evaluate hasSeenMapOverview from a pre-hydration default — waits for the real persisted value', async () => {
    // hasSeenMapOverview defaults to false; simulate a returning user whose real persisted
    // value is true, arriving only once the rehydration read resolves (mirrors what
    // HomeScreen's cold-launch camera decision reads once Main mounts after Splash navigates).
    const controllable = controllableStorage();
    useAppStore.persist.setOptions({ storage: controllable.storage });
    const rehydratePromise = useAppStore.persist.rehydrate();
    expect(useAppStore.getState().hasSeenMapOverview).toBe(false);

    await act(async () => {
      render(<SplashScreen />);
    });
    await flush();
    expect(mockReplaceSpy).not.toHaveBeenCalled();

    await act(async () => {
      controllable.resolve({ version: 2, state: { hasSeenMapOverview: true } });
      await rehydratePromise;
    });
    await flush();

    expect(mockReplaceSpy).toHaveBeenCalledTimes(1);
    // Splash itself doesn't branch on hasSeenMapOverview, but this proves navigation was
    // withheld until the real persisted value (true) was in the store, not the false default.
    expect(useAppStore.getState().hasSeenMapOverview).toBe(true);
  });

  it('never calls navigation.replace more than once even if a second rehydration pass runs after the first completed', async () => {
    const controllable = controllableStorage();
    useAppStore.persist.setOptions({ storage: controllable.storage });
    const rehydratePromise = useAppStore.persist.rehydrate();

    await act(async () => {
      render(<SplashScreen />);
    });

    await act(async () => {
      controllable.resolve(null);
      await rehydratePromise;
    });
    await flush();
    expect(mockReplaceSpy).toHaveBeenCalledTimes(1);

    // A redundant later rehydration (e.g. another part of the app calling rehydrate() again)
    // must not trigger a second navigation — Splash's effect only ever awaits its own single
    // waitForStoreHydration() call from the original mount.
    await act(async () => {
      await useAppStore.persist.rehydrate();
    });
    await flush();

    expect(mockReplaceSpy).toHaveBeenCalledTimes(1);
  });
});

describe('SplashScreen — permission-skip cleanup is isolated from route resolution', () => {
  async function renderAndResolveHydration() {
    const controllable = controllableStorage();
    useAppStore.persist.setOptions({ storage: controllable.storage });
    const rehydratePromise = useAppStore.persist.rehydrate();

    await act(async () => {
      render(<SplashScreen />);
    });
    await act(async () => {
      controllable.resolve(null);
      await rehydratePromise;
    });
    await flush();
  }

  beforeEach(() => {
    (OnboardingStatusService.hasSkippedLocationPermission as jest.Mock).mockResolvedValue(true);
  });

  it('calls the canonical clear helper exactly once when permission is granted and a skip was previously recorded', async () => {
    await renderAndResolveHydration();

    expect(OnboardingStatusService.clearSkippedLocationPermissionOnGrant).toHaveBeenCalledTimes(1);
    expect(OnboardingStatusService.clearSkippedLocationPermissionOnGrant).toHaveBeenCalledWith(true);
    expect(mockReplaceSpy).toHaveBeenCalledTimes(1);
  });

  it('granted + stale skip + successful clear: still resolves the normal route for a downloaded map', async () => {
    (OfflineMapStatusService.validateAtStartup as jest.Mock).mockResolvedValue({ status: 'downloaded', manifest: null });

    await renderAndResolveHydration();

    expect(mockReplaceSpy).toHaveBeenCalledTimes(1);
    expect(mockReplaceSpy).toHaveBeenCalledWith('Main');
  });

  it('a rejected cleanup call does not fall through to the generic startup-failure route — a downloaded map still resolves to Main', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    (OnboardingStatusService.clearSkippedLocationPermissionOnGrant as jest.Mock).mockRejectedValue(new Error('disk full'));
    (OfflineMapStatusService.validateAtStartup as jest.Mock).mockResolvedValue({ status: 'downloaded', manifest: null });

    await renderAndResolveHydration();

    expect(mockReplaceSpy).toHaveBeenCalledTimes(1);
    expect(mockReplaceSpy).toHaveBeenCalledWith('Main');
    // Proves the real startup-failure catch branch never ran — that branch always sets this
    // specific message and forces the map status back to not_downloaded.
    expect(useAppStore.getState().offlineMapStatusMessage).not.toEqual(expect.stringContaining('Startup checks failed'));
    expect(useAppStore.getState().offlineMapStatus).toBe('downloaded');
    errorSpy.mockRestore();
  });

  it('a rejected cleanup call still lets a corrupt map status route to DownloadMap', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    (OnboardingStatusService.clearSkippedLocationPermissionOnGrant as jest.Mock).mockRejectedValue(new Error('disk full'));
    (OfflineMapStatusService.validateAtStartup as jest.Mock).mockResolvedValue({ status: 'corrupt', reason: 'checksum mismatch' });

    await renderAndResolveHydration();

    expect(mockReplaceSpy).toHaveBeenCalledTimes(1);
    expect(mockReplaceSpy).toHaveBeenCalledWith('DownloadMap');
    errorSpy.mockRestore();
  });

  it('a rejected cleanup call still lets a needs_update map status route to DownloadMap', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    (OnboardingStatusService.clearSkippedLocationPermissionOnGrant as jest.Mock).mockRejectedValue(new Error('disk full'));
    (OfflineMapStatusService.validateAtStartup as jest.Mock).mockResolvedValue({ status: 'needs_update', reason: 'newer version available' });

    await renderAndResolveHydration();

    expect(mockReplaceSpy).toHaveBeenCalledTimes(1);
    expect(mockReplaceSpy).toHaveBeenCalledWith('DownloadMap');
    errorSpy.mockRestore();
  });

  it('never navigates more than once even when the cleanup call rejects', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    (OnboardingStatusService.clearSkippedLocationPermissionOnGrant as jest.Mock).mockRejectedValue(new Error('disk full'));

    await renderAndResolveHydration();

    expect(mockReplaceSpy).toHaveBeenCalledTimes(1);
    // The cleanup failure was logged through SplashScreen's own dedicated log line, not the
    // generic "Startup checks failed" catch-all.
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to clear the skipped-location-permission preference'), expect.any(Error));
    errorSpy.mockRestore();
  });
});

describe('SplashScreen — hydration degradation is route-safe', () => {
  it('a known hydration failure still resolves exactly one deterministic route, with a distinguishing log', async () => {
    const controllable = controllableStorage();
    useAppStore.persist.setOptions({ storage: controllable.storage });
    const rehydratePromise = useAppStore.persist.rehydrate();
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    await act(async () => {
      render(<SplashScreen />);
    });
    await flush();
    expect(mockReplaceSpy).not.toHaveBeenCalled();

    await act(async () => {
      controllable.reject(new Error('AsyncStorage read failed'));
      await rehydratePromise.catch(() => {});
    });
    await flush();

    expect(mockReplaceSpy).toHaveBeenCalledTimes(1);
    expect(mockReplaceSpy).toHaveBeenCalledWith('Main');
    // The failure log is distinguishable from a timeout log by message text — not merged into
    // one generic "something went wrong with hydration" line.
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Hydration failed'), expect.any(Error));
    expect(warnSpy).not.toHaveBeenCalledWith(expect.stringContaining('Hydration timed out'));
    // Splash itself explicitly acknowledges the outcome (not just useAppStore internally).
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('[SplashScreen]'));
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('outcome="failure"'));

    errorSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it('a genuine hydration hang times out and still resolves exactly one deterministic route, with a distinguishing log', async () => {
    const controllable = controllableStorage(); // getItem deliberately never settles
    useAppStore.persist.setOptions({ storage: controllable.storage });
    void useAppStore.persist.rehydrate();
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    await act(async () => {
      render(<SplashScreen />);
    });
    await flush(); // 2s elapsed — short of the 5s hydration timeout
    expect(mockReplaceSpy).not.toHaveBeenCalled();

    await act(async () => {
      await jest.advanceTimersByTimeAsync(3500); // 5.5s total — past HYDRATION_TIMEOUT_MS
    });

    expect(mockReplaceSpy).toHaveBeenCalledTimes(1);
    expect(mockReplaceSpy).toHaveBeenCalledWith('Main');
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Hydration timed out'));
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('[SplashScreen]'));
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('outcome="timeout"'));

    warnSpy.mockRestore();
  });

  it('a corrupt map status still routes to DownloadMap after a hydration failure, not the generic Main fallback', async () => {
    (OfflineMapStatusService.validateAtStartup as jest.Mock).mockResolvedValue({ status: 'corrupt', reason: 'checksum mismatch' });
    const controllable = controllableStorage();
    useAppStore.persist.setOptions({ storage: controllable.storage });
    const rehydratePromise = useAppStore.persist.rehydrate();
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    await act(async () => {
      render(<SplashScreen />);
    });
    await act(async () => {
      controllable.reject(new Error('AsyncStorage read failed'));
      await rehydratePromise.catch(() => {});
    });
    await flush();

    expect(mockReplaceSpy).toHaveBeenCalledTimes(1);
    expect(mockReplaceSpy).toHaveBeenCalledWith('DownloadMap');
    // Proves the real startup-failure catch branch (which always forces Main) never ran.
    expect(useAppStore.getState().offlineMapStatusMessage).not.toEqual(expect.stringContaining('Startup checks failed'));

    errorSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it('unmounting before hydration settles aborts the wait and never navigates, even if hydration later resolves', async () => {
    const controllable = controllableStorage();
    useAppStore.persist.setOptions({ storage: controllable.storage });
    const rehydratePromise = useAppStore.persist.rehydrate();

    let unmount!: () => Promise<void>;
    await act(async () => {
      const result = await render(<SplashScreen />);
      unmount = result.unmount;
    });
    await flush();
    expect(mockReplaceSpy).not.toHaveBeenCalled();

    await act(async () => {
      await unmount();
    });

    await act(async () => {
      controllable.resolve(null); // late settle, after unmount
      await rehydratePromise;
    });
    await flush();

    expect(mockReplaceSpy).not.toHaveBeenCalled();
  });
});

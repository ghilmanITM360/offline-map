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
  const getItemPromise = new Promise((resolve) => {
    resolveGetItem = resolve;
  });
  return {
    storage: {
      getItem: () => getItemPromise,
      setItem: () => Promise.resolve(),
      removeItem: () => Promise.resolve(),
    },
    resolve: (value: unknown) => resolveGetItem(value),
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

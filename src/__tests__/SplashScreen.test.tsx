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
  OnboardingStatusService: { hasSeenWelcome: jest.fn() },
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
});

afterEach(() => {
  jest.useRealTimers();
});

describe('SplashScreen — persisted-store hydration gate', () => {
  it('fresh install: navigates to Welcome only after hydration completes', async () => {
    (OnboardingStatusService.hasSeenWelcome as jest.Mock).mockResolvedValue(false);
    useAppStore.setState({ hasHydrated: false });

    await act(async () => {
      render(<SplashScreen />);
    });
    // Every other check (including the 1500ms minimum-visible timer) can settle, but
    // navigation must stay withheld while the store is still unhydrated.
    await flush();
    expect(mockReplaceSpy).not.toHaveBeenCalled();

    await act(async () => {
      useAppStore.getState().setHasHydrated(true);
    });
    await flush();

    expect(mockReplaceSpy).toHaveBeenCalledTimes(1);
    expect(mockReplaceSpy).toHaveBeenCalledWith('Welcome');
  });

  it('returning user: navigates to Main only after hydration completes, exactly once', async () => {
    useAppStore.setState({ hasHydrated: false });

    await act(async () => {
      render(<SplashScreen />);
    });
    await flush();
    expect(mockReplaceSpy).not.toHaveBeenCalled();

    await act(async () => {
      useAppStore.getState().setHasHydrated(true);
    });
    await flush();

    expect(mockReplaceSpy).toHaveBeenCalledTimes(1);
    expect(mockReplaceSpy).toHaveBeenCalledWith('Main');
  });

  it('does not evaluate hasSeenMapOverview from a pre-hydration default — waits for the real persisted value', async () => {
    // hasSeenMapOverview defaults to false; simulate a returning user whose real persisted
    // value is true, arriving only once hydration completes (mirrors what HomeScreen's
    // cold-launch camera decision reads once Main mounts after Splash navigates).
    useAppStore.setState({ hasHydrated: false, hasSeenMapOverview: false });

    await act(async () => {
      render(<SplashScreen />);
    });
    await flush();
    expect(mockReplaceSpy).not.toHaveBeenCalled();

    await act(async () => {
      // The real rehydration pass overwrites the in-memory default with the persisted value
      // as part of the same state transition that flips hasHydrated.
      useAppStore.setState({ hasSeenMapOverview: true, hasHydrated: true });
    });
    await flush();

    expect(mockReplaceSpy).toHaveBeenCalledTimes(1);
    // Splash itself doesn't branch on hasSeenMapOverview, but this proves navigation was
    // withheld until the real persisted value (true) was in the store, not the false default.
    expect(useAppStore.getState().hasSeenMapOverview).toBe(true);
  });

  it('never calls navigation.replace more than once even if hydration flips after other checks already settled', async () => {
    useAppStore.setState({ hasHydrated: false });

    await act(async () => {
      render(<SplashScreen />);
    });

    await act(async () => {
      useAppStore.getState().setHasHydrated(true);
    });
    await flush();
    // Flipping again must not trigger a second navigation — Splash's effect runs once per mount.
    await act(async () => {
      useAppStore.getState().setHasHydrated(false);
      useAppStore.getState().setHasHydrated(true);
    });
    await flush();

    expect(mockReplaceSpy).toHaveBeenCalledTimes(1);
  });
});

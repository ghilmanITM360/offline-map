/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { GPSManagerService } from '../services/GPSManagerService';
import { LocationAccessService } from '../services/LocationAccessService';
import { OnboardingStatusService } from '../services/OnboardingStatusService';

jest.mock('expo-location', () => ({
  getForegroundPermissionsAsync: jest.fn(),
  watchPositionAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
  hasServicesEnabledAsync: jest.fn(),
  Accuracy: { Balanced: 3, High: 4 },
}));

// GPSManager's private `appState` field is captured once, at module-load construction time,
// from AppState.currentState — the RN jest mock leaves that as an unset jest.fn(), not the
// string 'active', which would make every start()/forceFix() call below a silent no-op
// (`if (this.appState !== 'active') return;`). TypeScript `private` is compile-time only, so
// setting it directly here is the simplest way to drive it to 'active' for these tests without
// mocking the whole 'react-native' module (which pulls in native-module registration that
// isn't available in this test environment).
function setAppStateActive() {
  (GPSManagerService as unknown as { appState: string }).appState = 'active';
}

function fakeSubscription() {
  return { remove: jest.fn() };
}

function fakeLocation(latitude = 24.86, longitude = 67.05) {
  return { coords: { latitude, longitude, heading: null, accuracy: 5 } };
}

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  GPSManagerService.stop();
  setAppStateActive();
  (Location.watchPositionAsync as jest.Mock).mockResolvedValue(fakeSubscription());
  (Location.hasServicesEnabledAsync as jest.Mock).mockResolvedValue(true);
});

afterEach(() => {
  GPSManagerService.stop();
});

describe('GPSManagerService — granted-permission paths clear a stale skip', () => {
  it('1. start() clears a stale skip once foreground permission is confirmed granted', async () => {
    await OnboardingStatusService.setSkippedLocationPermission(true);
    (Location.getForegroundPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted' });

    await GPSManagerService.start('follow');
    await Promise.resolve(); // start() fires the clear without awaiting it (fire-and-forget)
    await Promise.resolve();

    expect(await OnboardingStatusService.hasSkippedLocationPermission()).toBe(false);
  });

  it('2. forceFix() clears a stale skip once foreground permission is confirmed granted', async () => {
    await OnboardingStatusService.setSkippedLocationPermission(true);
    (Location.getForegroundPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted' });
    (Location.getCurrentPositionAsync as jest.Mock).mockResolvedValue(fakeLocation());

    await GPSManagerService.forceFix();
    await Promise.resolve();
    await Promise.resolve();

    expect(await OnboardingStatusService.hasSkippedLocationPermission()).toBe(false);
  });

  it('3. denied status leaves the skip flag alone for both start() and forceFix()', async () => {
    await OnboardingStatusService.setSkippedLocationPermission(true);
    (Location.getForegroundPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'denied' });

    await GPSManagerService.start('follow');
    expect(await OnboardingStatusService.hasSkippedLocationPermission()).toBe(true);

    await GPSManagerService.forceFix();
    expect(await OnboardingStatusService.hasSkippedLocationPermission()).toBe(true);
  });

  it('4. concurrent start() + forceFix() both confirming granted issue only one AsyncStorage write', async () => {
    await OnboardingStatusService.setSkippedLocationPermission(true);
    (Location.getForegroundPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted' });
    (Location.getCurrentPositionAsync as jest.Mock).mockResolvedValue(fakeLocation());
    const setItemMock = AsyncStorage.setItem as jest.Mock;
    setItemMock.mockClear();

    await Promise.all([GPSManagerService.start('follow'), GPSManagerService.forceFix()]);
    await Promise.resolve();
    await Promise.resolve();

    expect(setItemMock).toHaveBeenCalledTimes(1);
    expect(await OnboardingStatusService.hasSkippedLocationPermission()).toBe(false);
  });

  it('5. GPSManagerService and LocationAccessService confirming granted concurrently also dedupe to one write', async () => {
    await OnboardingStatusService.setSkippedLocationPermission(true);
    (Location.getForegroundPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted', canAskAgain: true });
    (Location.getCurrentPositionAsync as jest.Mock).mockResolvedValue(fakeLocation());
    const setItemMock = AsyncStorage.setItem as jest.Mock;
    setItemMock.mockClear();

    await Promise.all([
      GPSManagerService.forceFix(),
      LocationAccessService.getPermissionState(),
    ]);
    await Promise.resolve();
    await Promise.resolve();

    expect(setItemMock).toHaveBeenCalledTimes(1);
    expect(await OnboardingStatusService.hasSkippedLocationPermission()).toBe(false);
  });

  it('6. a persistence failure does not permanently block a later successful retry', async () => {
    await OnboardingStatusService.setSkippedLocationPermission(true);
    (Location.getForegroundPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted' });
    (Location.getCurrentPositionAsync as jest.Mock).mockResolvedValue(fakeLocation());
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const setItemMock = AsyncStorage.setItem as jest.Mock;
    setItemMock.mockImplementationOnce(() => Promise.reject(new Error('disk full')));

    await GPSManagerService.forceFix();
    await Promise.resolve();
    await Promise.resolve();
    expect(await OnboardingStatusService.hasSkippedLocationPermission()).toBe(true); // write failed, still skipped

    await GPSManagerService.forceFix(); // later retry (setItem no longer forced to reject)
    await Promise.resolve();
    await Promise.resolve();
    expect(await OnboardingStatusService.hasSkippedLocationPermission()).toBe(false);

    errorSpy.mockRestore();
  });

  it('7. the GPS fix itself still succeeds even when the skip-cleanup write fails', async () => {
    await OnboardingStatusService.setSkippedLocationPermission(true);
    (Location.getForegroundPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted' });
    (Location.getCurrentPositionAsync as jest.Mock).mockResolvedValue(fakeLocation(24.9, 67.1));
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const setItemMock = AsyncStorage.setItem as jest.Mock;
    setItemMock.mockImplementation(() => Promise.reject(new Error('disk full')));

    const coordinate = await GPSManagerService.forceFix();

    expect(coordinate).toEqual({ latitude: 24.9, longitude: 67.1, heading: undefined, accuracy: 5 });
    expect(Location.getCurrentPositionAsync).toHaveBeenCalledTimes(1);

    // The fire-and-forget skip-cleanup chain (hasSkippedLocationPermission read, then the
    // rejected setItem write) resolves over more microtask hops than forceFix()'s own single
    // await — flush before restoring the spy so its console.error lands while still mocked,
    // not as a stray unmocked log bleeding into a later test.
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    errorSpy.mockRestore();
  });
});

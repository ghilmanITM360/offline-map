/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { GPSManagerService } from '../services/GPSManagerService';

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

describe('GPSManagerService — does not watch when location services are off', () => {
  it('8. start() does not call watchPositionAsync when hasServicesEnabledAsync resolves false', async () => {
    (Location.getForegroundPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted' });
    (Location.hasServicesEnabledAsync as jest.Mock).mockResolvedValue(false);

    await GPSManagerService.start('follow');

    expect(Location.watchPositionAsync).not.toHaveBeenCalled();
  });

  it('9. start() still calls watchPositionAsync when services are enabled (no regression)', async () => {
    (Location.getForegroundPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted' });
    (Location.hasServicesEnabledAsync as jest.Mock).mockResolvedValue(true);

    await GPSManagerService.start('follow');

    expect(Location.watchPositionAsync).toHaveBeenCalledTimes(1);
  });
});

describe('GPSManagerService — malformed fixes (#147)', () => {
  it.each([
    ['NaN latitude', NaN, 67.05],
    ['Infinity longitude', 24.86, Infinity],
    ['latitude > 90', 91, 67.05],
    ['longitude < -180', 24.86, -181],
  ])('drops a %s fix before the store updater and every listener', async (_n, lat, lng) => {
    setAppStateActive();
    (Location.getForegroundPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted' });
    (Location.getCurrentPositionAsync as jest.Mock).mockResolvedValue(fakeLocation(lat, lng));
    const storeUpdater = jest.fn();
    const listener = jest.fn();
    GPSManagerService.setStoreUpdater(storeUpdater);
    GPSManagerService.addListener(listener);

    expect(await GPSManagerService.forceFix()).toBeNull();
    expect(storeUpdater).not.toHaveBeenCalled();
    expect(listener).not.toHaveBeenCalled();

    GPSManagerService.removeListener(listener);
  });

  it('still delivers a valid fix to the store updater and listeners', async () => {
    setAppStateActive();
    (Location.getForegroundPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted' });
    (Location.getCurrentPositionAsync as jest.Mock).mockResolvedValue(fakeLocation(24.86, 67.05));
    const storeUpdater = jest.fn();
    const listener = jest.fn();
    GPSManagerService.setStoreUpdater(storeUpdater);
    GPSManagerService.addListener(listener);

    await GPSManagerService.forceFix();
    expect(storeUpdater).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledTimes(1);

    GPSManagerService.removeListener(listener);
  });
});

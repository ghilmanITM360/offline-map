/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { LocationAccessService } from '../services/LocationAccessService';
import { OnboardingStatusService } from '../services/OnboardingStatusService';

jest.mock('expo-location', () => ({
  getForegroundPermissionsAsync: jest.fn(),
  requestForegroundPermissionsAsync: jest.fn(),
  hasServicesEnabledAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
  getLastKnownPositionAsync: jest.fn(),
  Accuracy: { Balanced: 3, High: 4 },
  PermissionStatus: { GRANTED: 'granted', DENIED: 'denied', UNDETERMINED: 'undetermined' },
}));

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  (Location.hasServicesEnabledAsync as jest.Mock).mockResolvedValue(true);
});

// Settings routes its permission status checks through getPermissionState().
describe('LocationAccessService.getPermissionState — Settings permission-skip clearing', () => {
  it('clears a stale skip when a status check finds permission already granted', async () => {
    await OnboardingStatusService.setSkippedLocationPermission(true);
    (Location.getForegroundPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted', canAskAgain: true });

    const state = await LocationAccessService.getPermissionState();

    expect(state.granted).toBe(true);
    expect(await OnboardingStatusService.hasSkippedLocationPermission()).toBe(false);
  });

  it('leaves the skip flag alone when the status check finds permission not granted', async () => {
    await OnboardingStatusService.setSkippedLocationPermission(true);
    (Location.getForegroundPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'denied', canAskAgain: true });

    await LocationAccessService.getPermissionState();

    expect(await OnboardingStatusService.hasSkippedLocationPermission()).toBe(true);
  });
});

// Home/Recenter and Directions "current location" both route through resolveCurrentLocation().
describe('LocationAccessService.resolveCurrentLocation — Home/Recenter + Directions permission-skip clearing', () => {
  it('clears a stale skip once a fresh prompt confirms grant', async () => {
    await OnboardingStatusService.setSkippedLocationPermission(true);
    (Location.getForegroundPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'denied', canAskAgain: true });
    (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted', canAskAgain: true });
    (Location.getCurrentPositionAsync as jest.Mock).mockResolvedValue({
      coords: { latitude: 1, longitude: 2, heading: null, accuracy: 5 },
    });

    const resolved = await LocationAccessService.resolveCurrentLocation(true);

    expect(resolved.ok).toBe(true);
    expect(resolved.permissionState.granted).toBe(true);
    expect(await OnboardingStatusService.hasSkippedLocationPermission()).toBe(false);
  });

  it('also clears the skip when permission was already granted before this call (no re-prompt needed)', async () => {
    await OnboardingStatusService.setSkippedLocationPermission(true);
    (Location.getForegroundPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted', canAskAgain: true });
    (Location.getCurrentPositionAsync as jest.Mock).mockResolvedValue({
      coords: { latitude: 1, longitude: 2, heading: null, accuracy: 5 },
    });

    await LocationAccessService.resolveCurrentLocation(true);

    expect(Location.requestForegroundPermissionsAsync).not.toHaveBeenCalled();
    expect(await OnboardingStatusService.hasSkippedLocationPermission()).toBe(false);
  });

  it('does not clear the skip flag when the prompt is denied', async () => {
    await OnboardingStatusService.setSkippedLocationPermission(true);
    (Location.getForegroundPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'denied', canAskAgain: true });
    (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'denied', canAskAgain: true });

    const resolved = await LocationAccessService.resolveCurrentLocation(true);

    expect(resolved.ok).toBe(false);
    expect(resolved.permissionState.granted).toBe(false);
    expect(await OnboardingStatusService.hasSkippedLocationPermission()).toBe(true);
  });

  it('does not clear the skip flag when the prompt is cancelled/dismissed (still undetermined afterward)', async () => {
    await OnboardingStatusService.setSkippedLocationPermission(true);
    (Location.getForegroundPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'undetermined', canAskAgain: true });
    (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'undetermined', canAskAgain: true });

    await LocationAccessService.resolveCurrentLocation(true);

    expect(await OnboardingStatusService.hasSkippedLocationPermission()).toBe(true);
  });

  it('does not clear the skip flag when not prompting at all (allowPrompt=false) and permission is not granted', async () => {
    await OnboardingStatusService.setSkippedLocationPermission(true);
    (Location.getForegroundPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'denied', canAskAgain: true });

    await LocationAccessService.resolveCurrentLocation(false);

    expect(Location.requestForegroundPermissionsAsync).not.toHaveBeenCalled();
    expect(await OnboardingStatusService.hasSkippedLocationPermission()).toBe(true);
  });
});

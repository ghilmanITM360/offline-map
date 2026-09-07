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

// NEW-08 canonical freshness policy: last-known cache is only accepted when it is recent
// and accurate enough to be a trustworthy pedestrian-navigation origin; otherwise treat it
// as no usable location so NavigationOriginResolver falls back to B2.
describe('LocationAccessService.resolveCurrentLocation — origin freshness policy (NEW-08)', () => {
  const NOW = 1_700_000_000_000;

  beforeEach(() => {
    jest.spyOn(Date, 'now').mockReturnValue(NOW);
    (Location.getForegroundPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted', canAskAgain: true });
  });

  afterEach(() => {
    (Date.now as jest.Mock).mockRestore();
  });

  function lastKnown(ageMs: number | null, accuracy: number | null, overrides: Partial<{ latitude: number; longitude: number }> = {}) {
    return {
      coords: { latitude: 24.97, longitude: 67.01, heading: null, accuracy, ...overrides },
      timestamp: ageMs === null ? undefined : NOW - ageMs,
    };
  }

  it('LOC-01: current position succeeds -> live_gps, last-known never consulted', async () => {
    (Location.getCurrentPositionAsync as jest.Mock).mockResolvedValue({
      coords: { latitude: 1, longitude: 2, heading: null, accuracy: 5 },
    });

    const resolved = await LocationAccessService.resolveCurrentLocation();

    expect(resolved.ok).toBe(true);
    expect(resolved.source).toBe('live');
    expect(Location.getLastKnownPositionAsync).not.toHaveBeenCalled();
  });

  it('LOC-02: current fails, last-known age 10s / accuracy 15m -> accepted as device_last_known', async () => {
    (Location.getCurrentPositionAsync as jest.Mock).mockRejectedValue(new Error('unavailable'));
    (Location.getLastKnownPositionAsync as jest.Mock).mockResolvedValue(lastKnown(10_000, 15));

    const resolved = await LocationAccessService.resolveCurrentLocation();

    expect(resolved.ok).toBe(true);
    expect(resolved.source).toBe('device_last_known');
  });

  it('LOC-03: current fails, last-known age 61s -> rejected (no usable location)', async () => {
    (Location.getCurrentPositionAsync as jest.Mock).mockRejectedValue(new Error('unavailable'));
    (Location.getLastKnownPositionAsync as jest.Mock).mockResolvedValue(lastKnown(61_000, 15));

    const resolved = await LocationAccessService.resolveCurrentLocation();

    expect(resolved.ok).toBe(false);
    expect(resolved.coordinate).toBeNull();
    expect(resolved.source).toBeNull();
  });

  it('LOC-04: current fails, last-known accuracy 80m -> rejected (no usable location)', async () => {
    (Location.getCurrentPositionAsync as jest.Mock).mockRejectedValue(new Error('unavailable'));
    (Location.getLastKnownPositionAsync as jest.Mock).mockResolvedValue(lastKnown(10_000, 80));

    const resolved = await LocationAccessService.resolveCurrentLocation();

    expect(resolved.ok).toBe(false);
  });

  it('LOC-05: current fails, last-known missing timestamp -> rejected', async () => {
    (Location.getCurrentPositionAsync as jest.Mock).mockRejectedValue(new Error('unavailable'));
    (Location.getLastKnownPositionAsync as jest.Mock).mockResolvedValue(lastKnown(null, 15));

    const resolved = await LocationAccessService.resolveCurrentLocation();

    expect(resolved.ok).toBe(false);
  });

  it('LOC-06: current fails, last-known has invalid coordinate -> rejected', async () => {
    (Location.getCurrentPositionAsync as jest.Mock).mockRejectedValue(new Error('unavailable'));
    (Location.getLastKnownPositionAsync as jest.Mock).mockResolvedValue(
      lastKnown(10_000, 15, { latitude: Number.NaN }),
    );

    const resolved = await LocationAccessService.resolveCurrentLocation();

    expect(resolved.ok).toBe(false);
  });

  it('LOC-07: permission denied -> no usable location', async () => {
    (Location.getForegroundPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'denied', canAskAgain: true });

    const resolved = await LocationAccessService.resolveCurrentLocation(false);

    expect(resolved.ok).toBe(false);
    expect(Location.getLastKnownPositionAsync).not.toHaveBeenCalled();
  });

  it('LOC-08: location services disabled -> no usable location', async () => {
    (Location.hasServicesEnabledAsync as jest.Mock).mockResolvedValue(false);

    const resolved = await LocationAccessService.resolveCurrentLocation();

    expect(resolved.ok).toBe(false);
    expect(Location.getLastKnownPositionAsync).not.toHaveBeenCalled();
  });

  it('LOC-09: no current and no cache -> no usable location', async () => {
    (Location.getCurrentPositionAsync as jest.Mock).mockRejectedValue(new Error('unavailable'));
    (Location.getLastKnownPositionAsync as jest.Mock).mockResolvedValue(null);

    const resolved = await LocationAccessService.resolveCurrentLocation();

    expect(resolved.ok).toBe(false);
  });

  it('LOC-10: fresh current succeeds even when a stale cache exists -> live_gps wins', async () => {
    (Location.getCurrentPositionAsync as jest.Mock).mockResolvedValue({
      coords: { latitude: 1, longitude: 2, heading: null, accuracy: 5 },
    });
    (Location.getLastKnownPositionAsync as jest.Mock).mockResolvedValue(lastKnown(120_000, 200));

    const resolved = await LocationAccessService.resolveCurrentLocation();

    expect(resolved.source).toBe('live');
  });

  it('LOC-11: cache exactly at the age/accuracy thresholds is accepted (inclusive boundary)', async () => {
    (Location.getCurrentPositionAsync as jest.Mock).mockRejectedValue(new Error('unavailable'));
    (Location.getLastKnownPositionAsync as jest.Mock).mockResolvedValue(lastKnown(60_000, 50));

    const resolved = await LocationAccessService.resolveCurrentLocation();

    expect(resolved.ok).toBe(true);
    expect(resolved.source).toBe('device_last_known');
  });

  it('LOC-11b: one millisecond/meter past either threshold is rejected', async () => {
    (Location.getCurrentPositionAsync as jest.Mock).mockRejectedValue(new Error('unavailable'));
    (Location.getLastKnownPositionAsync as jest.Mock).mockResolvedValue(lastKnown(60_001, 50));

    const resolved = await LocationAccessService.resolveCurrentLocation();

    expect(resolved.ok).toBe(false);
  });

  it('LOC-12: future timestamp (clock anomaly) is rejected rather than trusted', async () => {
    (Location.getCurrentPositionAsync as jest.Mock).mockRejectedValue(new Error('unavailable'));
    (Location.getLastKnownPositionAsync as jest.Mock).mockResolvedValue(lastKnown(-5_000, 15));

    const resolved = await LocationAccessService.resolveCurrentLocation();

    expect(resolved.ok).toBe(false);
  });
});

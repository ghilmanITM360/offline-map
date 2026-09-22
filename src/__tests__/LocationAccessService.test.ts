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
describe('LocationAccessService.getPermissionState — permission precision', () => {
  it('reports fine precision from the Android permission response', async () => {
    (Location.getForegroundPermissionsAsync as jest.Mock).mockResolvedValue({
      status: 'granted',
      canAskAgain: true,
      android: { accuracy: 'fine' },
    });

    const state = await LocationAccessService.getPermissionState();

    expect(state.precision).toBe('fine');
  });

  it('reports coarse precision as-is even when not accompanied by a bad accuracy reading', async () => {
    (Location.getForegroundPermissionsAsync as jest.Mock).mockResolvedValue({
      status: 'granted',
      canAskAgain: true,
      android: { accuracy: 'coarse' },
    });

    const state = await LocationAccessService.getPermissionState();

    expect(state.precision).toBe('coarse');
  });

  it('reports none precision when permission is not granted', async () => {
    (Location.getForegroundPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'denied', canAskAgain: true });

    const state = await LocationAccessService.getPermissionState();

    expect(state.precision).toBe('none');
  });

  it('treats a failed services query as unknown, not enabled', async () => {
    (Location.getForegroundPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted', canAskAgain: true });
    (Location.hasServicesEnabledAsync as jest.Mock).mockRejectedValue(new Error('provider check unsupported'));

    const state = await LocationAccessService.getPermissionState();

    expect(state.servicesState).toBe('unknown');
    expect(state.servicesEnabled).toBe(false);
  });
});

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

describe('LocationAccessService.resolveCurrentLocation — capability-safe fallback', () => {
  it('LOC-01: granted permission with device services off never requests or invents a location', async () => {
    (Location.getForegroundPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted', canAskAgain: true });
    (Location.hasServicesEnabledAsync as jest.Mock).mockResolvedValue(false);

    const resolved = await LocationAccessService.resolveCurrentLocation(false);

    expect(resolved).toMatchObject({
      ok: false,
      coordinate: null,
      source: null,
      message: 'Device location is turned off. Enable location services and try again.',
    });
    expect(Location.getCurrentPositionAsync).not.toHaveBeenCalled();
    expect(Location.getLastKnownPositionAsync).not.toHaveBeenCalled();
  });

  it('LOC-05: rejects a device last-known fix that does not meet freshness and accuracy limits', async () => {
    (Location.getForegroundPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted', canAskAgain: true });
    (Location.getCurrentPositionAsync as jest.Mock).mockRejectedValue(new Error('no live fix'));
    (Location.getLastKnownPositionAsync as jest.Mock).mockResolvedValue(null);

    const resolved = await LocationAccessService.resolveCurrentLocation(false);

    expect(Location.getLastKnownPositionAsync).toHaveBeenCalledWith({
      maxAge: 30_000,
      requiredAccuracy: 50,
    });
    expect(resolved).toMatchObject({
      ok: false,
      coordinate: null,
      source: null,
      message: 'Current location is unavailable. Choose start manually.',
    });
  });

  it('treats a failed services query as unknown, not enabled, and still attempts a live fix', async () => {
    (Location.getForegroundPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted', canAskAgain: true });
    (Location.hasServicesEnabledAsync as jest.Mock).mockRejectedValue(new Error('provider check unsupported'));
    (Location.getCurrentPositionAsync as jest.Mock).mockResolvedValue({
      coords: { latitude: 24.96, longitude: 67.01, heading: null, accuracy: 8 },
      timestamp: 1_790_000_000_000,
    });

    const resolved = await LocationAccessService.resolveCurrentLocation(false);

    expect(resolved.permissionState.servicesState).toBe('unknown');
    expect(resolved.permissionState.servicesEnabled).toBe(false);
    expect(resolved.ok).toBe(true);
    expect(resolved.source).toBe('live');
  });

  it('preserves native observation time when a bounded device last-known fix is accepted', async () => {
    (Location.getForegroundPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted', canAskAgain: true });
    (Location.getCurrentPositionAsync as jest.Mock).mockRejectedValue(new Error('no live fix'));
    (Location.getLastKnownPositionAsync as jest.Mock).mockResolvedValue({
      coords: { latitude: 24.96, longitude: 67.01, heading: null, accuracy: 12 },
      timestamp: 1_790_000_000_000,
    });

    const resolved = await LocationAccessService.resolveCurrentLocation(false);

    expect(resolved).toMatchObject({
      ok: true,
      source: 'device_last_known',
      coordinate: {
        latitude: 24.96,
        longitude: 67.01,
        accuracy: 12,
        observedAtMs: 1_790_000_000_000,
      },
    });
  });
});

// #89: getCurrentPositionAsync exposes no application-level timeout. A native Promise that
// never settles (confirmed possible per Expo SDK 54 docs — no timeout option exists) must not
// leave resolveCurrentLocation waiting indefinitely.
describe('LocationAccessService.resolveCurrentLocation — #89 bounded current-position timeout', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('89-01: a current-position fix that never settles is bounded by a timeout, not left indefinitely pending', async () => {
    (Location.getForegroundPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted', canAskAgain: true });
    (Location.getCurrentPositionAsync as jest.Mock).mockReturnValue(new Promise(() => {}));
    (Location.getLastKnownPositionAsync as jest.Mock).mockResolvedValue(null);

    const resolvePromise = LocationAccessService.resolveCurrentLocation(false);
    await jest.advanceTimersByTimeAsync(20_000);
    const resolved = await resolvePromise;

    expect(resolved).toMatchObject({
      ok: false,
      coordinate: null,
      source: null,
      message: 'Current location is unavailable. Choose start manually.',
    });
    expect(Location.getLastKnownPositionAsync).toHaveBeenCalled();
  });

  it('89-02: a fast-resolving current-position fix is used directly, unaffected by the timeout race', async () => {
    (Location.getForegroundPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted', canAskAgain: true });
    (Location.getCurrentPositionAsync as jest.Mock).mockResolvedValue({
      coords: { latitude: 24.96, longitude: 67.01, heading: null, accuracy: 8 },
      timestamp: 1_790_000_000_000,
    });

    const resolved = await LocationAccessService.resolveCurrentLocation(false);

    expect(resolved.ok).toBe(true);
    expect(resolved.source).toBe('live');
    expect(Location.getLastKnownPositionAsync).not.toHaveBeenCalled();
  });

  it('89-03: on timeout, a qualifying last-known fix is offered but never silently presented as a live fix', async () => {
    (Location.getForegroundPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted', canAskAgain: true });
    (Location.getCurrentPositionAsync as jest.Mock).mockReturnValue(new Promise(() => {}));
    (Location.getLastKnownPositionAsync as jest.Mock).mockResolvedValue({
      coords: { latitude: 24.96, longitude: 67.01, heading: null, accuracy: 12 },
      timestamp: 1_790_000_000_000,
    });

    const resolvePromise = LocationAccessService.resolveCurrentLocation(false);
    await jest.advanceTimersByTimeAsync(20_000);
    const resolved = await resolvePromise;

    expect(resolved.ok).toBe(true);
    expect(resolved.source).toBe('device_last_known');
    expect(resolved.source).not.toBe('live');
  });

  // Promise.race does not cancel its loser: a timed-out getCurrentPositionAsync call keeps
  // running in the background after resolveCurrentLocation() has already returned. These prove
  // that orphaned promise can never surface in a later/retry call's result — each call only
  // consumes its own race, so a stale loser settling late has no subscriber left to reach.
  it('RETRY-89-01: after a timeout, a fresh retry call produces its own independent result', async () => {
    (Location.getForegroundPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted', canAskAgain: true });
    (Location.getCurrentPositionAsync as jest.Mock).mockReturnValueOnce(new Promise(() => {}));
    (Location.getLastKnownPositionAsync as jest.Mock).mockResolvedValue(null);

    const firstCall = LocationAccessService.resolveCurrentLocation(false);
    await jest.advanceTimersByTimeAsync(20_000);
    expect(await firstCall).toMatchObject({ ok: false, source: null });

    (Location.getCurrentPositionAsync as jest.Mock).mockResolvedValueOnce({
      coords: { latitude: 24.96, longitude: 67.01, heading: null, accuracy: 8 },
      timestamp: 1_790_000_000_000,
    });
    const retryResult = await LocationAccessService.resolveCurrentLocation(false);

    expect(retryResult).toMatchObject({ ok: true, source: 'live' });
  });

  it('RETRY-89-02: first attempt times out, second succeeds — only the second produces a coordinate', async () => {
    (Location.getForegroundPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted', canAskAgain: true });
    (Location.getLastKnownPositionAsync as jest.Mock).mockResolvedValue(null);
    (Location.getCurrentPositionAsync as jest.Mock)
      .mockReturnValueOnce(new Promise(() => {}))
      .mockResolvedValueOnce({
        coords: { latitude: 24.97, longitude: 67.02, heading: null, accuracy: 6 },
        timestamp: 1_790_000_001_000,
      });

    const firstCall = LocationAccessService.resolveCurrentLocation(false);
    await jest.advanceTimersByTimeAsync(20_000);
    const firstResult = await firstCall;
    const secondResult = await LocationAccessService.resolveCurrentLocation(false);

    expect(firstResult.coordinate).toBeNull();
    expect(secondResult.coordinate).toMatchObject({ latitude: 24.97, longitude: 67.02 });
  });

  it('RETRY-89-03: a timed-out first attempt resolving late (after a second attempt already finished) has zero effect', async () => {
    (Location.getForegroundPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted', canAskAgain: true });
    (Location.getLastKnownPositionAsync as jest.Mock).mockResolvedValue(null);
    let resolveStaleFirstAttempt: (value: { coords: Record<string, unknown> }) => void;
    (Location.getCurrentPositionAsync as jest.Mock)
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveStaleFirstAttempt = resolve;
        }),
      )
      .mockResolvedValueOnce({
        coords: { latitude: 24.98, longitude: 67.03, heading: null, accuracy: 5 },
        timestamp: 1_790_000_002_000,
      });

    const firstCall = LocationAccessService.resolveCurrentLocation(false);
    await jest.advanceTimersByTimeAsync(20_000); // first attempt times out; its native promise is still unresolved
    await firstCall;

    const secondResult = await LocationAccessService.resolveCurrentLocation(false);
    expect(secondResult.coordinate).toMatchObject({ latitude: 24.98, longitude: 67.03 });

    // Stale first attempt now settles, long after both calls above have already returned.
    resolveStaleFirstAttempt!({ coords: { latitude: 1, longitude: 1, heading: null, accuracy: 1 } });
    await jest.advanceTimersByTimeAsync(0);

    // Nothing was ever subscribed to the stale promise outside its own (already-settled) race,
    // so the second call's already-returned result is untouched.
    expect(secondResult.coordinate).toMatchObject({ latitude: 24.98, longitude: 67.03 });
  });
});

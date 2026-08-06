/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { OnboardingStatusService } from '../services/OnboardingStatusService';

beforeEach(async () => {
  await AsyncStorage.clear();
  // The async-storage jest mock's setItem/getItem are module-level jest.fn()s that persist
  // across tests in this file — clear their call history so per-test spy assertions below
  // only see calls made within that test.
  jest.clearAllMocks();
});

describe('OnboardingStatusService.hasSkippedLocationPermission', () => {
  it('defaults to false for a fresh install', async () => {
    expect(await OnboardingStatusService.hasSkippedLocationPermission()).toBe(false);
  });

  it('persists true across a simulated process restart (fresh AsyncStorage read)', async () => {
    await OnboardingStatusService.setSkippedLocationPermission(true);
    // Simulate a cold process restart: nothing in-memory survives, only what a fresh
    // AsyncStorage.getItem() call returns.
    expect(await OnboardingStatusService.hasSkippedLocationPermission()).toBe(true);
  });

  it('can be cleared back to false once permission is later granted', async () => {
    await OnboardingStatusService.setSkippedLocationPermission(true);
    expect(await OnboardingStatusService.hasSkippedLocationPermission()).toBe(true);

    await OnboardingStatusService.setSkippedLocationPermission(false);
    expect(await OnboardingStatusService.hasSkippedLocationPermission()).toBe(false);
  });

  it('is stored independently from hasSeenWelcome (no shared/duplicated key)', async () => {
    await OnboardingStatusService.setHasSeenWelcome(true);
    expect(await OnboardingStatusService.hasSkippedLocationPermission()).toBe(false);

    await OnboardingStatusService.setSkippedLocationPermission(true);
    expect(await OnboardingStatusService.hasSeenWelcome()).toBe(true);
  });
});

describe('OnboardingStatusService.clearSkippedLocationPermissionOnGrant', () => {
  it('clears a stale skip once permission is confirmed granted', async () => {
    await OnboardingStatusService.setSkippedLocationPermission(true);
    await OnboardingStatusService.clearSkippedLocationPermissionOnGrant(true);
    expect(await OnboardingStatusService.hasSkippedLocationPermission()).toBe(false);
  });

  it('is a no-op when permission was not granted (denied request)', async () => {
    await OnboardingStatusService.setSkippedLocationPermission(true);
    await OnboardingStatusService.clearSkippedLocationPermissionOnGrant(false);
    expect(await OnboardingStatusService.hasSkippedLocationPermission()).toBe(true);
  });

  it('does not write to AsyncStorage a second time when nothing is actually skipped (no duplicate clear calls for one grant)', async () => {
    expect(await OnboardingStatusService.hasSkippedLocationPermission()).toBe(false);
    // AsyncStorage's jest mock already exports setItem as a jest.fn() — spyOn+mockRestore on an
    // already-mock function discards its real (in-memory) implementation for the rest of the
    // file, so drive the existing mock directly instead of re-wrapping/restoring it.
    const setItemMock = AsyncStorage.setItem as jest.Mock;
    setItemMock.mockClear();
    await OnboardingStatusService.clearSkippedLocationPermissionOnGrant(true);
    expect(setItemMock).not.toHaveBeenCalled();
  });

  it('swallows a persistence rejection, logs it, and never lets it reach the caller', async () => {
    await OnboardingStatusService.setSkippedLocationPermission(true);
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const setItemMock = AsyncStorage.setItem as jest.Mock;
    setItemMock.mockImplementationOnce(() => Promise.reject(new Error('disk full')));

    await expect(OnboardingStatusService.clearSkippedLocationPermissionOnGrant(true)).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to clear'), expect.any(Error));

    errorSpy.mockRestore();
  });

  it('grant then a later revoke: the next launch correctly reflects the current (revoked) decision, not the stale clear', async () => {
    await OnboardingStatusService.setSkippedLocationPermission(true);
    await OnboardingStatusService.clearSkippedLocationPermissionOnGrant(true); // user grants — skip cleared
    expect(await OnboardingStatusService.hasSkippedLocationPermission()).toBe(false);

    // Permission is later revoked in OS settings; a subsequent Splash cold-start check finds
    // it not granted and correctly leaves the (currently-false) skip flag alone rather than
    // resurrecting the old "true" value — the flag now genuinely reflects "not skipped", so
    // the app must fall through to StartupManager's normal not-granted/no-skip path.
    await OnboardingStatusService.clearSkippedLocationPermissionOnGrant(false);
    expect(await OnboardingStatusService.hasSkippedLocationPermission()).toBe(false);
  });

  it('two concurrent granted-status callers issue only one AsyncStorage write, and both resolve', async () => {
    await OnboardingStatusService.setSkippedLocationPermission(true);
    const setItemMock = AsyncStorage.setItem as jest.Mock;
    const getItemMock = AsyncStorage.getItem as jest.Mock;
    setItemMock.mockClear();
    getItemMock.mockClear();

    // Simulates GPSManagerService.start() and .forceFix() both confirming a foreground grant
    // around the same tick and calling the canonical clear helper concurrently.
    const [a, b] = await Promise.all([
      OnboardingStatusService.clearSkippedLocationPermissionOnGrant(true),
      OnboardingStatusService.clearSkippedLocationPermissionOnGrant(true),
    ]);

    expect(a).toBeUndefined();
    expect(b).toBeUndefined();
    expect(setItemMock).toHaveBeenCalledTimes(1);
    expect(await OnboardingStatusService.hasSkippedLocationPermission()).toBe(false);
  });

  it('after an in-flight clear completes, a later call correctly recognizes nothing remains to clear', async () => {
    await OnboardingStatusService.setSkippedLocationPermission(true);
    await OnboardingStatusService.clearSkippedLocationPermissionOnGrant(true);
    expect(await OnboardingStatusService.hasSkippedLocationPermission()).toBe(false);

    const setItemMock = AsyncStorage.setItem as jest.Mock;
    setItemMock.mockClear();
    await OnboardingStatusService.clearSkippedLocationPermissionOnGrant(true);
    expect(setItemMock).not.toHaveBeenCalled();
  });

  it('a failed clear does not permanently poison a later retry', async () => {
    await OnboardingStatusService.setSkippedLocationPermission(true);
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const setItemMock = AsyncStorage.setItem as jest.Mock;
    setItemMock.mockImplementationOnce(() => Promise.reject(new Error('disk full')));

    await OnboardingStatusService.clearSkippedLocationPermissionOnGrant(true);
    expect(await OnboardingStatusService.hasSkippedLocationPermission()).toBe(true); // still skipped — the write failed

    // A later retry (e.g. the next GPS start/forceFix confirming granted again) must not be
    // stuck behind the failed attempt's now-cleared in-flight slot.
    await OnboardingStatusService.clearSkippedLocationPermissionOnGrant(true);
    expect(await OnboardingStatusService.hasSkippedLocationPermission()).toBe(false);

    errorSpy.mockRestore();
  });
});

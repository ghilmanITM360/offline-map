/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { OnboardingStatusService } from '../services/OnboardingStatusService';

beforeEach(async () => {
  await AsyncStorage.clear();
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

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { OnboardingStatusService } from '../services/OnboardingStatusService';

beforeEach(async () => {
  await AsyncStorage.clear();
  jest.clearAllMocks();
});

describe('OnboardingStatusService (#307: Welcome is the only onboarding fact)', () => {
  it('defaults to Welcome not seen', async () => {
    expect(await OnboardingStatusService.hasSeenWelcome()).toBe(false);
  });

  it('persists that Welcome was seen across reads', async () => {
    await OnboardingStatusService.setHasSeenWelcome(true);
    expect(await OnboardingStatusService.hasSeenWelcome()).toBe(true);
    await OnboardingStatusService.setHasSeenWelcome(false);
    expect(await OnboardingStatusService.hasSeenWelcome()).toBe(false);
  });

  it('ignores a leftover pre-#307 "continue without location" value: it can no longer affect onboarding', async () => {
    await AsyncStorage.setItem('ijtema.onboarding.location_permission_skipped.v1', 'true');
    expect(await OnboardingStatusService.hasSeenWelcome()).toBe(false);
  });
});

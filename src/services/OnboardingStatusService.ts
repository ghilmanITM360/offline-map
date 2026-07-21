/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const ONBOARDING_WELCOME_SEEN_KEY = 'ijtema.onboarding.welcome_seen.v1';

export class OnboardingStatusService {
  static async hasSeenWelcome(): Promise<boolean> {
    return (await AsyncStorage.getItem(ONBOARDING_WELCOME_SEEN_KEY)) === 'true';
  }

  static async setHasSeenWelcome(seen: boolean): Promise<void> {
    await AsyncStorage.setItem(ONBOARDING_WELCOME_SEEN_KEY, seen ? 'true' : 'false');
  }
}

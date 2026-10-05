/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const ONBOARDING_WELCOME_SEEN_KEY = 'ijtema.onboarding.welcome_seen.v1';

// Location is optional and asked in context (#307): the only onboarding fact the app keeps is that Welcome was seen.
// (Builds before #307 also stored `ijtema.onboarding.location_permission_skipped.v1`; nothing reads it any more.)
export class OnboardingStatusService {
  static async hasSeenWelcome(): Promise<boolean> {
    return (await AsyncStorage.getItem(ONBOARDING_WELCOME_SEEN_KEY)) === 'true';
  }

  static async setHasSeenWelcome(seen: boolean): Promise<void> {
    await AsyncStorage.setItem(ONBOARDING_WELCOME_SEEN_KEY, seen ? 'true' : 'false');
  }
}

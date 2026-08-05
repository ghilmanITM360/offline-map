/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const ONBOARDING_WELCOME_SEEN_KEY = 'ijtema.onboarding.welcome_seen.v1';
const LOCATION_PERMISSION_SKIPPED_KEY = 'ijtema.onboarding.location_permission_skipped.v1';

export class OnboardingStatusService {
  static async hasSeenWelcome(): Promise<boolean> {
    return (await AsyncStorage.getItem(ONBOARDING_WELCOME_SEEN_KEY)) === 'true';
  }

  static async setHasSeenWelcome(seen: boolean): Promise<void> {
    await AsyncStorage.setItem(ONBOARDING_WELCOME_SEEN_KEY, seen ? 'true' : 'false');
  }

  /**
   * True once the user has confirmed "Continue Without Location" on the Permission screen.
   * This is the single canonical persisted source for that decision — StartupManager reads
   * it (via SplashScreen) to bypass the mandatory Permission screen on future cold launches
   * instead of re-prompting every time. Cleared back to false wherever real OS permission is
   * confirmed granted (SplashScreen's cold-launch check, PermissionViewModel's explicit
   * request flow) so a later revocation is treated as fresh, not as a still-standing skip.
   */
  static async hasSkippedLocationPermission(): Promise<boolean> {
    return (await AsyncStorage.getItem(LOCATION_PERMISSION_SKIPPED_KEY)) === 'true';
  }

  static async setSkippedLocationPermission(skipped: boolean): Promise<void> {
    await AsyncStorage.setItem(LOCATION_PERMISSION_SKIPPED_KEY, skipped ? 'true' : 'false');
  }
}

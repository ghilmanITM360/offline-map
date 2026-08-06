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

  /**
   * Canonical, single call point for "a foreground location permission grant is now
   * confirmed" across every entry surface — the Permission screen, Settings, Home/Recenter
   * and Directions current-location (both via LocationAccessService), and Splash's cold-start
   * reconciliation. Clears a stale "Continue Without Location" skip so a later revocation is
   * treated as fresh, not as a still-standing skip.
   *
   * A no-op when `granted` is false — denied/cancelled requests must never clear the skip —
   * and when nothing is actually skipped, which avoids a redundant AsyncStorage write on every
   * routine permission check (Settings and LocationAccessService call this on every status
   * read, granted or not). Per-caller "was it just granted" vs. "was it merely found already
   * granted" distinction is deliberately not made here — either is a safe signal to supersede
   * a stale skip.
   *
   * Never throws: a persistence failure here must not block or fail the caller's actual
   * location flow, so it's logged and swallowed.
   */
  static async clearSkippedLocationPermissionOnGrant(granted: boolean): Promise<void> {
    if (!granted) return;
    try {
      const skipped = await this.hasSkippedLocationPermission();
      if (!skipped) return;
      await this.setSkippedLocationPermission(false);
    } catch (error) {
      console.error('[OnboardingStatusService] Failed to clear the skipped-location-permission preference after a successful grant.', error);
    }
  }
}

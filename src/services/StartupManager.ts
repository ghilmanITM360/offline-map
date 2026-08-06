/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { OfflineMapStatus } from '../models/types';
import { RootStackParamList } from '../navigation/RootNavigator';

export type SetupPhase = 'first_install' | 'incomplete_setup' | 'ready';

export type StartupRoute = Extract<keyof RootStackParamList, 'Welcome' | 'Permission' | 'DownloadMap' | 'Main'>;

export interface StartupChecks {
  hasSeenWelcome: boolean;
  permissionGranted: boolean;
  /** True once the user has confirmed "Continue Without Location" — see
   * OnboardingStatusService.hasSkippedLocationPermission(). Bypasses the mandatory
   * Permission route below so a returning user who already skipped isn't re-prompted
   * every launch. */
  skippedLocationPermission: boolean;
  offlineMapStatus: OfflineMapStatus;
  graphOnlyModeEnabled: boolean;
  skippedOnlineModeEnabled: boolean;
  isConnected: boolean;
}

export interface StartupResolution {
  phase: SetupPhase;
  route: StartupRoute;
}

/**
 * Single resolver for the Splash routing decision. Behavior is unchanged from the
 * previous inline if/else chain in SplashScreen — this only names the six branches so
 * they read as three flows (first install / incomplete setup / ready) instead of an
 * unlabeled sequence of early returns.
 */
export class StartupManager {
  static resolve(checks: StartupChecks): StartupResolution {
    if (!checks.hasSeenWelcome) {
      return { phase: 'first_install', route: 'Welcome' };
    }

    if (!checks.permissionGranted && !checks.skippedLocationPermission) {
      return { phase: 'first_install', route: 'Permission' };
    }

    if (checks.offlineMapStatus === 'downloaded') {
      return { phase: 'ready', route: 'Main' };
    }

    if (checks.offlineMapStatus === 'corrupt' || checks.offlineMapStatus === 'needs_update') {
      return { phase: 'incomplete_setup', route: 'DownloadMap' };
    }

    if (checks.graphOnlyModeEnabled && checks.offlineMapStatus === 'not_downloaded') {
      return { phase: 'ready', route: 'Main' };
    }

    if (checks.skippedOnlineModeEnabled && checks.offlineMapStatus === 'not_downloaded') {
      // User already chose "Use Online Mode" once — don't re-prompt every launch.
      return { phase: 'ready', route: 'Main' };
    }

    if (!checks.isConnected && checks.offlineMapStatus === 'not_downloaded') {
      // No internet AND no map — go to Main in graph-only mode.
      return { phase: 'ready', route: 'Main' };
    }

    // Have internet, no map yet, never chosen a mode before — go to download.
    return { phase: 'incomplete_setup', route: 'DownloadMap' };
  }
}

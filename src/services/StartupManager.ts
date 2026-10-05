/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { RootStackParamList } from '../navigation/RootNavigator';

export type SetupPhase = 'first_install' | 'ready';

export type StartupRoute = Extract<keyof RootStackParamList, 'Welcome' | 'Permission' | 'LocationsDirectory'>;

export interface StartupChecks {
  hasSeenWelcome: boolean;
  permissionGranted: boolean;
  /** True once the user has confirmed "Continue Without Location" — see
   * OnboardingStatusService.hasSkippedLocationPermission(). Bypasses the mandatory
   * Permission route below so a returning user who already skipped isn't re-prompted
   * every launch. */
  skippedLocationPermission: boolean;
}

export interface StartupResolution {
  phase: SetupPhase;
  route: StartupRoute;
}

/**
 * Single resolver for the Splash routing decision. The venue basemap ships inside the app (#140), so there is no map
 * download/setup step: a returning user goes straight to the Directory, a first-time user Welcome → Permission → Directory.
 */
export class StartupManager {
  static resolve(checks: StartupChecks): StartupResolution {
    if (!checks.hasSeenWelcome) {
      return { phase: 'first_install', route: 'Welcome' };
    }

    if (!checks.permissionGranted && !checks.skippedLocationPermission) {
      return { phase: 'first_install', route: 'Permission' };
    }

    return { phase: 'ready', route: 'LocationsDirectory' };
  }
}

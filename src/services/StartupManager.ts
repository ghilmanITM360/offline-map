/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { RootStackParamList } from '../navigation/RootNavigator';

export type SetupPhase = 'first_install' | 'ready';

export type StartupRoute = Extract<keyof RootStackParamList, 'Welcome' | 'LocationsDirectory'>;

export interface StartupChecks {
  hasSeenWelcome: boolean;
}

export interface StartupResolution {
  phase: SetupPhase;
  route: StartupRoute;
}

/**
 * Single resolver for the Splash routing decision. The venue basemap ships inside the app (#140) and location is
 * optional (#307): a first-time user sees Welcome once, everyone else lands on the Directory. Location permission
 * is asked in context (live guidance, "use my location", recenter), never as a launch gate, so a user who declined
 * is not asked again at every launch.
 */
export class StartupManager {
  static resolve(checks: StartupChecks): StartupResolution {
    if (!checks.hasSeenWelcome) {
      return { phase: 'first_install', route: 'Welcome' };
    }
    return { phase: 'ready', route: 'LocationsDirectory' };
  }
}

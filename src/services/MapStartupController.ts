/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Coordinate } from '../models/types';

export interface MapStartupChecks {
  /** False only until the very first cold-launch venue-overview fit has completed —
   * see useAppStore's hasSeenMapOverview. */
  hasSeenMapOverview: boolean;
  hasLocationPermission: boolean;
  /** Live GPS fix, or a remembered last-known fallback — either counts as "GPS available". */
  gpsCoordinate: Coordinate | null;
}

export type MapStartupCameraDecision =
  | { action: 'FIT_VENUE_BOUNDS'; reason: 'first_overview' | 'no_gps' }
  | { action: 'ANIMATE_TO_USER'; coordinate: Coordinate };

/**
 * Decides the single one-shot cold-launch camera move (Google Maps principles, adapted
 * for a single venue): first install ever -> venue overview; returning + GPS -> straight
 * to user; no GPS -> venue overview fallback. Pure decision only — the caller (HomeScreen's
 * onMapReady) is responsible for actually calling CameraManager and for the one-shot guard
 * (coldLaunchCameraDoneRef), same division of labor as StartupManager.resolve() vs the
 * screen that navigates on its result.
 */
export class MapStartupController {
  static resolveColdLaunchCamera(checks: MapStartupChecks): MapStartupCameraDecision {
    if (!checks.hasSeenMapOverview) {
      return { action: 'FIT_VENUE_BOUNDS', reason: 'first_overview' };
    }

    if (checks.hasLocationPermission && checks.gpsCoordinate) {
      return { action: 'ANIMATE_TO_USER', coordinate: checks.gpsCoordinate };
    }

    return { action: 'FIT_VENUE_BOUNDS', reason: 'no_gps' };
  }
}

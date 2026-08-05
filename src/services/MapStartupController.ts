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
 * Minimal shape MapStartupController needs from LocationAccessService.resolveCurrentLocation
 * — kept as a local interface (not a direct service import) so this stays a pure, easily
 * unit-testable decision class with no service-layer coupling. `source` is only ever treated
 * as "fresh" when it is exactly 'live' — a device-level cached fix ('device_last_known') is
 * NOT fresh and must not auto-animate the camera, same as the app's own persisted
 * lastKnownLocation (see resolveReturningLaunchCamera below).
 */
export interface FreshLocationResolution {
  ok: boolean;
  coordinate: Coordinate | null;
  source: string | null;
}

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

  /**
   * Returning-launch variant (pre-APK correction — see docs on the fresh-GPS-vs-remembered
   * fix). The sync resolveColdLaunchCamera above is fed `currentLocation ?? lastKnownLocation`
   * by its caller, which on a cold launch almost always resolves to the *persisted*
   * lastKnownLocation from a previous session (the live GPS watch hasn't produced a fix yet
   * at onMapReady time) — silently presenting a stale coordinate as the live camera target.
   * This variant instead resolves a fresh fix itself, through the caller-supplied resolver
   * (LocationAccessService.resolveCurrentLocation in production), and only ever animates to a
   * result explicitly labelled 'live' — never a stale persisted or device-cached fallback.
   * First-install and no-permission short-circuit before the resolver is ever invoked, so
   * neither path's behavior or timing changes from resolveColdLaunchCamera above.
   */
  static async resolveReturningLaunchCamera(
    checks: { hasSeenMapOverview: boolean; hasLocationPermission: boolean },
    resolveFreshLocation: () => Promise<FreshLocationResolution>,
  ): Promise<MapStartupCameraDecision> {
    if (!checks.hasSeenMapOverview) {
      return { action: 'FIT_VENUE_BOUNDS', reason: 'first_overview' };
    }

    if (!checks.hasLocationPermission) {
      return { action: 'FIT_VENUE_BOUNDS', reason: 'no_gps' };
    }

    const resolved = await resolveFreshLocation();
    if (resolved.ok && resolved.source === 'live' && resolved.coordinate) {
      return { action: 'ANIMATE_TO_USER', coordinate: resolved.coordinate };
    }

    return { action: 'FIT_VENUE_BOUNDS', reason: 'no_gps' };
  }
}

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Coordinate } from '../models/types';
import { IJTEMA_BLOCKS } from '../data/ijtema';
import type { LocationResolveResult } from './LocationAccessService';
import { t, tIn, venueName } from './serviceI18n';

export interface MapStartupChecks {
  /** Persisted marker (useAppStore.hasSeenMapOverview) set after the first Map entry commits its overview.
   * Informational today: only resolveColdLaunchCamera reads it, and production uses resolveReturningLaunchCamera
   * + planEntryCamera instead (see HomeScreen's startup camera decision). */
  hasSeenMapOverview: boolean;
  hasLocationPermission: boolean;
  /** Live GPS fix, or a remembered last-known fallback — either counts as "GPS available". */
  gpsCoordinate: Coordinate | null;
}

export type MapStartupCameraDecision =
  | { action: 'FIT_VENUE_BOUNDS'; reason: 'first_overview' | 'no_gps' }
  | { action: 'ANIMATE_TO_USER'; coordinate: Coordinate };

/**
 * resolveReturningLaunchCamera's decision shape. Distinct from MapStartupCameraDecision above
 * (resolveColdLaunchCamera's return type, unchanged) because the ANIMATE_TO_USER case here
 * carries the canonical `source: 'live'` alongside the coordinate — the eventual HomeScreen
 * integration needs that to commit marker/store state (setCurrentLocation(coordinate, source))
 * before animating the camera, not just the coordinate.
 */
export type ReturningLaunchCameraDecision =
  | { action: 'FIT_VENUE_BOUNDS'; reason: 'first_overview' | 'no_gps' }
  | { action: 'ANIMATE_TO_USER'; coordinate: Coordinate; source: 'live' };

/**
 * Where the Map opens when there is no destination, no active route and no usable location (#222).
 * Block 2 is the verified repository entity (B2) used as a camera anchor only. It is not a detected
 * location and not a surveyed Mimbar point (that is #116), so it is never used as a route start here.
 */
export type EntryCameraPlan =
  | {
      kind: 'VENUE_OVERVIEW';
      reason: 'first_overview' | 'user_in_venue' | 'user_outside';
      /** Present when a fresh live fix exists, so the caller can commit it as the user marker. */
      user?: { coordinate: Coordinate; source: 'live' };
    }
  | { kind: 'FALLBACK_ANCHOR'; anchor: { id: 'B2'; name: string; coordinate: Coordinate }; notice: string };

/** The English wording, kept as a stable reference; the notice shown at runtime follows the chosen language. */
export const FALLBACK_LOCATION_NOTICE = tIn('en', 'navigation.fallbackLocationNotice');

const RETURNING_LAUNCH_RESOLVE_TIMEOUT_MS = 4000;

// `typeof x === 'number'` alone accepts NaN and +/-Infinity — neither is a usable camera
// target, and both can genuinely come out of a native location bridge (e.g. a malformed or
// zeroed-out fix). Number.isFinite() is the one check that rejects both while still accepting
// every real coordinate value, including 0.
function isFiniteCoordinateValue(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isLiveCoordinate(result: LocationResolveResult | null): result is LocationResolveResult & { coordinate: Coordinate } {
  if (!result || result.ok !== true || result.source !== 'live' || !result.coordinate) return false;
  const { latitude, longitude } = result.coordinate;
  if (!isFiniteCoordinateValue(latitude) || !isFiniteCoordinateValue(longitude)) return false;
  if (latitude < -90 || latitude > 90) return false;
  if (longitude < -180 || longitude > 180) return false;
  return true;
}

/**
 * Pure decisions for the Map's one-shot entry camera. HomeScreen's onMapReady asks resolveReturningLaunchCamera for a
 * fresh live fix (never a remembered one) and planEntryCamera for the plan: a usable location shows the venue overview
 * with the user marker; none shows the Block 2 anchor with a notice. A destination, route or user gesture always wins
 * and invalidates the decision. resolveColdLaunchCamera is the older synchronous variant, kept for its tests and not
 * used by production code. The caller owns moving the camera and the one-shot guard.
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
   * No-permission short-circuits before the resolver is ever invoked. First install takes the same path as
   * any other launch.
   *
   * Every non-live outcome — permission denied, services disabled, resolution failure, a
   * rejected resolver promise, a malformed result, or the resolver simply never settling —
   * normalizes to the same `{ action: 'FIT_VENUE_BOUNDS', reason: 'no_gps' }` fallback as a
   * missing GPS fix, so callers don't need to special-case any of them. Bounded by
   * `timeoutMs` (a genuine one-shot timer, not a continuous watch — this never subscribes to
   * GPS updates itself) so a hung resolver can't block the cold-launch camera decision
   * forever; a resolver result that arrives after the timeout has already fired is discarded.
   * This method never mutates camera or store state itself — it only returns a decision, same
   * as resolveColdLaunchCamera above.
   */
  /**
   * #222 camera rules for a Map entry with no destination and no active route (those two cases are
   * owned by the place and route camera, which also invalidate this decision when they arrive).
   * A usable location, inside or outside the Ijtema, gets the grounds overview (the user marker is
   * drawn by the map, so the user stays visible without zooming onto the dot); no usable location
   * gets the Block 2 anchor with an explicit notice. Pure: callers commit the marker and move the camera.
   */
  static planEntryCamera(
    decision: ReturningLaunchCameraDecision,
    isInsideVenue: (coordinate: Coordinate) => boolean,
  ): EntryCameraPlan {
    if (decision.action === 'ANIMATE_TO_USER') {
      return {
        kind: 'VENUE_OVERVIEW',
        reason: isInsideVenue(decision.coordinate) ? 'user_in_venue' : 'user_outside',
        user: { coordinate: decision.coordinate, source: decision.source },
      };
    }
    if (decision.reason === 'first_overview') return { kind: 'VENUE_OVERVIEW', reason: 'first_overview' };

    const block2 = IJTEMA_BLOCKS.find((block) => block.id === 'B2');
    if (!block2) return { kind: 'VENUE_OVERVIEW', reason: 'first_overview' };
    return {
      kind: 'FALLBACK_ANCHOR',
      anchor: { id: 'B2', name: venueName(block2.name), coordinate: { latitude: block2.center.lat, longitude: block2.center.lng } },
      notice: t('navigation.fallbackLocationNotice'),
    };
  }

  static async resolveReturningLaunchCamera(
    checks: { hasLocationPermission: boolean },
    resolveFreshLocation: () => Promise<LocationResolveResult>,
    timeoutMs = RETURNING_LAUNCH_RESOLVE_TIMEOUT_MS,
  ): Promise<ReturningLaunchCameraDecision> {
    // First install is not special (#222): no permission or no live fix means the same no-location fallback.
    if (!checks.hasLocationPermission) {
      return { action: 'FIT_VENUE_BOUNDS', reason: 'no_gps' };
    }

    const resolved = await this.resolveWithTimeout(resolveFreshLocation, timeoutMs);
    if (isLiveCoordinate(resolved)) {
      return { action: 'ANIMATE_TO_USER', coordinate: resolved.coordinate, source: 'live' };
    }

    return { action: 'FIT_VENUE_BOUNDS', reason: 'no_gps' };
  }

  /** One-shot race between the resolver settling and `timeoutMs` elapsing — whichever comes
   * first wins; the other is discarded (a rejection or a late resolution after timeout never
   * surfaces to the caller, and never becomes an unhandled promise rejection). */
  private static resolveWithTimeout(
    resolveFreshLocation: () => Promise<LocationResolveResult>,
    timeoutMs: number,
  ): Promise<LocationResolveResult | null> {
    return new Promise((resolve) => {
      let settled = false;
      const finish = (value: LocationResolveResult | null) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutId);
        resolve(value);
      };

      const timeoutId = setTimeout(() => finish(null), timeoutMs);

      // Promise.resolve().then(() => resolveFreshLocation()) normalizes a resolver that throws
      // *synchronously*, before ever returning a Promise, into the same rejection path as one
      // that returns a Promise which later rejects — both then funnel through the single
      // .catch(() => finish(null)) below. Calling resolveFreshLocation() directly here would let
      // a synchronous throw escape this executor entirely (a throw inside a Promise executor
      // rejects the *outer* promise directly, bypassing finish()'s clearTimeout and — since
      // resolveReturningLaunchCamera's await has no try/catch — propagating as an unhandled
      // rejection through this method's caller instead of normalizing to `no_gps`).
      Promise.resolve()
        .then(() => resolveFreshLocation())
        .then((result) => finish(result ?? null))
        .catch(() => finish(null));
    });
  }
}

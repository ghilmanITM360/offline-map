/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// The one place that decides what location can do for the user right now (#307).
// Permission, accuracy authorization, device services and fix quality are separate facts: collapsing them
// into one boolean is what made "approximate" look like "precise" and hid why live guidance was unavailable.
// Whatever these facets say, the route guide (manual FROM + TO) is always available: location improves
// navigation, it never gates route planning.

import type { Coordinate } from '../models/types';

export const MAX_LIVE_NAVIGATION_ACCURACY_M = 50;
export const MAX_LIVE_FIX_AGE_MS = 30_000;

export type PermissionFacet = 'granted' | 'denied';
/** 'unknown' when permission is denied or the precision has not been read yet; never assumed precise. */
export type AccuracyFacet = 'precise' | 'approximate' | 'unknown';
export type ServicesFacet = 'enabled' | 'disabled' | 'unknown';
export type FixFacet = 'none' | 'acquiring' | 'stale' | 'unusable' | 'usable';
export type NavigationMode = 'route_guide' | 'live_navigation';
export type LiveBlocker =
  | 'permission_needed'
  | 'permission_blocked'
  | 'approximate_only'
  | 'services_off'
  | 'acquiring'
  | 'no_fix'
  | 'stale_fix'
  | 'weak_fix';

export interface LocationPermissionInput {
  granted: boolean;
  canAskAgain: boolean;
  /** Android permission precision. 'none' with a granted permission means "not read yet". */
  precision?: 'fine' | 'coarse' | 'none';
  servicesState?: ServicesFacet;
}

export interface LocationCapability {
  permission: PermissionFacet;
  canAskAgain: boolean;
  accuracy: AccuracyFacet;
  services: ServicesFacet;
  fix: FixFacet;
  /** Why live navigation is unavailable right now, or null when it is available. */
  liveBlocker: LiveBlocker | null;
  /** The best mode the app can honestly offer right now. */
  mode: NavigationMode;
  /** Always true: manual FROM + TO never needs location. */
  routeGuideAvailable: true;
}

/** Fix quality only. Any coordinate passed here must be a genuinely live fix (never remembered/manual). */
export function classifyLiveFix(coordinate: Coordinate | null, nowMs: number): Exclude<FixFacet, 'acquiring'> {
  if (!coordinate) return 'none';
  const observedAtMs = coordinate.observedAtMs;
  // A missing, future or non-finite observation cannot establish freshness; fail closed (also after a clock rollback).
  if (
    observedAtMs == null || !Number.isFinite(observedAtMs) || !Number.isFinite(nowMs) ||
    observedAtMs > nowMs || nowMs - observedAtMs > MAX_LIVE_FIX_AGE_MS
  ) {
    return 'stale';
  }
  if ((coordinate.accuracy ?? Number.POSITIVE_INFINITY) > MAX_LIVE_NAVIGATION_ACCURACY_M) return 'unusable';
  return 'usable';
}

export function accuracyFacet(granted: boolean, precision?: 'fine' | 'coarse' | 'none'): AccuracyFacet {
  if (!granted) return 'unknown';
  if (precision === 'coarse') return 'approximate';
  if (precision === 'fine') return 'precise';
  return 'unknown';
}

export function evaluateLocationCapability(input: {
  permission: LocationPermissionInput;
  liveFix: Coordinate | null;
  acquiring?: boolean;
  nowMs?: number;
}): LocationCapability {
  const { permission } = input;
  const nowMs = input.nowMs ?? Date.now();
  const accuracy = accuracyFacet(permission.granted, permission.precision);
  const services: ServicesFacet = permission.servicesState ?? 'unknown';
  const fix: FixFacet = input.liveFix === null && input.acquiring ? 'acquiring' : classifyLiveFix(input.liveFix, nowMs);

  let liveBlocker: LiveBlocker | null = null;
  if (!permission.granted) liveBlocker = permission.canAskAgain ? 'permission_needed' : 'permission_blocked';
  else if (accuracy === 'approximate') liveBlocker = 'approximate_only';
  else if (services === 'disabled') liveBlocker = 'services_off';
  else if (fix === 'acquiring') liveBlocker = 'acquiring';
  else if (fix === 'none') liveBlocker = 'no_fix';
  else if (fix === 'stale') liveBlocker = 'stale_fix';
  else if (fix === 'unusable') liveBlocker = 'weak_fix';

  return {
    permission: permission.granted ? 'granted' : 'denied',
    canAskAgain: permission.canAskAgain,
    accuracy,
    services,
    fix,
    liveBlocker,
    mode: liveBlocker === null ? 'live_navigation' : 'route_guide',
    routeGuideAvailable: true,
  };
}

/** One plain sentence per blocker. The route guide stays available in every case, so none of these end the journey. */
export function liveBlockerMessage(blocker: LiveBlocker): string {
  switch (blocker) {
    case 'permission_needed':
      return 'Allow location to follow your walk live.';
    case 'permission_blocked':
      return 'Location is turned off for this app. Allow it in Settings to follow your walk live.';
    case 'approximate_only':
      return 'Your phone is sharing only an approximate location. Allow precise location to follow your walk live.';
    case 'services_off':
      return 'Location is turned off on this phone. Turn it on to follow your walk live.';
    case 'acquiring':
      return 'Finding your location…';
    case 'no_fix':
      return "Couldn't find your location yet.";
    case 'stale_fix':
      return 'Your location is out of date. Waiting for a new one…';
    case 'weak_fix':
      return 'Your location is not accurate enough yet.';
  }
}

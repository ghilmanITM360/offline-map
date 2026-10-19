/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Pure location-capability policy (#307): permission, accuracy authorization, device services and fix quality are
// separate facts. No clock, copy or platform access: the caller injects `nowMs` and renders `liveBlocker` as words.
// Whatever these facets say, the route guide (manual FROM + TO) is always available.

import { isValidCoordinate } from '../geo/isValidCoordinate';

export const MAX_LIVE_NAVIGATION_ACCURACY_M = 50;
export const MAX_LIVE_FIX_AGE_MS = 30_000;

/** Structural subset of a host coordinate; the host `Coordinate` is assignable to it. */
export interface LiveFixCoordinate {
  latitude: number;
  longitude: number;
  accuracy?: number;
  /** Native GPS fix timestamp (epoch ms). */
  observedAtMs?: number;
}

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
  | 'precision_unknown'
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
export function classifyLiveFix(coordinate: LiveFixCoordinate | null, nowMs: number): Exclude<FixFacet, 'acquiring'> {
  if (!coordinate) return 'none';
  const observedAtMs = coordinate.observedAtMs;
  // A missing, future or non-finite observation cannot establish freshness; fail closed (also after a clock rollback).
  if (
    observedAtMs == null || observedAtMs <= 0 || !Number.isFinite(observedAtMs) || !Number.isFinite(nowMs) ||
    observedAtMs > nowMs || nowMs - observedAtMs > MAX_LIVE_FIX_AGE_MS
  ) {
    return 'stale';
  }
  const accuracy = coordinate.accuracy;
  if (!isValidCoordinate(coordinate) || accuracy == null || !Number.isFinite(accuracy) ||
    accuracy < 0 || accuracy > MAX_LIVE_NAVIGATION_ACCURACY_M) return 'unusable';
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
  liveFix: LiveFixCoordinate | null;
  acquiring?: boolean;
  /** Injected clock: the only source of "now" for fix freshness. */
  nowMs: number;
}): LocationCapability {
  const { permission } = input;
  const accuracy = accuracyFacet(permission.granted, permission.precision);
  const services: ServicesFacet = permission.servicesState ?? 'unknown';
  const fix: FixFacet = input.liveFix === null && input.acquiring ? 'acquiring' : classifyLiveFix(input.liveFix, input.nowMs);

  let liveBlocker: LiveBlocker | null = null;
  if (!permission.granted) liveBlocker = permission.canAskAgain ? 'permission_needed' : 'permission_blocked';
  else if (accuracy === 'approximate') liveBlocker = 'approximate_only';
  else if (accuracy === 'unknown') liveBlocker = 'precision_unknown';
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

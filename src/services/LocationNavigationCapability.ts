/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { getDistance } from 'geolib';

import type { Coordinate } from '../models/types';
import { RerouteService } from './RerouteService';

export type NavigationStartSource = 'live_gps' | 'device_last_known' | 'remembered_location' | 'manual_place';

interface NavigationLocationCapabilityInput {
  startSource: NavigationStartSource;
  coordinate: Coordinate | null;
  /**
   * Android permission precision ('fine'/'coarse'/'none'). Optional so existing callers that
   * don't yet track it keep working; omitted precision skips this gate (accuracy-based checks
   * below still apply). Coarse permission is gated on its own — Android deliberately fuzzes
   * coarse fixes, so a small reported accuracy number cannot be trusted to mean fine precision.
   */
  precision?: 'fine' | 'coarse' | 'none';
  nowMs?: number;
}

interface NavigationLocationCapability {
  canStart: boolean;
  message: string;
}

const MAX_LIVE_NAVIGATION_ACCURACY_M = 50;
const MAX_LIVE_FIX_AGE_MS = 30_000;

export function evaluateNavigationLocationCapability(
  input: NavigationLocationCapabilityInput,
): NavigationLocationCapability {
  if (input.startSource === 'manual_place') {
    return {
      canStart: false,
      message: 'Choose a current precise location before starting live navigation. Route preview remains available.',
    };
  }

  if (input.startSource === 'remembered_location' || input.startSource === 'device_last_known') {
    return {
      canStart: false,
      message: 'Last known location cannot drive live navigation. Route preview remains available.',
    };
  }

  if (input.precision === 'coarse') {
    return {
      canStart: false,
      message: 'Precise location is required for reliable walking navigation inside Ijtima.',
    };
  }

  if (!input.coordinate) {
    return {
      canStart: false,
      message: 'Searching for a current location. Route preview remains available.',
    };
  }

  if ((input.coordinate.accuracy ?? Number.POSITIVE_INFINITY) > MAX_LIVE_NAVIGATION_ACCURACY_M) {
    return {
      canStart: false,
      message: 'Precise location is required for live navigation. Route preview remains available.',
    };
  }

  const nowMs = input.nowMs ?? Date.now();
  const observedAtMs = input.coordinate.observedAtMs;
  // A future or non-finite observation cannot establish freshness. Fail closed after
  // clock rollback too; the next valid live fix can restore navigation eligibility.
  if (
    observedAtMs == null ||
    !Number.isFinite(observedAtMs) ||
    !Number.isFinite(nowMs) ||
    observedAtMs > nowMs ||
    nowMs - observedAtMs > MAX_LIVE_FIX_AGE_MS
  ) {
    return {
      canStart: false,
      message: 'Current location is stale. Wait for a fresh fix before starting live navigation.',
    };
  }

  return { canStart: true, message: '' };
}

/**
 * How close a live fix must be to the route's planned start (its first point: the graph point a manual place snaps
 * to, or the outside start) to count as "there". This is a different question from fix quality
 * (MAX_LIVE_NAVIGATION_ACCURACY_M / freshness above), so it does not reuse that constant. It reuses the tolerance
 * live guidance already applies when deciding a fix is on the planned route, which grows with fix uncertainty and
 * is capped: a fix that passes here will not be treated as off-route the moment navigation begins.
 */
export const startMatchToleranceM = (fixAccuracyM = 0): number =>
  RerouteService.getDynamicOffRouteThresholdMeters(fixAccuracyM);

export type StartActionKind = 'start' | 'use_location' | 'turn_on_location' | 'precise_location' | 'not_near';

export interface StartAction {
  kind: StartActionKind;
  /** Always enabled: the user is never left on a dead primary button. */
  primaryLabel: string;
  /** Short plain-language headline shown above the primary action, when the state needs one. */
  title?: string;
  secondaryLabel?: string;
}

interface StartActionInput {
  startSource: NavigationStartSource;
  /** Where the route begins (its first point); a live fix is compared against it. */
  plannedStart: Coordinate | null;
  plannedStartName: string;
  /** Only a genuinely live fix; remembered / last-known / manual positions must not be passed here. */
  liveFix: Coordinate | null;
  permission: { granted: boolean; precision: 'fine' | 'coarse' | 'none' };
  nowMs?: number;
}

/**
 * Turns the (unchanged) live-navigation safety gate into one actionable primary button.
 * A planned/manual start is a route preview; live guidance still needs a fresh precise fix.
 */
export function resolveStartAction(input: StartActionInput): StartAction {
  if (!input.permission.granted) {
    return { kind: 'turn_on_location', primaryLabel: 'Turn on location & start', secondaryLabel: 'View route' };
  }
  if (input.permission.precision === 'coarse') {
    return { kind: 'precise_location', primaryLabel: 'Turn on precise location', secondaryLabel: 'View route' };
  }
  const fixUsable =
    input.liveFix !== null &&
    evaluateNavigationLocationCapability({
      startSource: 'live_gps',
      coordinate: input.liveFix,
      precision: input.permission.precision,
      nowMs: input.nowMs,
    }).canStart;
  if (!fixUsable || !input.liveFix) {
    return { kind: 'use_location', primaryLabel: 'Use my location & start', secondaryLabel: 'View route' };
  }
  if (input.plannedStart && getDistance(input.liveFix, input.plannedStart) > startMatchToleranceM(input.liveFix.accuracy)) {
    return {
      kind: 'not_near',
      title: `You're not near ${input.plannedStartName}`,
      primaryLabel: 'Start from my location',
      secondaryLabel: 'Change start',
    };
  }
  return { kind: 'start', primaryLabel: 'Start Navigation', title: 'Ready to go' };
}

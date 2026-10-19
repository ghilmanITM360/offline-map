/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Pure live-navigation start gate and start-action decision. Copy-free: hosts map the returned reason / kind to words.

import { classifyLiveFix, evaluateLocationCapability, type LiveFixCoordinate } from './LocationCapability';

export type NavigationStartSource = 'live_gps' | 'device_last_known' | 'remembered_location' | 'manual_place' | 'hypothetical_place';

/** Why live navigation cannot start from this start; null when it can. */
export type NavigationStartBlock =
  | 'manual_start'
  | 'saved_start'
  | 'approximate_precision'
  | 'precision_unknown'
  | 'no_fix'
  | 'stale_fix'
  | 'weak_fix';

export interface NavigationStartDecision {
  canStart: boolean;
  block: NavigationStartBlock | null;
}

export function evaluateNavigationStart(input: {
  startSource: NavigationStartSource;
  coordinate: LiveFixCoordinate | null;
  /** Fine authorization must be explicit; omitted precision fails closed. */
  precision?: 'fine' | 'coarse' | 'none';
  nowMs: number;
}): NavigationStartDecision {
  const blocked = (block: NavigationStartBlock): NavigationStartDecision => ({ canStart: false, block });
  if (input.startSource === 'manual_place' || input.startSource === 'hypothetical_place') return blocked('manual_start');
  if (input.startSource === 'remembered_location' || input.startSource === 'device_last_known') return blocked('saved_start');
  if (input.precision === 'coarse') return blocked('approximate_precision');
  if (input.precision !== 'fine') return blocked('precision_unknown');
  const fix = classifyLiveFix(input.coordinate, input.nowMs);
  if (fix === 'none') return blocked('no_fix');
  if (fix === 'unusable') return blocked('weak_fix');
  if (fix === 'stale') return blocked('stale_fix');
  return { canStart: true, block: null };
}

export type StartActionKind = 'start' | 'use_location' | 'turn_on_location' | 'precise_location' | 'route_guide';

export interface StartActionDecision {
  kind: StartActionKind;
  /** 'use_location' only: permission is fine but the precision has not been read yet. */
  precisionUnknown: boolean;
}

/**
 * A planned/manual start is a route guide; live guidance still needs a fresh precise fix. A direct guide
 * (OUTSIDE_VENUE_GUIDE) is never live walking navigation, so it is a route guide whatever the location state.
 */
export function resolveStartActionKind(input: {
  startSource: NavigationStartSource;
  /** Only a genuinely live fix; remembered / last-known / manual positions must not be passed here. */
  liveFix: LiveFixCoordinate | null;
  permission: { granted: boolean; precision: 'fine' | 'coarse' | 'none' };
  directGuide?: boolean;
  nowMs: number;
}): StartActionDecision {
  const decide = (kind: StartActionKind, precisionUnknown = false): StartActionDecision => ({ kind, precisionUnknown });
  if (input.startSource !== 'live_gps') return decide('route_guide');
  if (input.directGuide) return decide('route_guide');
  const capability = evaluateLocationCapability({
    permission: { granted: input.permission.granted, canAskAgain: true, precision: input.permission.precision },
    liveFix: input.liveFix,
    nowMs: input.nowMs,
  });
  if (capability.permission === 'denied') return decide('turn_on_location');
  if (capability.liveBlocker === 'approximate_only') return decide('precise_location');
  if (capability.liveBlocker === 'precision_unknown') return decide('use_location', true);
  if (capability.fix !== 'usable') return decide('use_location');
  return decide('start');
}

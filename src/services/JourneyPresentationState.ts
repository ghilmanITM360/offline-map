/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { OutsideRouteProviderId } from '../models/outsideRouting';
import type { NavigationStartSource } from './LocationNavigationCapability';

/**
 * The one authoritative answer to "what is this journey right now?". Copy-free: Views choose words from it, and
 * never infer the state from coordinates, distances, provider names, start-source strings or route styling.
 *
 * - NEEDS_START: no fresh live fix and no start chosen for this journey (nothing is invented).
 * - LIVE_READY: a ready route from a fresh live fix (live guidance can begin).
 * - MANUAL_GUIDE_READY: a ready route from a start the user chose (or an earlier-known position): a route guide.
 * - OUTSIDE_VENUE_GUIDE: the start is outside the venue and no real walking route reaches the gate: only a
 *   straight-line guide to the gate exists, so its distance is not a walking distance.
 */
export type JourneyPresentationState =
  | 'CALCULATING'
  | 'NEEDS_START'
  | 'LIVE_READY'
  | 'MANUAL_GUIDE_READY'
  | 'OUTSIDE_VENUE_GUIDE'
  | 'ROUTE_FAILURE'
  | 'SAME_PLACE'
  | 'ACTIVE_NAVIGATION'
  | 'ARRIVED';

export interface JourneyPresentationInput {
  /** Navigation outranks the preview: once it is under way or finished the preview states no longer apply. */
  navigation?: 'none' | 'active' | 'arrived';
  loadState: 'idle' | 'loading' | 'ready' | 'error' | 'needs_origin' | 'same_place';
  startSource: NavigationStartSource;
  route: { outsideRoute?: { provider: OutsideRouteProviderId } | null } | null;
}

export function selectJourneyPresentationState(input: JourneyPresentationInput): JourneyPresentationState {
  if (input.navigation === 'arrived') return 'ARRIVED';
  if (input.navigation === 'active') return 'ACTIVE_NAVIGATION';
  switch (input.loadState) {
    case 'idle':
    case 'loading':
      return 'CALCULATING';
    case 'needs_origin':
      return 'NEEDS_START';
    case 'same_place':
      return 'SAME_PLACE';
    case 'error':
      return 'ROUTE_FAILURE';
    case 'ready':
      // "Ready" without a route is not ready.
      if (!input.route) return 'ROUTE_FAILURE';
      if (input.route.outsideRoute?.provider === 'direct-guide') return 'OUTSIDE_VENUE_GUIDE';
      return input.startSource === 'live_gps' ? 'LIVE_READY' : 'MANUAL_GUIDE_READY';
  }
}

/** Only a ready route can be started. */
export function isJourneyStartable(state: JourneyPresentationState): boolean {
  return state === 'LIVE_READY' || state === 'MANUAL_GUIDE_READY' || state === 'OUTSIDE_VENUE_GUIDE';
}

/**
 * What an OUTSIDE_VENUE_GUIDE can truthfully say about distance: the straight line to the entry gate. The route's
 * `totalDistance` adds the walk inside the venue to that line, so it is not a walking distance and the selection
 * cost (`routeCostM`, which also carries gate penalties) is never a distance at all.
 */
export function outsideGuideSummary(
  route: { outsideRoute?: { provider: OutsideRouteProviderId; gateId: string; distanceM: number } | null } | null,
): { gateId: string; straightLineDistanceM: number } | null {
  const outside = route?.outsideRoute;
  if (!outside || outside.provider !== 'direct-guide') return null;
  return { gateId: outside.gateId, straightLineDistanceM: Math.round(outside.distanceM) };
}

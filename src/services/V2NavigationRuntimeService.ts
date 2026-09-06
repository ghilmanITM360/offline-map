/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Coordinate, V2ActiveRoute } from '../models/types';
import { RerouteService } from './RerouteService';
import { EntryGateRoutingService } from './EntryGateRoutingService';
import { RoutingDestinationV2, RoutingStartV2 } from './RoutingServiceV2';
// Deliberately from constants/navigation, not GPSManagerService (which imports react-native
// and would drag a native module import into this otherwise plain, node/tsx-testable file —
// see the comment on NAVIGATION_WATCH_TIME_INTERVAL_MS for why it lives there).
import {
  ARRIVAL_FAST_PATH_ACCURACY_M,
  ARRIVAL_MODERATE_PATH_ACCURACY_M,
  NAVIGATION_WATCH_TIME_INTERVAL_MS,
} from '../constants/navigation';

export interface NavigationProgressV2Input {
  route: V2ActiveRoute;
  coordinate: Coordinate;
  previousProgressMeters: number;
  previousEtaMinutes?: number;
  walkingSpeedMs: number;
}

export interface NavigationProgressV2 {
  progressMeters: number;
  remainingDistanceM: number;
  etaMinutes: number;
  snappedCoordinate: Coordinate;
  distanceToRouteMeters: number;
}

export interface RerouteEvidenceV2Input {
  gpsAccuracyM?: number;
  consecutiveOffRouteCount: number;
  offRouteDurationMs: number;
  cooldownRemainingMs: number;
  movedDistanceSinceLastAcceptedM: number;
}

export interface RerouteEvidenceV2 {
  thresholdM: number;
  shouldReroute: boolean;
}

export function shouldIgnorePoorAccuracyMovementV2(input: { movedDistanceM: number; accuracyM?: number }): boolean {
  return (input.accuracyM ?? 0) > 50 && input.movedDistanceM < 10;
}

export interface ArrivalFixEvaluationV2 {
  /** True once this fix earns the latch (fast path, or the second of two consecutive moderate-path fixes). */
  arrived: boolean;
  /** Carry forward as `hasPendingCorroboration` for the next fix; any non-qualifying fix (out of
   * distance, or accuracy beyond the moderate-path ceiling) resets this to false. */
  pendingCorroboration: boolean;
}

/**
 * Per-trip arrival latch decision for one live-navigation GPS fix. Distance <= threshold with
 * accuracy <= ARRIVAL_FAST_PATH_ACCURACY_M arrives on this fix alone; distance <= threshold with
 * accuracy in (fast-path, ARRIVAL_MODERATE_PATH_ACCURACY_M] requires this same qualifying
 * evidence on two *consecutive* fixes (`hasPendingCorroboration` from the prior fix); anything
 * outside distance or beyond the moderate ceiling never arrives and clears pending evidence, so a
 * single disqualifying fix between two moderate fixes forces the corroboration to restart.
 */
/**
 * Untrusted accuracy (undefined/null/NaN/Infinity/<=0) must never qualify as arrival evidence —
 * mapped to Infinity so it always fails evaluateArrivalFixV2's accuracy ceiling, both for
 * fast/moderate-path qualification and for breaking a pending moderate corroboration (an
 * untrustworthy fix is still a genuinely new sensor observation, just not usable evidence).
 */
export function sanitizeArrivalAccuracyM(accuracyM: number | undefined | null): number {
  return typeof accuracyM === 'number' && Number.isFinite(accuracyM) && accuracyM > 0
    ? accuracyM
    : Number.POSITIVE_INFINITY;
}

export function evaluateArrivalFixV2(input: {
  distanceToDestinationM: number;
  accuracyM: number;
  hasPendingCorroboration: boolean;
  arrivalThresholdM: number;
}): ArrivalFixEvaluationV2 {
  const qualifies =
    input.distanceToDestinationM <= input.arrivalThresholdM && input.accuracyM <= ARRIVAL_MODERATE_PATH_ACCURACY_M;
  if (!qualifies) {
    return { arrived: false, pendingCorroboration: false };
  }
  if (input.accuracyM <= ARRIVAL_FAST_PATH_ACCURACY_M || input.hasPendingCorroboration) {
    return { arrived: true, pendingCorroboration: false };
  }
  return { arrived: false, pendingCorroboration: true };
}

// Google-Maps-style GPS state for live v2 navigation. GPS_GOOD/GPS_WEAK reflect the accuracy
// of the most recent fix (same threshold as RerouteService.shouldHoldRouteForWeakGps);
// GPS_LOST is a distinct, timeout-driven state for when fixes stop arriving entirely — the
// scenario the pre-existing weak-GPS banner never covered (it only reacts to fixes that DO
// arrive, so a total signal dropout during a Karachi-Ijtema-crowd-density GPS outage used to
// leave the UI frozen on the last known position with no indication anything was wrong).
export type GpsSignalStateV2 = 'GPS_GOOD' | 'GPS_WEAK' | 'GPS_LOST';

/**
 * GPS_LOST fires once this many ms have passed with zero fresh fixes while navigating. Set
 * as an explicit multiple of GPSManagerService's navigation-mode watchPositionAsync
 * `timeInterval` (the minimum ms between fixes it requests while a NavigationViewModelV2
 * listener is attached) rather than an arbitrary guess: 8 missed fixes is long enough that a
 * single delayed/dropped update (a momentary hiccup, ordinary GPS jitter) doesn't
 * false-positive into a scary "no signal" banner, but short enough that a real outage
 * (crowd-density signal loss, walking under a covered area) is surfaced to the user within
 * ~8 seconds — well before a frozen "you are here" dot could be mistaken for a current
 * position by the app's elderly user base.
 */
export const GPS_LOST_TIMEOUT_MS = NAVIGATION_WATCH_TIME_INTERVAL_MS * 8;

export function deriveGpsSignalStateV2(input: {
  /** Accuracy verdict for the most recent fix (RerouteService.shouldHoldRouteForWeakGps). Only
   * consulted when a fix has actually arrived within the timeout — ignored once GPS_LOST. */
  isWeakGps: boolean;
  /** Wall-clock time (Date.now()) the last fix was accepted, or null if none has arrived yet
   * this navigation session. */
  lastFixAtMs: number | null;
  nowMs: number;
  timeoutMs?: number;
}): GpsSignalStateV2 {
  const timeoutMs = input.timeoutMs ?? GPS_LOST_TIMEOUT_MS;
  if (input.lastFixAtMs == null || input.nowMs - input.lastFixAtMs >= timeoutMs) {
    return 'GPS_LOST';
  }
  return input.isWeakGps ? 'GPS_WEAK' : 'GPS_GOOD';
}

export function calculateNavigationProgressV2(input: NavigationProgressV2Input): NavigationProgressV2 {
  const projection = RerouteService.projectProgressMetersOnRoute(input.coordinate, input.route);
  const progressMeters = RerouteService.clampMonotonicProgress(
    input.previousProgressMeters,
    projection.progressMeters,
  );
  const remainingDistanceM = Math.max(0, input.route.totalDistanceM - progressMeters);
  const etaMinutes = Math.max(0, Math.ceil(remainingDistanceM / input.walkingSpeedMs / 60));

  return {
    progressMeters,
    remainingDistanceM,
    etaMinutes: input.previousEtaMinutes && Math.abs(input.previousEtaMinutes - etaMinutes) <= 1
      ? input.previousEtaMinutes
      : etaMinutes,
    snappedCoordinate: projection.snappedCoordinate,
    distanceToRouteMeters: projection.distanceToRouteMeters,
  };
}

export function evaluateRerouteEvidenceV2(input: RerouteEvidenceV2Input): RerouteEvidenceV2 {
  const thresholdM = RerouteService.getDynamicOffRouteThresholdMeters(input.gpsAccuracyM ?? 0);
  return {
    thresholdM,
    shouldReroute: RerouteService.shouldTriggerReroute({
      consecutiveOffRouteCount: input.consecutiveOffRouteCount,
      offRouteDurationMs: input.offRouteDurationMs,
      cooldownRemainingMs: input.cooldownRemainingMs,
      movedDistanceSinceLastAcceptedM: input.movedDistanceSinceLastAcceptedM,
    }),
  };
}

export function keepCurrentRouteAfterRerouteFailureV2(route: V2ActiveRoute): {
  route: V2ActiveRoute;
  message: string;
} {
  return {
    route,
    message: 'Could not find a better route. Continuing current route.',
  };
}

export function destinationToRoutingV2(route: V2ActiveRoute): RoutingDestinationV2 {
  if (route.destination.type === 'facility') {
    return {
      type: 'facility',
      facilityId: route.destination.facilityId ?? '',
      nodeId: route.destination.entryNodeId ?? '',
      label: route.destination.label,
    };
  }
  if (route.destination.type === 'gate' && route.destination.gateId) {
    return { type: 'gate', gateId: route.destination.gateId };
  }
  if (route.destination.type === 'rasta') {
    return { type: 'rasta', rastaId: route.destination.rastaId ?? route.destination.entryNodeId?.split('-')[0] ?? '' };
  }
  return { type: 'block', blockId: route.destination.blockId ?? '' };
}

export function buildV2RerouteRequest(input: {
  route: V2ActiveRoute;
  coordinate: Coordinate;
  walkingSpeedMs: number;
  forceOutside?: boolean;
}): {
  start: RoutingStartV2;
  destination: RoutingDestinationV2;
  walkingSpeedMs: number;
} {
  const isOutside = input.forceOutside || !EntryGateRoutingService.isInsideIjtemaArea(input.coordinate);
  return {
    start: isOutside
      ? { type: 'outside_coordinate', coordinate: input.coordinate }
      : { type: 'inside_coordinate', coordinate: input.coordinate },
    destination: destinationToRoutingV2(input.route),
    walkingSpeedMs: input.walkingSpeedMs,
  };
}

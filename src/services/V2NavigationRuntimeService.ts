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
import { NAVIGATION_WATCH_TIME_INTERVAL_MS } from '../constants/navigation';

export interface NavigationProgressV2Input {
  route: V2ActiveRoute;
  coordinate: Coordinate;
  previousProgressMeters: number;
  previousEtaMinutes?: number;
  walkingSpeedMs: number;
  /** Native observation timestamp (Coordinate.observedAtMs) of the last fix actually accepted
   * into progress. Paired with `coordinate.observedAtMs` to bound this fix's plausible forward
   * jump — see PLAUSIBLE_FORWARD_SPEED_FACTOR below. Undefined/null (no timestamp evidence on
   * either side) leaves the jump uncapped, same as before NAV-P0-001. */
  previousObservedAtMs?: number | null;
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
  return (input.accuracyM ?? 0) > 50;
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

// NAV-P0-001 second defensive layer: even a fresh, on-time fix can be a poor-quality outlier
// (multipath reflection, cold-start GPS jump) that projects far ahead on projectProgressMetersOnRoute's
// unwindowed nearest-segment search. Rather than an arbitrary fixed cap, bound a single fix's
// forward progress by how far a person could plausibly have walked in the elapsed time since the
// last accepted fix. 3x walking speed covers brisk walking/light jogging (not a hard physiological
// ceiling, just enough headroom that legitimate fast movement isn't clipped) plus a small
// jitter allowance for consecutive fixes seconds apart. A long background gap naturally widens this
// cap proportionally to the real elapsed time, so a legitimate multi-minute walk while backgrounded
// is never blocked — this is the smallest defensible hardening, not a map-matching rewrite.
const PLAUSIBLE_FORWARD_SPEED_FACTOR = 3;
const GPS_JITTER_ALLOWANCE_M = 25;

export function calculateNavigationProgressV2(input: NavigationProgressV2Input): NavigationProgressV2 {
  const projection = RerouteService.projectProgressMetersOnRoute(input.coordinate, input.route);

  let maxForwardMeters: number | undefined;
  const observedAtMs = input.coordinate.observedAtMs;
  if (observedAtMs != null && input.previousObservedAtMs != null) {
    const elapsedSeconds = Math.max(1, (observedAtMs - input.previousObservedAtMs) / 1000);
    maxForwardMeters = input.walkingSpeedMs * PLAUSIBLE_FORWARD_SPEED_FACTOR * elapsedSeconds + GPS_JITTER_ALLOWANCE_M;
  }

  const progressMeters = RerouteService.clampMonotonicProgress(
    input.previousProgressMeters,
    projection.progressMeters,
    undefined,
    maxForwardMeters,
  );
  const remainingDistanceM = Math.max(0, input.route.totalDistanceM - progressMeters);
  const etaMinutes = Math.max(0, Math.ceil(remainingDistanceM / input.walkingSpeedMs / 60));

  return {
    progressMeters,
    remainingDistanceM,
    // AUD-12: a stale previousEtaMinutes of 1 must never survive the stability smoothing below
    // once distance has genuinely hit 0 — arrival is the terminal source of truth for ETA.
    etaMinutes: remainingDistanceM === 0
      ? 0
      : input.previousEtaMinutes && Math.abs(input.previousEtaMinutes - etaMinutes) <= 1
        ? input.previousEtaMinutes
        : etaMinutes,
    snappedCoordinate: projection.snappedCoordinate,
    distanceToRouteMeters: projection.distanceToRouteMeters,
  };
}

// #61: single authority for both "which instruction is the active guidance step" and "its live
// countdown distance" — deciding them independently (old instructionIndexForProgress vs.
// currentStep.distanceM) let the displayed maneuver text and its distance disagree right at a
// step boundary. Each instruction's own routeIndex is the boundary where THAT instruction
// completes, so the active step is the first instruction (scanning forward from currentStepIndex,
// never backward) whose own boundary is still ahead of progress; its distance is the remaining
// distance to that same boundary. Once every remaining boundary is behind progress (arrival), this
// lands on the final instruction with distance 0 rather than an inconsistent state.
export function calculateLiveManeuverDistanceV2(input: {
  route: V2ActiveRoute;
  currentStepIndex: number;
  progressMeters: number;
}): { stepIndex: number; maneuverDistanceM: number } {
  const { route, currentStepIndex, progressMeters } = input;
  const startIndex = Math.max(0, currentStepIndex);
  for (let i = startIndex; i < route.instructions.length; i += 1) {
    const instruction = route.instructions[i];
    const coord = route.coordinates[instruction.routeIndex] ?? instruction.coordinate;
    const boundaryMeters = RerouteService.projectProgressMetersOnRoute(coord, route).progressMeters;
    if (boundaryMeters > progressMeters) {
      return { stepIndex: i, maneuverDistanceM: boundaryMeters - progressMeters };
    }
  }
  return { stepIndex: Math.max(0, route.instructions.length - 1), maneuverDistanceM: 0 };
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

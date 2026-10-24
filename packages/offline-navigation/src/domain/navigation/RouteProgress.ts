/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Pure live-progress geometry for any venue route: where along the route a GPS fix is, how far off it is, which
// step is active and whether the walker has arrived. Distances along the route are the venue's surveyed edge
// lengths (so progress, remaining distance and the step distances all agree); the distance from a fix to the
// route is geodesic. The thresholds are the Ijtema host's published values (RerouteService, V2NavigationRuntimeService,
// NavigationViewModelV2), so a host moving onto the SDK behaves the same. No clock: callers pass timestamps.

import type { VenueCoordinate, VenueEdge, VenueRoutingGraph } from '../venue/VenueDataSource';
import { haversineM } from '../venue/VenueRouting';
import type { RouteStep } from './RouteSteps';

export const ARRIVAL_THRESHOLD_M = 20;
export const REROUTE_COOLDOWN_MS = 25_000;
/** A fix whose own observation time predates the watcher start by more than this is a cached fix, not live. */
export const STALE_FIX_CLOCK_TOLERANCE_MS = 2_000;

const PLAUSIBLE_FORWARD_SPEED_FACTOR = 3;
const GPS_JITTER_ALLOWANCE_M = 25;
const MAX_BACKTRACK_M = 15;
const SNAP_SWITCH_MARGIN_M = 5;
const M_PER_DEG = 111_320;
const toRad = (d: number): number => (d * Math.PI) / 180;

export interface RouteLine {
  readonly points: readonly VenueCoordinate[];
  /** Metres from the start to each point, from the venue's edge lengths; same length as `points`. */
  readonly cumulativeM: readonly number[];
  readonly totalM: number;
}

/** Undefined when the route cannot be tracked honestly: under two nodes, a node without coordinates, or edges that do not match. */
export function buildRouteLine(nodeIds: readonly string[], edges: readonly VenueEdge[], graph: VenueRoutingGraph): RouteLine | undefined {
  if (nodeIds.length < 2 || edges.length !== nodeIds.length - 1) return undefined;
  const points: VenueCoordinate[] = [];
  for (const id of nodeIds) {
    const node = graph.getNode(id);
    if (!node) return undefined;
    points.push(node.coordinate);
  }
  const cumulativeM = [0];
  for (const edge of edges) cumulativeM.push(cumulativeM[cumulativeM.length - 1] + edge.distanceM);
  return { points, cumulativeM, totalM: cumulativeM[cumulativeM.length - 1] };
}

export interface RouteProjection {
  readonly progressM: number;
  readonly snapped: VenueCoordinate;
  readonly distanceToRouteM: number;
}

export interface ProjectionContinuity {
  readonly previousProgressM: number;
  readonly maxForwardM: number;
  /** Off-route tolerance: the window only wins within this distance. */
  readonly acceptDistanceM: number;
  /** GPS-noise-sized hysteresis: a corridor clearly closer than this margin still wins. */
  readonly switchMarginM: number;
  readonly maxBacktrackM?: number;
}

const projectToSegment = (point: VenueCoordinate, a: VenueCoordinate, b: VenueCoordinate): { snapped: VenueCoordinate; t: number } => {
  // Local tangent plane around the fix: east metres shrink with latitude.
  const kLng = M_PER_DEG * Math.cos(toRad(point.lat));
  const ax = (a.lng - point.lng) * kLng;
  const ay = (a.lat - point.lat) * M_PER_DEG;
  const dx = (b.lng - a.lng) * kLng;
  const dy = (b.lat - a.lat) * M_PER_DEG;
  const lenSq = dx * dx + dy * dy;
  const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, (-ax * dx - ay * dy) / lenSq));
  return { snapped: { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t }, t };
};

/**
 * Closest point on the route. With `continuity` (#93), a segment whose progress lies inside
 * [previous - maxBacktrack, previous + maxForward] wins while it is within `acceptDistanceM` and no more than
 * `switchMarginM` farther than the global nearest, so a route that doubles back beside itself cannot pull
 * progress onto the far corridor because one noisy fix landed closer to it.
 */
export function projectOnRoute(line: RouteLine, point: VenueCoordinate, continuity?: ProjectionContinuity): RouteProjection {
  if (line.points.length < 2) return { progressM: 0, snapped: point, distanceToRouteM: Infinity };
  const windowActive = continuity != null && Number.isFinite(continuity.previousProgressM) && Number.isFinite(continuity.maxForwardM) &&
    Number.isFinite(continuity.acceptDistanceM) && Number.isFinite(continuity.switchMarginM);
  const windowMin = windowActive ? continuity.previousProgressM - (continuity.maxBacktrackM ?? MAX_BACKTRACK_M) : 0;
  const windowMax = windowActive ? continuity.previousProgressM + continuity.maxForwardM : 0;

  let best: RouteProjection = { progressM: 0, snapped: point, distanceToRouteM: Infinity };
  let bestInWindow = best;
  for (let i = 0; i < line.points.length - 1; i++) {
    const { snapped, t } = projectToSegment(point, line.points[i], line.points[i + 1]);
    const candidate: RouteProjection = {
      progressM: line.cumulativeM[i] + (line.cumulativeM[i + 1] - line.cumulativeM[i]) * t,
      snapped,
      distanceToRouteM: haversineM(point, snapped),
    };
    if (candidate.distanceToRouteM < best.distanceToRouteM) best = candidate;
    if (windowActive && candidate.progressM >= windowMin && candidate.progressM <= windowMax &&
      candidate.distanceToRouteM < bestInWindow.distanceToRouteM) bestInWindow = candidate;
  }
  return windowActive &&
    bestInWindow.distanceToRouteM <= Math.min(continuity.acceptDistanceM, best.distanceToRouteM + continuity.switchMarginM)
    ? bestInWindow
    : best;
}

/** Off-route tolerance: 30 m, 1.5x the GPS accuracy when that is larger, never above 80 m. */
export const offRouteThresholdM = (accuracyM = 0): number => Math.min(80, Math.round(Math.max(30, accuracyM * 1.5)));

export interface RerouteEvidence {
  readonly consecutiveOffRouteCount: number;
  readonly offRouteDurationMs: number;
  readonly cooldownRemainingMs: number;
  /** Cumulative displacement since the start of this off-route episode, not fix to fix. */
  readonly movedDistanceM: number;
}

export function shouldTriggerReroute(e: RerouteEvidence): boolean {
  if (e.cooldownRemainingMs > 0) return false;
  if (e.movedDistanceM < 12) return false;
  return e.consecutiveOffRouteCount >= 3 || e.offRouteDurationMs >= 9_000;
}

export interface ProgressInput {
  readonly line: RouteLine;
  readonly point: VenueCoordinate;
  readonly previousProgressM: number;
  /** Native observation time of this fix and of the last accepted one; the forward bound needs both. */
  readonly observedAtMs?: number | null;
  readonly previousObservedAtMs?: number | null;
  readonly accuracyM?: number;
  readonly speedMps: number;
  readonly previousEtaMinutes?: number;
}

export interface ProgressResult {
  readonly progressM: number;
  readonly remainingM: number;
  readonly etaMinutes: number;
  readonly snapped: VenueCoordinate;
  readonly distanceToRouteM: number;
}

export function advanceProgress(input: ProgressInput): ProgressResult {
  let maxForwardM: number | undefined;
  if (input.observedAtMs != null && input.previousObservedAtMs != null) {
    // One outlier fix (multipath, a cold-start jump) must not project far ahead: bound it by what a person could
    // plausibly have walked since the last accepted fix. A long background gap widens the bound with real time.
    const elapsedS = Math.max(1, (input.observedAtMs - input.previousObservedAtMs) / 1000);
    maxForwardM = input.speedMps * PLAUSIBLE_FORWARD_SPEED_FACTOR * elapsedS + GPS_JITTER_ALLOWANCE_M;
  }
  const projection = projectOnRoute(
    input.line,
    input.point,
    maxForwardM == null ? undefined : {
      previousProgressM: input.previousProgressM,
      maxForwardM,
      acceptDistanceM: offRouteThresholdM(input.accuracyM ?? 0),
      switchMarginM: Math.max(SNAP_SWITCH_MARGIN_M, input.accuracyM ?? 0),
    },
  );
  let progressM = projection.progressM;
  if (progressM + MAX_BACKTRACK_M < input.previousProgressM) progressM = input.previousProgressM;
  else if (maxForwardM != null && progressM > input.previousProgressM + maxForwardM) progressM = input.previousProgressM + maxForwardM;

  const remainingM = Math.max(0, input.line.totalM - progressM);
  const computedEta = Math.max(0, Math.ceil(remainingM / input.speedMps / 60));
  const etaMinutes = remainingM === 0 ? 0
    : input.previousEtaMinutes && Math.abs(input.previousEtaMinutes - computedEta) <= 1 ? input.previousEtaMinutes
    : computedEta;
  return { progressM, remainingM, etaMinutes, snapped: projection.snapped, distanceToRouteM: projection.distanceToRouteM };
}

/**
 * The single authority for both "which step is active" and "its countdown distance". A step's end is where its
 * own walk completes; the active step is the first one, scanning forward from the current index and never back,
 * whose end is still ahead of progress. Once every end is behind progress it is the last step at distance 0.
 */
export function locateStep(steps: readonly RouteStep[], currentIndex: number, progressM: number): { stepIndex: number; maneuverDistanceM: number } {
  let endM = 0;
  const start = Math.max(0, currentIndex);
  for (let i = 0; i < steps.length; i++) {
    endM += steps[i].distanceM;
    if (i >= start && endM > progressM) return { stepIndex: i, maneuverDistanceM: endM - progressM };
  }
  return { stepIndex: Math.max(0, steps.length - 1), maneuverDistanceM: 0 };
}

/** Arrival needs the final walking step to be active and a fix within the arrival threshold of the destination. */
export function isArrivedAtDestination(input: { stepIndex: number; stepCount: number; point: VenueCoordinate; destination: VenueCoordinate }): boolean {
  if (input.stepIndex < Math.max(0, input.stepCount - 2)) return false;
  return haversineM(input.point, input.destination) <= ARRIVAL_THRESHOLD_M;
}

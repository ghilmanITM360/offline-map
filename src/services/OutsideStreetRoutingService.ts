/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Coordinate, Gate } from '../data/ijtema/types';
import { findStreetRouteToTargets, StreetRoutingGraph } from '../../packages/offline-navigation/src/domain/street';
import { getIjtemaStreetRoutingGraph } from '../data/ijtema/streetAdapter';

/**
 * Applies only to the graph-routed street-graph segment of an outside leg,
 * never blended with the beeline-fallback distance — matches Decision 2 in
 * docs/OFFLINE_NAVIGATION_AND_ROUTING.md. Enforcement here is
 * warn-log+flag (return `sanityCapExceeded`, don't reject), the FINAL_SPEC's
 * documented production behavior; scripts/test-outside-street-routing-v2.ts
 * hard-fails on it instead, as the "hard-fail in CI" half of that model.
 */
export const DISTANCE_SANITY_CAP_RATIO = 1.8;

/**
 * Shared with RoutingServiceV2's beeline gate-selection path so both agree on
 * which gates are penalized — kept here (not in RoutingServiceV2) because
 * RoutingServiceV2 imports from this module already; defining it there and
 * importing back would be circular.
 */
export const NEEDS_VERIFICATION_GATE_PENALTY_M = 120;
export const gatePenaltyM = (gate: Gate | undefined): number => (gate?.status === 'needs_verification' ? NEEDS_VERIFICATION_GATE_PENALTY_M : 0);

export interface StreetOutsidePathResult {
  gate: Gate;
  /** Ordered from the nearest street node to the user through to the gate's exact coordinate (inclusive). Full rendering-fidelity geometry. */
  coordinates: Coordinate[];
  /** Same start/end as `coordinates`, but only real decision points (intersections/dead-ends) — for turn-by-turn generation, not rendering. */
  topologyCoordinates: Coordinate[];
  /** Distance per hop between consecutive `topologyCoordinates` entries — length = topologyCoordinates.length - 1. */
  topologyEdgeDistancesM: number[];
  /** OSM name per hop (same indexing as topologyEdgeDistancesM), present for ~1% of edges only. */
  topologyEdgeNames: Array<string | undefined>;
  /** Snap-to-nearest-node + street-graph traversal + gate connector, i.e. the full outside-leg distance. */
  totalDistanceM: number;
  /** Street-graph traversal only (excludes both connector distances) — what the sanity cap ratio is computed against. */
  graphRoutedDistanceM: number;
  sanityCapExceeded: boolean;
}

// Sub-millimeter secondary key folded into the sink weight so an exact tie
// in real cost breaks deterministically (lowest gate number wins) instead of
// being an unspecified artifact of heap insertion order. Small enough that
// it can never flip a real routing decision (smallest realistic real-cost
// gap between two distinct gates is many meters). Exported so any other
// complete-journey cost comparison (e.g. RoutingServiceV2's
// finalizeOutsideRoutingPlan, which scores externally-supplied provider
// distances the same way) breaks ties the same deterministic way instead of
// defining a second, possibly-inconsistent epsilon.
export const TIE_BREAK_EPSILON_M = 1e-6;

/**
 * Single-source (user's nearest street node) multi-target (every candidate
 * gate's connector node) A* over the bounded OSM street graph. Returns the
 * gate that minimizes the complete pedestrian journey — street-graph
 * traversal + gate connector cost + gate verification penalty + (when a
 * destination is known) internal pedestrian cost from that gate to the
 * destination — not just the outside leg. `extraCostByGateId` carries the
 * caller-supplied internal-destination cost per gate (see
 * RoutingServiceV2.selectOutsidePathViaStreetGraph); omitted or missing
 * entries contribute 0, preserving today's outside-leg-only behavior for
 * callers with no destination (e.g. direct probes in
 * scripts/test-outside-street-routing-v2.ts).
 *
 * Per-target extra cost ("arrival cost") + a first-match early exit don't mix
 * directly: stopping at the first target *node* reached would ignore the
 * possibility that a farther-but-cheaper-overall gate has a lower total.
 * Standard fix: treat "arriving at the goal via gate g" as node g plus a
 * fixed non-negative synthetic edge of weight
 * `connector.distanceM + gatePenaltyM(g) + extraCostByGateId.get(g.id)` to
 * one shared virtual sink (see findStreetRouteToTargets). Whenever a candidate gate node
 * is settled, relax the sink through it; keep expanding real neighbors too (a
 * path can legitimately thread past one gate's connector toward a cheaper
 * one). Stop only when the sink itself is popped — by then no unexplored
 * node can beat it (non-negative weights, and the existing heuristic already
 * lower-bounds distance-to-nearest-target, which is <= distance+extraCost for
 * any target, so it stays admissible for the extended goal too).
 */
export const selectStreetGraphOutsidePath = (
  userCoordinate: Coordinate,
  candidateGates: Gate[],
  extraCostByGateId?: Map<string, number>,
  // Host-owned default: this wrapper applies Ijtema gate policy, so the bundled Ijtema graph is its natural default.
  // Production callers (RoutingServiceV2, ProductionOutsideRouteSource) always pass the graph they bound.
  streetGraph: StreetRoutingGraph = getIjtemaStreetRoutingGraph(),
): StreetOutsidePathResult | undefined => {
  // Gate eligibility, the verification penalty and the gate-number tie-break are Ijtema policy, so they are
  // folded in here; the search itself is the venue-independent findStreetRouteToTargets.
  const gates = candidateGates.filter((gate) => gate.coordinate);
  const route = findStreetRouteToTargets(
    streetGraph,
    userCoordinate,
    gates.map((gate) => ({
      id: gate.id,
      coordinate: gate.coordinate!,
      extraCostsM: [gatePenaltyM(gate), extraCostByGateId?.get(gate.id) ?? 0, gate.number * TIE_BREAK_EPSILON_M],
    })),
    DISTANCE_SANITY_CAP_RATIO,
  );
  if (!route) return undefined;
  const { targetId, ...outsidePath } = route;
  return { gate: gates.find((gate) => gate.id === targetId)!, ...outsidePath };
};

/**
 * True when `coordinate` falls inside `streetGraph`'s coverage (for the
 * bundled Ijtema graph: the exact center/radius the OSM extract used) — the
 * boundary between "route on the street graph" and "beeline fallback" per
 * Decision 1 in docs/OFFLINE_NAVIGATION_AND_ROUTING.md. The graph is required:
 * coverage is venue-neutral, so there is no implicit Ijtema fallback here.
 */
export const isWithinStreetGraphRadius = (coordinate: Coordinate, streetGraph: StreetRoutingGraph): boolean =>
  streetGraph.covers(coordinate);

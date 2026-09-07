/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Coordinate, Gate } from '../data/ijtema/types';
import { findNearestStreetNode, getStreetNavigationGraph } from '../data/ijtema/streetGraphBuilder';
import { StreetGraphEdge } from '../data/ijtema/streetGraphTypes';
import { AStarNeighbor, reconstructAStarPath, runAStar } from '../utils/AStar';
import { haversineM } from '../utils/SpatialGrid';

/**
 * Applies only to the graph-routed street-graph segment of an outside leg,
 * never blended with the beeline-fallback distance — matches Decision 2 in
 * docs/OFFLINE_OUTSIDE_ROUTING_FINAL_SPEC.md. Enforcement here is
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

/** Synthetic node id for the virtual-goal-node trick below — not a real street-graph node. */
const GATE_GOAL_SINK = '__gate_goal__';

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
  /** Raw user coordinate -> nearest street node (`topologyCoordinates[0]`) snap distance. Excluded
   * from `topologyCoordinates`/`topologyEdgeDistancesM` (which start AT the snapped node), so a
   * caller generating turn-by-turn instructions from those arrays must surface this separately —
   * otherwise the user's live distance-to-first-maneuver (measured from their real position) and
   * that instruction's own displayed distance (measured from the snapped node) silently disagree. */
  approachDistanceM: number;
  /** Snap-to-nearest-node + street-graph traversal + gate connector, i.e. the full outside-leg distance. */
  totalDistanceM: number;
  /** Street-graph traversal only (excludes both connector distances) — what the sanity cap ratio is computed against. */
  graphRoutedDistanceM: number;
  sanityCapExceeded: boolean;
}

const heuristicToNearestNode = (fromId: string, targetNodeIds: Set<string>): number => {
  const graph = getStreetNavigationGraph();
  const from = graph.nodes[fromId];
  if (!from) return 0;
  let min = Infinity;
  for (const targetId of targetNodeIds) {
    const target = graph.nodes[targetId];
    if (!target) continue;
    const distance = haversineM(from.lat, from.lng, target.lat, target.lng);
    if (distance < min) min = distance;
  }
  return min === Infinity ? 0 : min;
};

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
 * one shared virtual sink (`GATE_GOAL_SINK`). Whenever a candidate gate node
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
): StreetOutsidePathResult | undefined => {
  const graph = getStreetNavigationGraph();
  const nearestUser = findNearestStreetNode(userCoordinate);
  if (!nearestUser) return undefined;

  const targets = candidateGates
    .filter((gate) => gate.coordinate && graph.gateConnectors[gate.id])
    .map((gate) => ({ gate, connector: graph.gateConnectors[gate.id] }));
  if (targets.length === 0) return undefined;

  const targetNodeIds = new Set(targets.map((target) => target.connector.nodeId));
  const targetSinkWeight = new Map(
    targets.map((target) => [
      target.connector.nodeId,
      target.connector.distanceM +
        gatePenaltyM(target.gate) +
        (extraCostByGateId?.get(target.gate.id) ?? 0) +
        target.gate.number * TIE_BREAK_EPSILON_M,
    ]),
  );

  // Real street-graph edges, plus (only from a candidate gate's connector
  // node) one synthetic edge to the virtual sink weighted by that gate's
  // connector + penalty + extra cost — see the function doc comment above.
  const neighbors = (nodeId: string): AStarNeighbor<StreetGraphEdge>[] => {
    const realNeighbors = (graph.adjacency[nodeId] ?? []).map((edge) => ({ to: edge.to, weight: edge.distanceM, edge }));
    const sinkWeight = targetSinkWeight.get(nodeId);
    return sinkWeight === undefined ? realNeighbors : [...realNeighbors, { to: GATE_GOAL_SINK, weight: sinkWeight }];
  };

  const result = runAStar<StreetGraphEdge>({
    seeds: [{ id: nearestUser.node.id, gScore: 0 }],
    heuristic: (nodeId) => (nodeId === GATE_GOAL_SINK ? 0 : heuristicToNearestNode(nodeId, targetNodeIds)),
    neighbors,
    isGoal: (nodeId) => nodeId === GATE_GOAL_SINK,
  });
  if (!result) return undefined;

  const reachedNodeId = result.previousNode[GATE_GOAL_SINK];
  if (!reachedNodeId) return undefined;

  const reachedTarget = targets.find((target) => target.connector.nodeId === reachedNodeId);
  if (!reachedTarget) return undefined;

  const { edges: edgesUsed } = reconstructAStarPath(result, reachedNodeId);

  const coordinates: Coordinate[] = [];
  const dedupToleranceM = 2;
  const pushCoord = (lat: number, lng: number) => {
    const last = coordinates[coordinates.length - 1];
    if (last && haversineM(last.lat, last.lng, lat, lng) <= dedupToleranceM) return;
    coordinates.push({ lat, lng });
  };

  // Topology nodes are the real decision points (intersections/dead-ends) —
  // turn-by-turn instructions are generated from this coarser sequence, not
  // from every rendering-fidelity geometry point (which would produce one
  // instruction per smoothing point on a curve).
  const topologyCoordinates: Coordinate[] = [{ lat: nearestUser.node.lat, lng: nearestUser.node.lng }];
  const topologyEdgeDistancesM: number[] = [];
  const topologyEdgeNames: Array<string | undefined> = [];

  pushCoord(nearestUser.node.lat, nearestUser.node.lng);
  for (const edge of edgesUsed) {
    for (const point of edge.geometry ?? []) pushCoord(point.lat, point.lng);
    const endNode = graph.nodes[edge.to];
    pushCoord(endNode.lat, endNode.lng);
    topologyCoordinates.push({ lat: endNode.lat, lng: endNode.lng });
    topologyEdgeDistancesM.push(edge.distanceM);
    topologyEdgeNames.push(edge.name);
  }
  pushCoord(reachedTarget.gate.coordinate!.lat, reachedTarget.gate.coordinate!.lng);
  topologyCoordinates.push({ lat: reachedTarget.gate.coordinate!.lat, lng: reachedTarget.gate.coordinate!.lng });
  topologyEdgeDistancesM.push(reachedTarget.connector.distanceM);
  topologyEdgeNames.push(undefined);

  const graphRoutedDistanceM = result.gScore[reachedNodeId];
  const reachedNode = graph.nodes[reachedNodeId];
  const straightLineForRatio = haversineM(nearestUser.node.lat, nearestUser.node.lng, reachedNode.lat, reachedNode.lng);
  const ratio = straightLineForRatio > 0 ? graphRoutedDistanceM / straightLineForRatio : 1;

  return {
    gate: reachedTarget.gate,
    coordinates,
    topologyCoordinates,
    topologyEdgeDistancesM,
    topologyEdgeNames,
    approachDistanceM: Math.round(nearestUser.distanceM),
    totalDistanceM: nearestUser.distanceM + graphRoutedDistanceM + reachedTarget.connector.distanceM,
    graphRoutedDistanceM,
    sanityCapExceeded: ratio > DISTANCE_SANITY_CAP_RATIO,
  };
};

/**
 * True when `coordinate` falls inside the bundled street-graph's extraction
 * radius (its metadata records the exact center/radius the OSM extract used)
 * — the boundary between "route on the street graph" and "beeline fallback"
 * per Decision 1 in docs/OFFLINE_OUTSIDE_ROUTING_FINAL_SPEC.md.
 */
export const isWithinStreetGraphRadius = (coordinate: Coordinate): boolean => {
  const { metadata } = getStreetNavigationGraph();
  const distanceM = haversineM(coordinate.lat, coordinate.lng, metadata.centerLat, metadata.centerLng);
  return distanceM <= metadata.radiusM;
};

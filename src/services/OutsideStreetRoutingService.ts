/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Coordinate, Gate } from '../data/ijtema/types';
import { findNearestStreetNode, getStreetNavigationGraph } from '../data/ijtema/streetGraphBuilder';
import { StreetGraphEdge } from '../data/ijtema/streetGraphTypes';
import { MinHeap } from '../utils/MinHeap';
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

/**
 * Single-source (user's nearest street node) multi-target (every candidate
 * gate's connector node) A* over the bounded OSM street graph. Returns the
 * cheapest gate to route through and the full polyline to reach it,
 * including preserved intermediate geometry for rendering fidelity.
 */
export const selectStreetGraphOutsidePath = (
  userCoordinate: Coordinate,
  candidateGates: Gate[],
): StreetOutsidePathResult | undefined => {
  const graph = getStreetNavigationGraph();
  const nearestUser = findNearestStreetNode(userCoordinate);
  if (!nearestUser) return undefined;

  const targets = candidateGates
    .filter((gate) => gate.coordinate && graph.gateConnectors[gate.id])
    .map((gate) => ({ gate, connector: graph.gateConnectors[gate.id] }));
  if (targets.length === 0) return undefined;

  const targetNodeIds = new Set(targets.map((target) => target.connector.nodeId));

  const gScore: Record<string, number> = { [nearestUser.node.id]: 0 };
  const previousNode: Record<string, string | undefined> = {};
  const previousEdge: Record<string, StreetGraphEdge | undefined> = {};
  const closed = new Set<string>();
  const open = new MinHeap<string>();
  open.push(nearestUser.node.id, heuristicToNearestNode(nearestUser.node.id, targetNodeIds));

  let reachedNodeId: string | undefined;

  while (!open.isEmpty()) {
    const current = open.pop()!.value;
    if (closed.has(current)) continue;
    if (targetNodeIds.has(current)) {
      reachedNodeId = current;
      break;
    }
    closed.add(current);

    const currentDistance = gScore[current] ?? Infinity;
    for (const edge of graph.adjacency[current] ?? []) {
      if (closed.has(edge.to)) continue;
      const nextDistance = currentDistance + edge.distanceM;
      if (nextDistance < (gScore[edge.to] ?? Infinity)) {
        gScore[edge.to] = nextDistance;
        previousNode[edge.to] = current;
        previousEdge[edge.to] = edge;
        open.push(edge.to, nextDistance + heuristicToNearestNode(edge.to, targetNodeIds));
      }
    }
  }

  if (!reachedNodeId) return undefined;

  const reachedTarget = targets.find((target) => target.connector.nodeId === reachedNodeId);
  if (!reachedTarget) return undefined;

  const edgesUsed: StreetGraphEdge[] = [];
  let cursor: string | undefined = reachedNodeId;
  while (cursor) {
    const edge = previousEdge[cursor];
    if (edge) edgesUsed.unshift(edge);
    cursor = previousNode[cursor];
  }

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

  const graphRoutedDistanceM = gScore[reachedNodeId];
  const reachedNode = graph.nodes[reachedNodeId];
  const straightLineForRatio = haversineM(nearestUser.node.lat, nearestUser.node.lng, reachedNode.lat, reachedNode.lng);
  const ratio = straightLineForRatio > 0 ? graphRoutedDistanceM / straightLineForRatio : 1;

  return {
    gate: reachedTarget.gate,
    coordinates,
    topologyCoordinates,
    topologyEdgeDistancesM,
    topologyEdgeNames,
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

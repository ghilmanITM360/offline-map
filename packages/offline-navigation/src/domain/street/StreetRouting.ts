/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { AStarNeighbor, reconstructAStarPath, runAStar } from '../algorithms/AStar';
import { haversineM } from '../geo/SpatialGrid';
import { StreetEdge, StreetPoint, StreetRoutingGraph } from './StreetGraph';

// B3c: the outside-street search that used to live in the Ijtema OutsideStreetRoutingService, now taking its
// graph explicitly. Algorithm, float summation order and tie behaviour are unchanged, so the Ijtema routes
// it produces are byte-identical to the pre-extraction service.

/** Synthetic node id for the virtual-goal-node trick below. Reserved: a graph that uses it as a real node id gets no route. */
const TARGET_GOAL_SINK = '__street_route_goal__';
const DEDUP_TOLERANCE_M = 2;

export interface StreetRouteTarget {
  /** Host place ID; its connector comes from graph.connectorFor(id). Targets without one are skipped. */
  readonly id: string;
  /** Exact end point of the route (the place itself, past its connector). */
  readonly coordinate: StreetPoint;
  /**
   * Extra arrival costs (penalties, onward cost, tie-break epsilon), added left to right after the connector
   * distance. A list rather than one sum so the host controls float summation order.
   */
  readonly extraCostsM?: readonly number[];
}

export interface StreetTargetRoute {
  readonly targetId: string;
  /** From the origin (when farther than dedup noise from its snapped node) to the target's coordinate. Full rendering geometry. */
  coordinates: StreetPoint[];
  /** Same endpoints, real decision points only (intersections/dead-ends) - for turn-by-turn, not rendering. */
  topologyCoordinates: StreetPoint[];
  /** Distance per hop between consecutive topologyCoordinates - length = topologyCoordinates.length - 1. */
  topologyEdgeDistancesM: number[];
  /** Street name per hop (same indexing as topologyEdgeDistancesM). */
  topologyEdgeNames: Array<string | undefined>;
  /** Snap-to-nearest-node + street traversal + connector: the full outside-leg distance. */
  totalDistanceM: number;
  /** Street traversal only (excludes both connector distances) - what the sanity ratio is computed against. */
  graphRoutedDistanceM: number;
  /** Street traversal is more than sanityCapRatio times the straight line between its end nodes. */
  sanityCapExceeded: boolean;
}

/**
 * Single-source (origin's nearest street node) multi-target A* that minimises, per target,
 * street cost + connector distance + extraCostsM. Each target's arrival is a synthetic edge from its
 * connector node into one shared virtual sink, and the search stops only when that sink is popped, so a
 * farther-but-cheaper-overall target wins. The heuristic (distance to the nearest target node) stays
 * admissible because every arrival cost is non-negative. Returns undefined when nothing is reachable.
 */
export const findStreetRouteToTargets = <E extends StreetEdge>(
  graph: StreetRoutingGraph<E>,
  origin: StreetPoint,
  targets: readonly StreetRouteTarget[],
  sanityCapRatio: number,
): StreetTargetRoute | undefined => {
  if (graph.getNode(TARGET_GOAL_SINK)) return undefined; // the sink id would alias a real node
  const nearestUser = graph.nearestNode(origin);
  if (!nearestUser) return undefined;

  const connected = targets.flatMap((target) => {
    const connector = graph.connectorFor(target.id);
    return connector ? [{ target, connector }] : [];
  });
  if (connected.length === 0) return undefined;

  const targetNodeIds = new Set(connected.map(({ connector }) => connector.nodeId));
  const targetSinkWeight = new Map(
    connected.map(({ target, connector }) => [
      connector.nodeId,
      (target.extraCostsM ?? []).reduce((sum, cost) => sum + cost, connector.distanceM),
    ]),
  );

  const heuristicToNearestNode = (fromId: string): number => {
    const from = graph.getNode(fromId);
    if (!from) return 0;
    let min = Infinity;
    for (const targetId of targetNodeIds) {
      const target = graph.getNode(targetId);
      if (!target) continue;
      const distance = haversineM(from.lat, from.lng, target.lat, target.lng);
      if (distance < min) min = distance;
    }
    return min === Infinity ? 0 : min;
  };

  const neighbors = (nodeId: string): AStarNeighbor<E>[] => {
    const realNeighbors = graph.edgesFrom(nodeId).map((edge) => ({ to: edge.to, weight: edge.distanceM, edge }));
    const sinkWeight = targetSinkWeight.get(nodeId);
    return sinkWeight === undefined ? realNeighbors : [...realNeighbors, { to: TARGET_GOAL_SINK, weight: sinkWeight }];
  };

  const result = runAStar<E>({
    seeds: [{ id: nearestUser.node.id, gScore: 0 }],
    heuristic: (nodeId) => (nodeId === TARGET_GOAL_SINK ? 0 : heuristicToNearestNode(nodeId)),
    neighbors,
    isGoal: (nodeId) => nodeId === TARGET_GOAL_SINK,
  });
  if (!result) return undefined;

  const reachedNodeId = result.previousNode[TARGET_GOAL_SINK];
  if (!reachedNodeId) return undefined;

  const reached = connected.find(({ connector }) => connector.nodeId === reachedNodeId);
  if (!reached) return undefined;

  const { edges: edgesUsed } = reconstructAStarPath(result, reachedNodeId);

  const coordinates: StreetPoint[] = [];
  const pushCoord = (lat: number, lng: number) => {
    const last = coordinates[coordinates.length - 1];
    if (last && haversineM(last.lat, last.lng, lat, lng) <= DEDUP_TOLERANCE_M) return;
    coordinates.push({ lat, lng });
  };

  // The origin -> snapped-node leg is a real hop (issue #69) and the start of the rendered line (issue #107)
  // whenever it is longer than dedup noise; it is already counted in totalDistanceM below.
  const snapped = nearestUser.distanceM > DEDUP_TOLERANCE_M;
  const topologyCoordinates: StreetPoint[] = snapped
    ? [{ lat: origin.lat, lng: origin.lng }, { lat: nearestUser.node.lat, lng: nearestUser.node.lng }]
    : [{ lat: nearestUser.node.lat, lng: nearestUser.node.lng }];
  const topologyEdgeDistancesM: number[] = snapped ? [nearestUser.distanceM] : [];
  const topologyEdgeNames: Array<string | undefined> = snapped ? [undefined] : [];

  if (snapped) pushCoord(origin.lat, origin.lng);
  pushCoord(nearestUser.node.lat, nearestUser.node.lng);
  for (const edge of edgesUsed) {
    for (const point of edge.geometry ?? []) pushCoord(point.lat, point.lng);
    const endNode = graph.getNode(edge.to)!;
    pushCoord(endNode.lat, endNode.lng);
    topologyCoordinates.push({ lat: endNode.lat, lng: endNode.lng });
    topologyEdgeDistancesM.push(edge.distanceM);
    topologyEdgeNames.push(edge.name);
  }
  const end = reached.target.coordinate;
  pushCoord(end.lat, end.lng);
  topologyCoordinates.push({ lat: end.lat, lng: end.lng });
  topologyEdgeDistancesM.push(reached.connector.distanceM);
  topologyEdgeNames.push(undefined);

  const graphRoutedDistanceM = result.gScore[reachedNodeId];
  const reachedNode = graph.getNode(reachedNodeId)!;
  const straightLineForRatio = haversineM(nearestUser.node.lat, nearestUser.node.lng, reachedNode.lat, reachedNode.lng);
  const ratio = straightLineForRatio > 0 ? graphRoutedDistanceM / straightLineForRatio : 1;

  return {
    targetId: reached.target.id,
    coordinates,
    topologyCoordinates,
    topologyEdgeDistancesM,
    topologyEdgeNames,
    totalDistanceM: nearestUser.distanceM + graphRoutedDistanceM + reached.connector.distanceM,
    graphRoutedDistanceM,
    sanityCapExceeded: ratio > sanityCapRatio,
  };
};

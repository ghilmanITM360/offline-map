/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { runAStar, reconstructAStarPath, AStarNeighbor, AStarSeed } from '../algorithms/AStar';
import { VenueCoordinate, VenueEdge, VenueRoutingGraph, edgeCostM } from './VenueDataSource';

const toRad = (d: number): number => (d * Math.PI) / 180;

// Same formula as the Ijtema graph builder's distanceMeters, so heuristics (and A* tie behaviour) match.
export const haversineM = (from: VenueCoordinate, to: VenueCoordinate): number => {
  const dLat = toRad(to.lat - from.lat);
  const dLng = toRad(to.lng - from.lng);
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(from.lat)) * Math.cos(toRad(to.lat)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

export interface VenuePath<E extends VenueEdge> {
  readonly nodes: string[];
  readonly edges: E[];
  readonly costM: number;
}

/** Shortest path on a venue graph, or undefined when unreachable / an endpoint is not in the graph. */
export const findVenuePath = <E extends VenueEdge>(
  graph: VenueRoutingGraph<E>,
  startId: string,
  goalId: string,
): VenuePath<E> | undefined => {
  if (!graph.getNode(startId) || !graph.getNode(goalId)) return undefined;
  if (startId === goalId) return { nodes: [startId], edges: [], costM: 0 };
  const goal = graph.getNode(goalId)!;
  const result = runAStar<E>({
    seeds: [{ id: startId, gScore: 0 }],
    heuristic: (id) => {
      const n = graph.getNode(id);
      return n ? haversineM(n.coordinate, goal.coordinate) : 0;
    },
    neighbors: (id): AStarNeighbor<E>[] => graph.edgesFrom(id).map((edge) => ({ to: edge.to, weight: edgeCostM(edge), edge })),
    isGoal: (id) => id === goalId,
  });
  if (!result) return undefined;
  const path = reconstructAStarPath(result, result.goalId);
  return { nodes: path.nodes, edges: path.edges, costM: result.gScore[result.goalId] };
};

// B3b: the service-level search RoutingServiceV2 runs on whatever graph its host injects. These reproduce the
// pre-B3b in-service functions exactly (no endpoint pre-check, start-major strict-< selection, first-match seed
// recovery) so production paths, costs and tie-breaks are unchanged. Callers pass pre-filtered candidate IDs.

export interface VenueRoute<E extends VenueEdge> extends VenuePath<E> {
  /** Unweighted length (sum of edge distanceM); costM is the weighted search cost. */
  readonly distanceM: number;
}

const venueNeighbors = <E extends VenueEdge>(graph: VenueRoutingGraph<E>) => (id: string): AStarNeighbor<E>[] =>
  graph.edgesFrom(id).map((edge) => ({ to: edge.to, weight: edgeCostM(edge), edge }));

const sumDistanceM = (edges: readonly VenueEdge[]): number => edges.reduce((sum, edge) => sum + edge.distanceM, 0);

const shortestVenueRoute = <E extends VenueEdge>(graph: VenueRoutingGraph<E>, startId: string, goalId: string): VenueRoute<E> | undefined => {
  if (startId === goalId) return { nodes: [startId], edges: [], distanceM: 0, costM: 0 };
  const result = runAStar<E>({
    seeds: [{ id: startId, gScore: 0 }],
    heuristic: (id) => {
      const from = graph.getNode(id);
      const to = graph.getNode(goalId);
      return from && to ? haversineM(from.coordinate, to.coordinate) : 0;
    },
    neighbors: venueNeighbors(graph),
    isGoal: (id) => id === goalId,
  });
  if (!result) return undefined;
  const { nodes, edges } = reconstructAStarPath(result, result.goalId);
  if (nodes[0] !== startId || nodes.length < 2) return undefined;
  return { nodes, edges, distanceM: sumDistanceM(edges), costM: result.gScore[result.goalId] };
};

/** Cheapest route over every (start, goal) pair; on equal cost the earliest pair (start-major) wins. */
export const findBestVenuePath = <E extends VenueEdge>(
  graph: VenueRoutingGraph<E>,
  startIds: readonly string[],
  goalIds: readonly string[],
): VenueRoute<E> | undefined => {
  let best: VenueRoute<E> | undefined;
  for (const startId of startIds) {
    for (const goalId of goalIds) {
      const route = shortestVenueRoute(graph, startId, goalId);
      if (route && (!best || route.costM < best.costM)) best = route;
    }
  }
  return best;
};

/**
 * Multi-source search: every seed starts with its own initial cost (e.g. an outside approach). Returns the
 * route from the winning seed (costM excludes that seed's initial cost) and the seed's id.
 */
export const findBestSeededVenuePath = <E extends VenueEdge>(
  graph: VenueRoutingGraph<E>,
  seeds: readonly AStarSeed[],
  goalIds: readonly string[],
): { route: VenueRoute<E>; seedId: string } | undefined => {
  if (seeds.length === 0 || goalIds.length === 0) return undefined;
  const goals = new Set(goalIds);
  const result = runAStar<E>({
    seeds: [...seeds],
    heuristic: (id) => {
      const node = graph.getNode(id);
      if (!node) return 0;
      let min = Infinity;
      for (const goalId of goalIds) {
        const goal = graph.getNode(goalId);
        if (!goal) continue;
        const d = haversineM(node.coordinate, goal.coordinate);
        if (d < min) min = d;
      }
      return min === Infinity ? 0 : min;
    },
    neighbors: venueNeighbors(graph),
    isGoal: (id) => goals.has(id),
  });
  if (!result) return undefined;
  const { nodes, edges } = reconstructAStarPath(result, result.goalId);
  const seed = seeds.find((s) => s.id === nodes[0]);
  if (!seed) return undefined;
  return { route: { nodes, edges, distanceM: sumDistanceM(edges), costM: result.gScore[result.goalId] - seed.gScore }, seedId: seed.id };
};

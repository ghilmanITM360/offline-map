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

/**
 * How much of the straight-line distance may be used as the A* estimate on this graph. The estimate is admissible only if no edge costs less
 * than the straight line between its ends, but the graph contracts accept any non-negative `weightMultiplier` (a discounted path) and a
 * `distanceM` shorter than the geodesic. So the scale is the smallest cost/straight-line ratio over every edge, capped at 1: scale x
 * straight-line is then a lower bound of any route's cost (triangle inequality), and it is exactly 1 on a graph with no discounted edge,
 * leaving those searches unchanged. An edge whose far end has no coordinates, or a zero-cost edge, makes the scale 0 (plain Dijkstra).
 * Computed once per graph object, which is assumed not to change afterwards.
 */
const SCALE_SAFETY = 1 - 1e-9; // float rounding in the haversine formula must never tip an estimate over the true cost
const scaleCache = new WeakMap<object, number>();
export const heuristicScale = (graph: VenueRoutingGraph): number => {
  const cached = scaleCache.get(graph);
  if (cached !== undefined) return cached;
  let scale = 1;
  for (const id of graph.nodeIds()) {
    const from = graph.getNode(id);
    for (const edge of graph.edgesFrom(id)) {
      const to = graph.getNode(edge.to);
      if (!from || !to) { scale = 0; continue; }
      const cost = edgeCostM(edge);
      const straight = haversineM(from.coordinate, to.coordinate);
      if (!(cost >= straight)) scale = Math.min(scale, straight > 0 && cost >= 0 ? cost / straight : 0);
    }
  }
  const result = scale < 1 ? scale * SCALE_SAFETY : 1;
  scaleCache.set(graph, result);
  return result;
};

/**
 * Every search runs with the scaled (provably admissible) estimate and is therefore cheapest-cost. On a graph that needed a scale below 1 it
 * also runs once with the plain straight-line estimate the venue has always used, and that route is kept when it is as cheap (within float
 * noise): both are optimal, they differ only in WHICH of several equal-cost paths they report, and the routes this SDK has already published
 * must not change. A route that is genuinely dearer than the optimum is never returned.
 */
const COST_EPSILON_M = 1e-9;
const preferPublishedTies = <T extends { total: number }>(graph: VenueRoutingGraph, run: (scale: number) => T | undefined): T | undefined => {
  const scale = heuristicScale(graph);
  const exact = run(scale);
  if (!exact || scale === 1) return exact;
  const published = run(1);
  return published && published.total <= exact.total + COST_EPSILON_M ? published : exact;
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
  return preferPublishedTies(graph, (scale) => {
    const result = runAStar<E>({
      seeds: [{ id: startId, gScore: 0 }],
      heuristic: (id) => {
        const n = graph.getNode(id);
        return n ? scale * haversineM(n.coordinate, goal.coordinate) : 0;
      },
      neighbors: (id): AStarNeighbor<E>[] => graph.edgesFrom(id).map((edge) => ({ to: edge.to, weight: edgeCostM(edge), edge })),
      isGoal: (id) => id === goalId,
    });
    if (!result) return undefined;
    const path = reconstructAStarPath(result, result.goalId);
    return { nodes: path.nodes, edges: path.edges, costM: result.gScore[result.goalId], total: result.gScore[result.goalId] };
  });
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
  return preferPublishedTies(graph, (scale) => {
    const result = runAStar<E>({
      seeds: [{ id: startId, gScore: 0 }],
      heuristic: (id) => {
        const from = graph.getNode(id);
        const to = graph.getNode(goalId);
        return from && to ? scale * haversineM(from.coordinate, to.coordinate) : 0;
      },
      neighbors: venueNeighbors(graph),
      isGoal: (id) => id === goalId,
    });
    if (!result) return undefined;
    const { nodes, edges } = reconstructAStarPath(result, result.goalId);
    if (nodes[0] !== startId || nodes.length < 2) return undefined;
    const costM = result.gScore[result.goalId];
    return { nodes, edges, distanceM: sumDistanceM(edges), costM, total: costM };
  });
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
  // One initial cost per id (the lowest, the earliest on a tie), so the search and the reconstruction agree on the winning seed.
  const byId = new Map<string, AStarSeed>();
  for (const seed of seeds) {
    const known = byId.get(seed.id);
    if (!known || seed.gScore < known.gScore) byId.set(seed.id, seed);
  }
  const unique = [...byId.values()];
  const found = preferPublishedTies(graph, (scale) => {
    const result = runAStar<E>({
      seeds: unique,
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
        return min === Infinity ? 0 : scale * min;
      },
      neighbors: venueNeighbors(graph),
      isGoal: (id) => goals.has(id),
    });
    if (!result) return undefined;
    const { nodes, edges } = reconstructAStarPath(result, result.goalId);
    const seed = byId.get(nodes[0]);
    if (!seed) return undefined;
    return { nodes, edges, seed, total: result.gScore[result.goalId] };
  });
  if (!found) return undefined;
  const { nodes, edges, seed, total } = found;
  return { route: { nodes, edges, distanceM: sumDistanceM(edges), costM: total - seed.gScore }, seedId: seed.id };
};

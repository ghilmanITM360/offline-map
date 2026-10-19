/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { runAStar, reconstructAStarPath, AStarNeighbor } from '../algorithms/AStar';
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

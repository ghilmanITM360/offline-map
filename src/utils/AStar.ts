/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { MinHeap } from './MinHeap';

export interface AStarNeighbor<TEdge> {
  to: string;
  weight: number;
  /** Omitted for synthetic (non-graph) edges — e.g. a virtual-goal-node hop. */
  edge?: TEdge;
}

export interface AStarSeed {
  id: string;
  gScore: number;
}

export interface AStarResult<TEdge> {
  goalId: string;
  gScore: Record<string, number>;
  previousNode: Record<string, string | undefined>;
  previousEdge: Record<string, TEdge | undefined>;
}

export interface AStarParams<TEdge> {
  /** One or more starting nodes, each with its own initial cost (single-source: one seed with gScore 0). */
  seeds: AStarSeed[];
  heuristic: (nodeId: string) => number;
  neighbors: (nodeId: string) => AStarNeighbor<TEdge>[];
  /** Checked immediately on pop, before the closed-set check — matches the invariant that the
   * first pop of any goal-matching id is already optimal (non-negative weights, admissible heuristic). */
  isGoal: (nodeId: string) => boolean;
}

/**
 * Generic binary-heap A*, shared by every routing search in the app:
 * single-source/single-destination (RoutingServiceV2.calculateShortestPath),
 * multi-source/multi-destination (RoutingServiceV2.findBestOutsidePath), and
 * single-source/multi-target-with-penalty via a virtual sink node
 * (OutsideStreetRoutingService.selectStreetGraphOutsidePath). Each caller
 * supplies its own graph via `neighbors`/`heuristic`/`isGoal` and reconstructs
 * its own result shape from the returned gScore/previousNode/previousEdge —
 * this core only finds the goal and the parent-pointer chain to it.
 */
export function runAStar<TEdge>(params: AStarParams<TEdge>): AStarResult<TEdge> | undefined {
  const { seeds, heuristic, neighbors, isGoal } = params;

  const gScore: Record<string, number> = {};
  const previousNode: Record<string, string | undefined> = {};
  const previousEdge: Record<string, TEdge | undefined> = {};
  const closed = new Set<string>();
  const open = new MinHeap<string>();

  for (const seed of seeds) {
    if (seed.gScore < (gScore[seed.id] ?? Infinity)) {
      gScore[seed.id] = seed.gScore;
      open.push(seed.id, seed.gScore + heuristic(seed.id));
    }
  }

  while (!open.isEmpty()) {
    const current = open.pop()!.value;
    if (isGoal(current)) {
      return { goalId: current, gScore, previousNode, previousEdge };
    }
    if (closed.has(current)) continue;
    closed.add(current);

    const currentDistance = gScore[current] ?? Infinity;
    for (const neighbor of neighbors(current)) {
      if (closed.has(neighbor.to)) continue;
      const nextDistance = currentDistance + neighbor.weight;
      if (nextDistance < (gScore[neighbor.to] ?? Infinity)) {
        gScore[neighbor.to] = nextDistance;
        previousNode[neighbor.to] = current;
        previousEdge[neighbor.to] = neighbor.edge;
        open.push(neighbor.to, nextDistance + heuristic(neighbor.to));
      }
    }
  }

  return undefined;
}

/** Walks previousNode from `goalId` back to its root, collecting node ids and edges in path order. */
export function reconstructAStarPath<TEdge>(
  result: Pick<AStarResult<TEdge>, 'previousNode' | 'previousEdge'>,
  goalId: string,
): { nodes: string[]; edges: TEdge[] } {
  const nodes: string[] = [];
  const edges: TEdge[] = [];
  let cursor: string | undefined = goalId;
  while (cursor) {
    nodes.unshift(cursor);
    const edge = result.previousEdge[cursor];
    if (edge) edges.unshift(edge);
    cursor = result.previousNode[cursor];
  }
  return { nodes, edges };
}

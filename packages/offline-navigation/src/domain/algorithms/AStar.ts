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
 *
 * Contract: weights are finite and non-negative (an edge that is not is never used, so a bad edge can neither shorten a route nor loop the
 * search) and the heuristic never overestimates the remaining cost. It need NOT be consistent: a node whose cost improves after it was
 * expanded is expanded again, so the first goal popped is optimal for any admissible heuristic. Node ids are opaque strings: the score
 * records have no prototype, so `toString`, `__proto__` and every other name are ordinary ids.
 */
export function runAStar<TEdge>(params: AStarParams<TEdge>): AStarResult<TEdge> | undefined {
  const { seeds, heuristic, neighbors, isGoal } = params;

  const gScore: Record<string, number> = Object.create(null);
  const previousNode: Record<string, string | undefined> = Object.create(null);
  const previousEdge: Record<string, TEdge | undefined> = Object.create(null);
  // Entries are never updated in place: a cheaper way to a node queues a new entry and the old one is recognised as stale on pop.
  const open = new MinHeap<{ id: string; g: number }>();

  for (const seed of seeds) {
    if (seed.gScore < (gScore[seed.id] ?? Infinity)) {
      gScore[seed.id] = seed.gScore;
      open.push({ id: seed.id, g: seed.gScore }, seed.gScore + heuristic(seed.id));
    }
  }

  while (!open.isEmpty()) {
    const { id: current, g: currentDistance } = open.pop()!.value;
    if (currentDistance > gScore[current]) continue; // stale: a cheaper way here was found after this entry was queued
    if (isGoal(current)) {
      return { goalId: current, gScore, previousNode, previousEdge };
    }

    for (const neighbor of neighbors(current)) {
      if (!(neighbor.weight >= 0) || neighbor.weight === Infinity) continue;
      const nextDistance = currentDistance + neighbor.weight;
      if (nextDistance < (gScore[neighbor.to] ?? Infinity)) {
        gScore[neighbor.to] = nextDistance;
        previousNode[neighbor.to] = current;
        previousEdge[neighbor.to] = neighbor.edge;
        open.push({ id: neighbor.to, g: nextDistance }, nextDistance + heuristic(neighbor.to));
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
  while (cursor !== undefined) {
    nodes.unshift(cursor);
    const edge = result.previousEdge[cursor];
    if (edge) edges.unshift(edge);
    cursor = result.previousNode[cursor];
  }
  return { nodes, edges };
}

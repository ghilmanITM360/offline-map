import { createHash } from 'node:crypto';
import { IJTEMA_NAVIGATION_GRAPH_V2 as G, distanceMeters } from '../src/data/ijtema';
import { AStarNeighbor, reconstructAStarPath, runAStar } from '../src/utils/AStar';

const sha = (s: string): string => createHash('sha256').update(s).digest('hex');

type Edge = (typeof G.adjacency)[string][number];

const neighbors = (id: string): AStarNeighbor<Edge>[] =>
  (G.adjacency[id] ?? []).map((edge) => ({ to: edge.to, weight: edge.distanceM * (edge.weightMultiplier ?? 1), edge }));

// Same heuristic shape as RoutingServiceV2.heuristicCostM.
const h = (from: string, to: string): number => {
  const a = G.nodes[from];
  const b = G.nodes[to];
  return a && b ? distanceMeters(a.coordinate, b.coordinate) : 0;
};

/** Exhaustive ordered-pair sweep of the production internal graph (start != goal), deterministic order. */
export const computeGoldenSnapshot = () => {
  const ids = Object.keys(G.nodes).sort();
  const lines: string[] = [];
  const costLines: string[] = [];
  const sampledCosts: Record<string, number> = {};
  let routable = 0;
  let unreachable = 0;
  let k = 0;
  for (const s of ids) {
    for (const t of ids) {
      if (s === t) continue;
      const r = runAStar<Edge>({
        seeds: [{ id: s, gScore: 0 }],
        heuristic: (n) => h(n, t),
        neighbors,
        isGoal: (n) => n === t,
      });
      const key = `${s}>${t}`;
      if (!r) {
        unreachable++;
        lines.push(`${key}|UNREACHABLE`);
        costLines.push(`${key}|UNREACHABLE`);
      } else {
        routable++;
        const path = reconstructAStarPath(r, r.goalId).nodes;
        const cost = r.gScore[r.goalId];
        lines.push(`${key}|${cost}|${path.join(',')}`);
        costLines.push(`${key}|${cost}`);
        if (k % 997 === 0) sampledCosts[key] = cost;
      }
      k++;
    }
  }
  return {
    nodeCount: ids.length,
    pairCount: k,
    routableCount: routable,
    unreachableCount: unreachable,
    pathHash: sha(lines.join('\n')),
    costHash: sha(costLines.join('\n')),
    sampledCosts,
    graphHash: sha(JSON.stringify({ nodes: G.nodes, adjacency: G.adjacency })),
  };
};

/** Hand-built tie graph: two equal-cost routes S->T. Records which route the unchanged algorithm picks. */
export const computeTieSnapshot = () => {
  const adj: Record<string, Array<{ to: string; w: number }>> = {
    S: [{ to: 'A', w: 1 }, { to: 'B', w: 1 }],
    A: [{ to: 'T', w: 1 }],
    B: [{ to: 'T', w: 1 }],
    T: [],
  };
  const r = runAStar<never>({
    seeds: [{ id: 'S', gScore: 0 }],
    heuristic: () => 0,
    neighbors: (n) => adj[n].map((e) => ({ to: e.to, weight: e.w })),
    isGoal: (n) => n === 'T',
  })!;
  return { path: reconstructAStarPath(r, 'T').nodes, cost: r.gScore.T };
};

export const sha256 = sha;

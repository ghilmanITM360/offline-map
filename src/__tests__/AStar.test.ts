import * as publicAStar from '@muslim-ummah/offline-navigation';
import * as domainAStar from '../../packages/offline-navigation/src/domain/algorithms/AStar';
import { reconstructAStarPath, runAStar } from '../utils/AStar';
import type { AStarNeighbor, AStarParams, AStarResult, AStarSeed } from '../utils/AStar';

describe('public AStar compatibility facade', () => {
  it('preserves both public/domain function references', () => {
    expect(runAStar).toBe(publicAStar.runAStar);
    expect(runAStar).toBe(domainAStar.runAStar);
    expect(reconstructAStarPath).toBe(publicAStar.reconstructAStarPath);
    expect(reconstructAStarPath).toBe(domainAStar.reconstructAStarPath);
  });

  it('preserves generic edge types, weighted/tied paths, same-node and unreachable results', () => {
    const edge = { label: 'chosen' };
    const graph: Record<string, AStarNeighbor<typeof edge>[]> = {
      s: [{ to: 'a', weight: 1, edge }, { to: 'b', weight: 1, edge }, { to: 't', weight: 9, edge }],
      a: [{ to: 't', weight: 1, edge }],
      b: [{ to: 't', weight: 1, edge }],
      t: [],
    };
    const seeds: AStarSeed[] = [{ id: 's', gScore: 0 }];
    const params: AStarParams<typeof edge> = {
      seeds, heuristic: () => 0, neighbors: id => graph[id] ?? [], isGoal: id => id === 't',
    };
    const result: AStarResult<typeof edge> = runAStar(params)!;
    expect(result.gScore.t).toBe(2);
    expect(reconstructAStarPath(result, 't')).toEqual({ nodes: ['s', 'a', 't'], edges: [edge, edge] });
    expect(result.previousEdge.t).toBe(edge);
    const same = runAStar({ ...params, isGoal: id => id === 's' })!;
    expect(same.gScore.s).toBe(0);
    expect(reconstructAStarPath(same, 's')).toEqual({ nodes: ['s'], edges: [] });
    expect(runAStar({ ...params, isGoal: id => id === 'missing' })).toBeUndefined();
  });
});

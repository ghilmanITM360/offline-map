import { distanceMeters, findNearestGraphNode } from '../data/ijtema/graphBuilder';
import type { GraphNode, GraphNodeType } from '../data/ijtema/graphTypes';

const node = (id: string, offsetM: number, type: GraphNodeType = 'rasta_point'): GraphNode => ({
  id, type, coordinate: { lat: 24.966, lng: 67 + offsetM / 100900 },
  name: { en: id }, developerLabel: id,
});
const nodes = { A: node('A', 0), B: node('B', 18), gate: node('gate', 8, 'gate') };
const snap = findNearestGraphNode;
const allowed: GraphNodeType[] = ['rasta_point'];

describe('graph node snap continuity', () => {
  test('marginal improvement on a parallel corridor retains the known node and actual distance', () => {
    const coordinate = node('fix', 10).coordinate;
    const result = snap(coordinate, nodes, allowed, 'A')!;
    expect(result.node.id).toBe('A');
    expect(result.distanceM).toBeCloseTo(distanceMeters(coordinate, nodes.A.coordinate));
  });
  test('clear corridor improvement releases the previous snap', () => {
    expect(snap(nodes.B.coordinate, nodes, allowed, 'A')?.node.id).toBe('B');
  });
  test.each(['missing', 'gate'])('unknown or disallowed prior %s cannot affect selection', prior => {
    expect(snap(node('fix', 10).coordinate, nodes, allowed, prior)?.node.id).toBe('B');
  });
  test('without history the existing stateless nearest-node contract is unchanged', () => {
    expect(snap(node('fix', 10).coordinate, nodes, allowed)?.node.id).toBe('B');
  });
});

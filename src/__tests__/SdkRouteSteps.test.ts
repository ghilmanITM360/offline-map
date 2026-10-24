import { buildRouteSteps, findBestVenuePath, type VenueDataSource, type VenueEdge, type VenueNode } from '@muslim-ummah/offline-navigation';
import { createSyntheticVenue } from '../../scripts/sdk-headless/syntheticVenue';

const line = (coords: Array<[number, number]>): VenueDataSource => {
  const nodes: Record<string, VenueNode> = {};
  const edges: Record<string, VenueEdge[]> = {};
  coords.forEach(([lat, lng], i) => {
    nodes[`p${i}`] = { id: `p${i}`, coordinate: { lat, lng } };
    edges[`p${i}`] = [];
  });
  coords.forEach((_, i) => {
    if (i === 0) return;
    const d = Math.round(Math.hypot((coords[i][0] - coords[i - 1][0]) * 111_000, (coords[i][1] - coords[i - 1][1]) * 87_000));
    edges[`p${i - 1}`].push({ to: `p${i}`, distanceM: d });
    edges[`p${i}`].push({ to: `p${i - 1}`, distanceM: d });
  });
  return createSyntheticVenue(nodes, edges);
};

describe('buildRouteSteps', () => {
  it('describes a right turn: depart, turn at the corner, arrive', () => {
    const venue = createSyntheticVenue();
    const route = findBestVenuePath(venue.graph, ['n/1'], ['n/3'])!;
    const steps = buildRouteSteps(route, venue.graph);
    expect(steps.map((s) => [s.kind, s.nodeId, s.toNodeId, s.distanceM])).toEqual([
      ['depart', 'n/1', 'n/2', 56],
      ['turn_right', 'n/2', 'n/3', 61],
      ['arrive', 'n/3', 'n/3', 0],
    ]);
  });

  it('describes the reverse walk as a left turn', () => {
    const venue = createSyntheticVenue();
    const route = findBestVenuePath(venue.graph, ['n/3'], ['n/1'])!;
    expect(buildRouteSteps(route, venue.graph).map((s) => s.kind)).toEqual(['depart', 'turn_left', 'arrive']);
  });

  it('merges collinear segments into one step with the summed distance', () => {
    const venue = line([[38.7, -9.14], [38.7005, -9.14], [38.701, -9.14], [38.7015, -9.14]]);
    const route = findBestVenuePath(venue.graph, ['p0'], ['p3'])!;
    const steps = buildRouteSteps(route, venue.graph);
    expect(steps.map((s) => s.kind)).toEqual(['depart', 'arrive']);
    expect(steps[0].distanceM).toBe(route.distanceM);
    expect(steps[0].toNodeId).toBe('p3');
  });

  it('keeps a 25 degree bend straight and a 35 degree bend a turn (host parity: 30 degree threshold)', () => {
    const gentle = line([[38.7, -9.14], [38.7005, -9.14], [38.701, -9.1397]]);
    const gentleRoute = findBestVenuePath(gentle.graph, ['p0'], ['p2'])!;
    expect(buildRouteSteps(gentleRoute, gentle.graph).map((s) => s.kind)).toEqual(['depart', 'arrive']);
    const sharp = line([[38.7, -9.14], [38.7005, -9.14], [38.701, -9.13955]]);
    const sharpRoute = findBestVenuePath(sharp.graph, ['p0'], ['p2'])!;
    expect(buildRouteSteps(sharpRoute, sharp.graph).map((s) => s.kind)).toEqual(['depart', 'turn_right', 'arrive']);
  });

  it('returns just an arrival for a zero-length route', () => {
    const venue = createSyntheticVenue();
    expect(buildRouteSteps({ nodes: ['n/1'], edges: [] }, venue.graph)).toEqual([
      { kind: 'arrive', nodeId: 'n/1', toNodeId: 'n/1', distanceM: 0 },
    ]);
  });

  it('never throws on a node the graph does not know; the bend is treated as straight', () => {
    const venue = createSyntheticVenue();
    const steps = buildRouteSteps({ nodes: ['n/1', 'ghost', 'n/3'], edges: [{ to: 'ghost', distanceM: 10 }, { to: 'n/3', distanceM: 10 }] }, venue.graph);
    expect(steps.map((s) => s.kind)).toEqual(['depart', 'arrive']);
    expect(steps[0].distanceM).toBe(20);
  });
});

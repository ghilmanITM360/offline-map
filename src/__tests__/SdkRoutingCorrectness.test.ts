// Codex independent audit (13f4629): routing-core correctness NAV-03, NAV-04, NAV-05, NAV-06 and NAV-10, plus differential checks against an
// independent Dijkstra. The accepted route goldens are asserted by the test:* scripts; nothing here relaxes them.
import {
  findBestSeededVenuePath, findBestVenuePath, findStreetRouteToTargets, findVenuePath, heuristicScale, parsePackVenueData, reconstructAStarPath,
  runAStar, validateVenueGraph,
  type StreetEdge, type StreetNode, type StreetRoutingGraph, type VenueCoordinate, type VenueEdge, type VenueRoutingGraph,
} from '@muslim-ummah/offline-navigation';

const M = 111_320;
const at = (northM: number, eastM = 0): VenueCoordinate => ({ lat: 10 + northM / M, lng: 20 + eastM / (M * Math.cos((10 * Math.PI) / 180)) });
const graph = (nodes: Record<string, VenueCoordinate>, edges: Record<string, VenueEdge[]>): VenueRoutingGraph => {
  const ids = Object.keys(nodes);
  const table = new Map(ids.map((id) => [id, { id, coordinate: nodes[id] }]));
  const out = new Map(Object.entries(edges));
  return { nodeIds: () => ids, getNode: (id) => table.get(id), edgesFrom: (id) => out.get(id) ?? [] };
};

describe('NAV-03: any opaque node id is an ordinary id', () => {
  const NAMES = ['toString', 'valueOf', 'hasOwnProperty', 'constructor', 'isPrototypeOf', 'propertyIsEnumerable', 'toLocaleString'];

  it.each(NAMES.filter((n) => n !== 'constructor'))('routes from, through and to a node called %s', (name) => {
    const g = graph({ a: at(0), [name]: at(10), z: at(20) }, { a: [{ to: name, distanceM: 10 }], [name]: [{ to: 'z', distanceM: 10 }] });
    expect(validateVenueGraph(g)).toEqual([]);
    expect(findVenuePath(g, name, 'z')).toMatchObject({ nodes: [name, 'z'], costM: 10 });
    expect(findVenuePath(g, 'a', 'z')).toMatchObject({ nodes: ['a', name, 'z'], costM: 20 });
    expect(findVenuePath(g, 'a', name)).toMatchObject({ nodes: ['a', name], costM: 10 });
    expect(findBestVenuePath(g, ['a'], ['z'])?.nodes).toEqual(['a', name, 'z']);
    expect(findBestSeededVenuePath(g, [{ id: name, gScore: 0 }], ['z'])?.route.nodes).toEqual([name, 'z']);
  });

  it('the search itself treats __proto__ and constructor as plain ids', () => {
    const edges: Record<string, Array<{ to: string; weight: number }>> = Object.create(null);
    edges.__proto__ = [{ to: 'constructor', weight: 2 }];
    edges.constructor = [{ to: 'end', weight: 3 }];
    edges.end = [];
    const result = runAStar({
      seeds: [{ id: '__proto__', gScore: 0 }], heuristic: () => 0, neighbors: (id) => edges[id] ?? [], isGoal: (id) => id === 'end',
    });
    expect(result?.gScore.end).toBe(5);
    expect(reconstructAStarPath(result!, 'end').nodes).toEqual(['__proto__', 'constructor', 'end']);
  });

  it('a parsed pack that names a node toString is routable', () => {
    const graphText = JSON.stringify({
      schemaVersion: 1, venueId: 'v', dataVersion: '1',
      nodes: [{ id: 'toString', lat: 10, lng: 20 }, { id: 'valueOf', lat: 10.0001, lng: 20 }, { id: 'end', lat: 10.0002, lng: 20 }],
      edges: [{ from: 'toString', to: 'valueOf', distanceM: 11 }, { from: 'valueOf', to: 'end', distanceM: 11 }],
    });
    const placesText = JSON.stringify({ schemaVersion: 1, venueId: 'v', places: [{ id: 'p1', kind: 'gate', nodeIds: ['toString'] }, { id: 'p2', kind: 'gate', nodeIds: ['end'] }] });
    const loaded = parsePackVenueData(graphText, placesText, 'v');
    if (!loaded.ok) throw new Error(loaded.error.message);
    expect(findVenuePath(loaded.source.graph, 'toString', 'end')).toMatchObject({ nodes: ['toString', 'valueOf', 'end'], costM: 22 });
  });
});

describe('NAV-04: the cheapest accepted weighted route wins even when the discount beats the straight line', () => {
  it('holds for a parsed pack, whose parser accepts any positive multiplier (the audited pack reproducer)', () => {
    const loaded = parsePackVenueData(
      JSON.stringify({
        schemaVersion: 1, venueId: 'v', dataVersion: '1',
        nodes: [{ id: 's', lat: 10, lng: 20 }, { id: 'a', lat: 10.009, lng: 20 }, { id: 'g', lat: 10.0009, lng: 20 }],
        edges: [
          { from: 's', to: 'g', distanceM: 101 },
          { from: 's', to: 'a', distanceM: 1000, weightMultiplier: 0.01 },
          { from: 'a', to: 'g', distanceM: 900, weightMultiplier: 0.01 },
        ],
      }),
      JSON.stringify({ schemaVersion: 1, venueId: 'v', places: [{ id: 'p', kind: 'gate', nodeIds: ['g'] }] }),
      'v',
    );
    if (!loaded.ok) throw new Error(loaded.error.message);
    expect(findVenuePath(loaded.source.graph, 's', 'g')).toMatchObject({ nodes: ['s', 'a', 'g'], costM: 19 });
  });

  const discounted = () => graph(
    { s: at(0), a: at(1000), g: at(100) },
    { s: [{ to: 'g', distanceM: 100 }, { to: 'a', distanceM: 1000, weightMultiplier: 0.01 }], a: [{ to: 'g', distanceM: 900, weightMultiplier: 0.01 }] },
  );

  it('chooses cost 19 over the direct 100 (the audited reproducer)', () => {
    const g = discounted();
    expect(validateVenueGraph(g)).toEqual([]);
    expect(findBestVenuePath(g, ['s'], ['g'])).toMatchObject({ costM: 19, nodes: ['s', 'a', 'g'] });
    expect(findVenuePath(g, 's', 'g')).toMatchObject({ costM: 19 });
    expect(findBestSeededVenuePath(g, [{ id: 's', gScore: 0 }], ['g'])?.route.costM).toBe(19);
  });

  it('uses the plain straight-line estimate (scale 1) when no edge is cheaper than its length, and a smaller scale otherwise', () => {
    const plain = graph({ a: at(0), b: at(10) }, { a: [{ to: 'b', distanceM: 10.5 }] });
    expect(heuristicScale(plain)).toBe(1);
    const g = discounted();
    const scale = heuristicScale(g);
    expect(scale).toBeLessThan(0.02);
    expect(scale).toBeGreaterThan(0);
  });

  it('a zero-cost edge or an edge into an unknown node degrades to plain Dijkstra instead of a wrong bound', () => {
    expect(heuristicScale(graph({ a: at(0), b: at(50) }, { a: [{ to: 'b', distanceM: 50, weightMultiplier: 0 }] }))).toBe(0);
    expect(heuristicScale(graph({ a: at(0) }, { a: [{ to: 'ghost', distanceM: 5 }] }))).toBe(0);
  });

  it('matches an independent Dijkstra on 300 random graphs with discounts, penalties and zero weights', () => {
    let seed = 7;
    const rand = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
    let compared = 0;
    for (let round = 0; round < 300; round += 1) {
      const n = 3 + Math.floor(rand() * 12);
      const ids = Array.from({ length: n }, (_, i) => `n${i}`);
      const nodes: Record<string, VenueCoordinate> = {};
      ids.forEach((id) => { nodes[id] = at(rand() * 400, rand() * 400); });
      const edges: Record<string, VenueEdge[]> = {};
      for (const id of ids) edges[id] = [];
      for (let k = 0; k < n * 3; k += 1) {
        const from = ids[Math.floor(rand() * n)];
        const to = ids[Math.floor(rand() * n)];
        const multiplier = [0.02, 0.3, 0.9, 1, 1, 2, 5, 0][Math.floor(rand() * 8)];
        edges[from].push({ to, distanceM: Math.round(rand() * 300), weightMultiplier: multiplier });
      }
      const g = graph(nodes, edges);
      const dist: Record<string, number> = Object.fromEntries(ids.map((id) => [id, Infinity]));
      const start = ids[0];
      dist[start] = 0;
      const done = new Set<string>();
      for (;;) {
        const next = ids.filter((id) => !done.has(id) && dist[id] < Infinity).sort((a, b) => dist[a] - dist[b])[0];
        if (next === undefined) break;
        done.add(next);
        for (const e of edges[next]) dist[e.to] = Math.min(dist[e.to], dist[next] + e.distanceM * (e.weightMultiplier ?? 1));
      }
      for (const goal of ids.slice(1)) {
        const route = findVenuePath(g, start, goal);
        if (dist[goal] === Infinity) expect(route).toBeUndefined();
        else { expect(route?.costM).toBeCloseTo(dist[goal], 7); compared += 1; }
      }
    }
    expect(compared).toBeGreaterThan(500);
  });
});

describe('NAV-05: an admissible but inconsistent estimate still returns the optimum', () => {
  it('reopens a closed node whose cost improves (the audited reproducer: 3.5, not 4)', () => {
    const edges: Record<string, Array<{ to: string; weight: number }>> = {
      s: [{ to: 'a', weight: 2 }, { to: 'b', weight: 1 }], b: [{ to: 'a', weight: 0.5 }], a: [{ to: 'g', weight: 2 }], g: [],
    };
    const h: Record<string, number> = { s: 3.5, a: 0, b: 2.5, g: 0 };
    const out = runAStar({ seeds: [{ id: 's', gScore: 0 }], neighbors: (id) => edges[id], heuristic: (id) => h[id], isGoal: (id) => id === 'g' });
    expect(out?.gScore.g).toBe(3.5);
    expect(reconstructAStarPath(out!, 'g').nodes).toEqual(['s', 'b', 'a', 'g']);
  });

  it('agrees with Dijkstra on 400 random graphs under random admissible (inconsistent) estimates, and is deterministic', () => {
    let seed = 99;
    const rand = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
    for (let round = 0; round < 400; round += 1) {
      const n = 2 + Math.floor(rand() * 14);
      const edges: Record<string, Array<{ to: string; weight: number }>> = {};
      for (let i = 0; i < n; i += 1) edges[`n${i}`] = [];
      for (let k = 0; k < n * 3; k += 1) edges[`n${Math.floor(rand() * n)}`].push({ to: `n${Math.floor(rand() * n)}`, weight: Math.floor(rand() * 8) });
      const goal = `n${n - 1}`;
      const exact = (from: string): number => runAStar({ seeds: [{ id: from, gScore: 0 }], neighbors: (id) => edges[id], heuristic: () => 0, isGoal: (id) => id === goal })?.gScore[goal] ?? Infinity;
      const fractions = Object.fromEntries(Object.keys(edges).map((id) => [id, rand()]));
      const h = (id: string): number => { const d = exact(id); return d === Infinity ? 0 : d * fractions[id]; };
      const run = () => runAStar({ seeds: [{ id: 'n0', gScore: 0 }], neighbors: (id) => edges[id], heuristic: h, isGoal: (id) => id === goal });
      const a = run();
      expect(a?.gScore[goal]).toBe(exact('n0') === Infinity ? undefined : exact('n0'));
      expect(JSON.stringify(run()?.previousNode)).toBe(JSON.stringify(a?.previousNode));
    }
  });

  it('ignores an edge with a negative or non-finite weight instead of looping on it', () => {
    const edges: Record<string, Array<{ to: string; weight: number }>> = {
      a: [{ to: 'b', weight: -1 }, { to: 'c', weight: NaN }, { to: 'g', weight: 5 }], b: [{ to: 'a', weight: -1 }], c: [], g: [],
    };
    const out = runAStar({ seeds: [{ id: 'a', gScore: 0 }], neighbors: (id) => edges[id], heuristic: () => 0, isGoal: (id) => id === 'g' });
    expect(out?.gScore.g).toBe(5);
  });
});

describe('NAV-06: duplicate seed ids use one initial cost', () => {
  const g = graph({ a: at(0), b: at(100), c: at(200) }, { a: [{ to: 'b', distanceM: 100 }], b: [{ to: 'c', distanceM: 100 }] });

  it.each([
    ['dearer first', [{ id: 'a', gScore: 1000 }, { id: 'a', gScore: 0 }]],
    ['cheaper first', [{ id: 'a', gScore: 0 }, { id: 'a', gScore: 1000 }]],
    ['three copies', [{ id: 'a', gScore: 500 }, { id: 'a', gScore: 0 }, { id: 'a', gScore: 1000 }]],
  ])('%s: the route cost is the edges only, never negative', (_n, seeds) => {
    const found = findBestSeededVenuePath(g, seeds, ['c']);
    expect(found?.route.costM).toBe(200);
    expect(found?.seedId).toBe('a');
    expect(found!.route.costM).toBeGreaterThanOrEqual(0);
  });

  it('distinct seeds still compete on their initial cost, and ties keep the earlier seed', () => {
    expect(findBestSeededVenuePath(g, [{ id: 'a', gScore: 50 }, { id: 'b', gScore: 0 }], ['c'])).toMatchObject({ seedId: 'b', route: { costM: 100 } });
    expect(findBestSeededVenuePath(g, [{ id: 'a', gScore: 0 }, { id: 'b', gScore: 150 }], ['c'])).toMatchObject({ seedId: 'a', route: { costM: 200 } });
  });
});

describe('NAV-10: targets that share a street connector keep their own identity and cost', () => {
  const streetNodes: StreetNode[] = [{ id: 'n0', lat: 10, lng: 20 }, { id: 'n1', ...at(100) }, { id: 'n2', ...at(200) }];
  const street = (connectors: Record<string, { nodeId: string; distanceM: number }>): StreetRoutingGraph => ({
    getNode: (id) => streetNodes.find((n) => n.id === id),
    edgesFrom: (id): readonly StreetEdge[] => (id === 'n0' ? [{ to: 'n1', distanceM: 100 }] : id === 'n1' ? [{ to: 'n2', distanceM: 100 }] : []),
    nearestNode: () => ({ node: streetNodes[0], distanceM: 0 }),
    connectorFor: (id) => connectors[id],
    covers: () => true,
  });
  const target = (id: string, extra: number[] = []) => ({ id, coordinate: at(300), extraCostsM: extra });

  it.each([
    ['expensive listed first', ['exp', 'cheap']],
    ['cheap listed first', ['cheap', 'exp']],
  ])('%s: the cheaper target wins and its cost, not the other one, is charged', (_n, order) => {
    const g = street({ exp: { nodeId: 'n2', distanceM: 50 }, cheap: { nodeId: 'n2', distanceM: 5 } });
    const targets = order.map((id) => (id === 'exp' ? target('exp', [100]) : target('cheap', [2])));
    const route = findStreetRouteToTargets(g, { lat: 10, lng: 20 }, targets, 3);
    expect(route?.targetId).toBe('cheap');
    expect(route?.totalDistanceM).toBe(200 + 5);
  });

  it('a dearer shared target never beats a cheaper target elsewhere, and equal costs keep the earlier target', () => {
    const g = street({ a: { nodeId: 'n2', distanceM: 10 }, b: { nodeId: 'n2', distanceM: 10 }, c: { nodeId: 'n1', distanceM: 5 } });
    expect(findStreetRouteToTargets(g, { lat: 10, lng: 20 }, [target('a'), target('b')], 3)?.targetId).toBe('a');
    expect(findStreetRouteToTargets(g, { lat: 10, lng: 20 }, [target('b'), target('a')], 3)?.targetId).toBe('b');
    expect(findStreetRouteToTargets(g, { lat: 10, lng: 20 }, [target('a', [500]), target('c')], 3)?.targetId).toBe('c');
  });
});

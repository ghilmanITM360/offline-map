// B3a gate: venue contract + Ijtema adapter. Golden fixture is read-only; never rewritten here.
import { strict as assert } from 'node:assert';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { IJTEMA_NAVIGATION_GRAPH_V2 as G, IJTEMA_BLOCKS, IJTEMA_GATES } from '../src/data/ijtema';
import { IJTEMA_VENUE_SOURCE as V, createIjtemaVenueSource } from '../src/data/ijtema/venueAdapter';
import { findBestSeededVenuePath, findBestVenuePath, findVenuePath, validateVenueGraph } from '../packages/offline-navigation/src/domain/venue';
import { sha256 } from './astar-golden-lib';
import { createSyntheticVenue, SYNTH_EDGES, SYNTH_NODES } from './sdk-headless/syntheticVenue';

const golden = JSON.parse(readFileSync('scripts/fixtures/astar-golden-baseline.json', 'utf8'));
let n = 0;
const ok = (name: string) => { n++; console.log(`  ok - ${name}`); };

// ---- Ijtema: route parity over every ordered node pair, through the contract (same hashes as the B2a golden) ----
{
  const ids = [...V.graph.nodeIds()].sort();
  const lines: string[] = [];
  const costs: string[] = [];
  let routable = 0, unreachable = 0;
  for (const s of ids) for (const t of ids) {
    if (s === t) continue;
    const p = findVenuePath(V.graph, s, t);
    if (!p) { unreachable++; lines.push(`${s}>${t}|UNREACHABLE`); costs.push(`${s}>${t}|UNREACHABLE`); continue; }
    routable++;
    lines.push(`${s}>${t}|${p.costM}|${p.nodes.join(',')}`);
    costs.push(`${s}>${t}|${p.costM}`);
  }
  assert.equal(ids.length, golden.nodeCount);
  assert.equal(routable, golden.routableCount);
  assert.equal(unreachable, golden.unreachableCount);
  assert.equal(sha256(lines.join('\n')), golden.pathHash, 'path hash drifted from B2a golden');
  assert.equal(sha256(costs.join('\n')), golden.costHash, 'cost hash drifted from B2a golden');
  ok(`Ijtema parity: ${ids.length} nodes, ${routable} routable + ${unreachable} unreachable pairs, path/cost hashes == golden`);
}

// ---- Ijtema adapter: read-only view, no copied data, current IDs preserved ----
{
  assert.equal(V.venueId, 'karachi-ijtema');
  assert.equal(V.dataVersion, G.metadata.version);
  for (const id of Object.keys(G.nodes)) {
    assert.equal(V.graph.getNode(id), G.nodes[id], 'node must be the original object, not a copy');
    assert.equal(V.graph.edgesFrom(id), G.adjacency[id], 'edges must be the original array, not a copy');
  }
  assert.equal(V.graph.nodeIds().length, 303);
  assert.equal(Object.values(G.adjacency).reduce((a, b) => a + b.length, 0), 686);
  assert.deepEqual(validateVenueGraph(V.graph), [], 'valid Ijtema data must pass validation unchanged');
  assert.equal(V.placeIds().filter((id) => V.getPlace(id)!.kind === 'gate').length, IJTEMA_GATES.length);
  assert.equal(V.placeIds().filter((id) => V.getPlace(id)!.kind === 'block').length, IJTEMA_BLOCKS.length);
  assert.deepEqual(V.getPlace('B10')!.nodeIds, ['B10_C1', 'B10_C2', 'B10_C3', 'B10_C4']);
  assert.deepEqual(V.getPlace('GATE_01')!.nodeIds, ['GATE_01']);
  assert.equal(V.getPlace('GATE_06'), undefined); // not a gate in the dataset; nothing invented
  for (const bad of ['__proto__', 'constructor', 'toString', 'hasOwnProperty']) {
    assert.equal(V.graph.getNode(bad), undefined);
    assert.deepEqual(V.graph.edgesFrom(bad), []);
    assert.equal(V.getPlace(bad), undefined);
  }
  assert.equal(createIjtemaVenueSource().placeIds().length, V.placeIds().length);
  ok('Ijtema adapter: identity-preserving, 303 nodes / 686 directed edges, 18 gate + 42 block places, prototype-safe');
}

// ---- Synthetic venue (test-only) ----
{
  const before = JSON.stringify({ SYNTH_NODES, SYNTH_EDGES });
  const v = createSyntheticVenue();
  assert.notEqual(v.venueId, V.venueId);
  assert.equal(v.graph.nodeIds().filter((id) => V.graph.getNode(id)).length, 0, 'synthetic IDs must not collide with Ijtema');
  assert.deepEqual(validateVenueGraph(v.graph), []);
  assert.deepEqual(findVenuePath(v.graph, 'n/1', 'n/3')!.nodes, ['n/1', 'n/2', 'n/3']); // cheaper than the x3 edge
  assert.equal(findVenuePath(v.graph, 'n/1', 'n/4')!.costM, 56 + 61 + 56); // 183 direct loses to 173 via n/3
  assert.equal(findVenuePath(v.graph, 'n/5', 'n/3'), undefined);
  assert.equal(findVenuePath(v.graph, 'n/1', 'island'), undefined);
  assert.equal(JSON.stringify({ SYNTH_NODES, SYNTH_EDGES }), before, 'routing must not mutate the venue graph');
  const frozen = createSyntheticVenue(
    Object.freeze(Object.fromEntries(Object.entries(SYNTH_NODES).map(([k, x]) => [k, Object.freeze(x)]))),
    Object.freeze(Object.fromEntries(Object.entries(SYNTH_EDGES).map(([k, x]) => [k, Object.freeze(x.map((e) => Object.freeze(e)))]))) as typeof SYNTH_EDGES,
  );
  assert.ok(findVenuePath(frozen.graph, 'n/1', 'n/5'), 'routing must work on deeply frozen input');
  ok('synthetic venue: independent IDs/topology, valid + unreachable + one-way, no mutation (also on frozen input)');
}

// ---- B3b: the service-level search RoutingServiceV2 runs, on Ijtema: all ordered pairs == B2a golden ----
{
  const ids = [...V.graph.nodeIds()].sort();
  for (const [label, route] of [
    ['findBestVenuePath', (s: string, t: string) => findBestVenuePath(V.graph, [s], [t])],
    ['findBestSeededVenuePath', (s: string, t: string) => findBestSeededVenuePath(V.graph, [{ id: s, gScore: 0 }], [t])?.route],
  ] as const) {
    const lines: string[] = [];
    const costs: string[] = [];
    let routable = 0;
    for (const s of ids) for (const t of ids) {
      if (s === t) continue;
      const p = route(s, t);
      if (!p) { lines.push(`${s}>${t}|UNREACHABLE`); costs.push(`${s}>${t}|UNREACHABLE`); continue; }
      routable++;
      assert.equal(p.distanceM, p.edges.reduce((a, e) => a + e.distanceM, 0));
      lines.push(`${s}>${t}|${p.costM}|${p.nodes.join(',')}`);
      costs.push(`${s}>${t}|${p.costM}`);
    }
    assert.equal(routable, golden.routableCount, label);
    assert.equal(lines.length, golden.routableCount + golden.unreachableCount, label);
    assert.equal(sha256(lines.join('\n')), golden.pathHash, `${label}: path hash drifted from B2a golden`);
    assert.equal(sha256(costs.join('\n')), golden.costHash, `${label}: cost hash drifted from B2a golden`);
  }
  ok(`service search parity: findBestVenuePath + findBestSeededVenuePath over ${golden.routableCount + golden.unreachableCount} pairs == golden`);
}

// ---- B3b: service-level search on synthetic venues (isolation, direction, weights, seeds, no Ijtema fallback) ----
{
  const before = JSON.stringify({ SYNTH_NODES, SYNTH_EDGES });
  const a = createSyntheticVenue();
  // Same IDs, different weights: the x3 penalty on n/1->n/4 is gone, so the direct edge now wins.
  const b = createSyntheticVenue(SYNTH_NODES, { ...SYNTH_EDGES, 'n/1': [{ to: 'n/2', distanceM: 56 }, { to: 'n/4', distanceM: 61 }] });
  for (let i = 0; i < 3; i++) { // interleaved: no state carried between instances or calls
    const ra = findBestVenuePath(a.graph, ['n/1'], ['n/4'])!;
    const rb = findBestVenuePath(b.graph, ['n/1'], ['n/4'])!;
    assert.deepEqual([ra.nodes, ra.costM, ra.distanceM], [['n/1', 'n/2', 'n/3', 'n/4'], 173, 173]);
    assert.deepEqual([rb.nodes, rb.costM, rb.distanceM], [['n/1', 'n/4'], 61, 61]);
  }
  const weighted = findBestVenuePath(createSyntheticVenue(SYNTH_NODES, { ...SYNTH_EDGES, 'n/1': [{ to: 'n/4', distanceM: 61, weightMultiplier: 3 }] }).graph, ['n/1'], ['n/4'])!;
  assert.deepEqual([weighted.costM, weighted.distanceM], [183, 61], 'costM is weighted, distanceM is raw');
  assert.equal(findBestVenuePath(a.graph, ['n/5'], ['n/3']), undefined, 'one-way edge must not be walked backwards');
  assert.ok(findBestVenuePath(a.graph, ['n/3'], ['n/5']));
  assert.equal(findBestVenuePath(a.graph, ['n/1'], ['island']), undefined);
  assert.equal(findBestVenuePath(a.graph, [], ['n/1']), undefined);
  assert.deepEqual(findBestVenuePath(a.graph, ['n/1'], ['n/1']), { nodes: ['n/1'], edges: [], distanceM: 0, costM: 0 });
  // Place-based candidates: annex = [n/5, n/3]; n/3 (117) beats n/5 (237).
  assert.deepEqual(findBestVenuePath(a.graph, a.getPlace('lobby')!.nodeIds, a.getPlace('annex')!.nodeIds)!.nodes, ['n/1', 'n/2', 'n/3']);
  // Equal cost across candidate goals: the earlier goal wins (start-major, strict <).
  const tie = createSyntheticVenue(SYNTH_NODES, { 'n/1': [{ to: 'n/2', distanceM: 10 }, { to: 'n/4', distanceM: 10 }] });
  assert.deepEqual(findBestVenuePath(tie.graph, ['n/1'], ['n/4', 'n/2'])!.nodes, ['n/1', 'n/4']);
  assert.deepEqual(findBestVenuePath(tie.graph, ['n/1'], ['n/2', 'n/4'])!.nodes, ['n/1', 'n/2']);
  // Seeded (outside-gate style): seed cost decides the winner; route cost excludes it.
  const s1 = findBestSeededVenuePath(a.graph, [{ id: 'n/1', gScore: 100 }, { id: 'n/4', gScore: 0 }], ['n/3'])!;
  assert.deepEqual([s1.seedId, s1.route.nodes, s1.route.costM], ['n/4', ['n/4', 'n/3'], 56]);
  const s2 = findBestSeededVenuePath(a.graph, [{ id: 'n/1', gScore: 100 }, { id: 'n/4', gScore: 200 }], ['n/3'])!;
  assert.deepEqual([s2.seedId, s2.route.nodes, s2.route.costM], ['n/1', ['n/1', 'n/2', 'n/3'], 117]);
  assert.equal(findBestSeededVenuePath(a.graph, [{ id: 'n/5', gScore: 0 }], ['n/3']), undefined);
  assert.equal(findBestSeededVenuePath(a.graph, [], ['n/3']), undefined);
  // Ijtema node IDs in a foreign graph: a fallback to Ijtema data would route GATE_01 -> B10_C1 its own way
  // (and backwards too, Ijtema edges are bidirectional). The injected graph has one direct one-way 7 m edge.
  assert.ok(findVenuePath(V.graph, 'B10_C1', 'GATE_01'), 'precondition: reachable in Ijtema');
  const decoy = createSyntheticVenue(
    { GATE_01: { id: 'GATE_01', coordinate: { lat: 1, lng: 1 } }, B10_C1: { id: 'B10_C1', coordinate: { lat: 1, lng: 1.0001 } } },
    { GATE_01: [{ to: 'B10_C1', distanceM: 7 }] },
  );
  assert.deepEqual(findBestVenuePath(decoy.graph, ['GATE_01'], ['B10_C1'])!.costM, 7);
  assert.equal(findBestVenuePath(decoy.graph, ['B10_C1'], ['GATE_01']), undefined);
  assert.equal(findBestSeededVenuePath(decoy.graph, [{ id: 'B10_C1', gScore: 0 }], ['GATE_01']), undefined);
  const deepFreeze = <T>(o: T): T => { Object.values(o as object).forEach((v) => typeof v === 'object' && v && deepFreeze(v)); return Object.freeze(o); };
  const frozen = createSyntheticVenue(deepFreeze(structuredClone(SYNTH_NODES)), deepFreeze(structuredClone(SYNTH_EDGES)));
  assert.equal(findBestVenuePath(frozen.graph, ['n/1'], ['n/5'])!.costM, 56 + 61 + 120);
  assert.equal(findBestSeededVenuePath(frozen.graph, [{ id: 'n/1', gScore: 0 }], ['n/5'])!.route.costM, 56 + 61 + 120);
  assert.equal(JSON.stringify({ SYNTH_NODES, SYNTH_EDGES }), before, 'routing must not mutate the venue graph');
  ok('service search on synthetic venues: isolated instances, interleaving, direction, weights, ties, seeds, no Ijtema fallback, frozen input');
}

// ---- B3b: RoutingServiceV2 routes through the injected graph, not the Ijtema graph record ----
{
  const src = readFileSync('src/services/RoutingServiceV2.ts', 'utf8');
  assert.ok(!src.includes('IJTEMA_NAVIGATION_GRAPH_V2'), 'RoutingServiceV2 must not read the Ijtema graph record directly');
  assert.ok(!/\brunAStar\b/.test(src), 'RoutingServiceV2 must not run its own search');
  assert.ok(/findBestVenuePath\(venueGraph,/.test(src) && /findBestSeededVenuePath\(\s*venueGraph,/.test(src), 'search must take the injected graph');
  ok('static: RoutingServiceV2 has no direct Ijtema graph reads and searches via the injected graph');
}

// ---- Validation hazards (inherited from B2a) ----
{
  const node = (id: string, lat = 1, lng = 1) => ({ id, coordinate: { lat, lng } });
  const mk = (ids: string[], nodes: Record<string, any>, edges: Record<string, any[]>) => ({
    nodeIds: () => ids,
    getNode: (id: string) => (Object.prototype.hasOwnProperty.call(nodes, id) ? nodes[id] : undefined),
    edgesFrom: (id: string) => (Object.prototype.hasOwnProperty.call(edges, id) ? edges[id] : []),
  });
  const has = (g: ReturnType<typeof mk>, re: RegExp) => assert.ok(validateVenueGraph(g).some((p) => re.test(p)), String(re));
  has(mk(['__proto__'], { ['__proto__']: node('x') }, {}), /reserved/);
  has(mk(['a', 'a'], { a: node('a') }, {}), /duplicate/);
  has(mk(['a'], { a: node('a', 91) }, {}), /invalid coordinate/);
  has(mk(['a'], { a: node('a', NaN) }, {}), /invalid coordinate/);
  has(mk(['a', 'b'], { a: node('a'), b: node('b') }, { a: [{ to: 'b', distanceM: NaN }] }), /bad distance/);
  has(mk(['a', 'b'], { a: node('a'), b: node('b') }, { a: [{ to: 'b', distanceM: -1 }] }), /bad distance/);
  has(mk(['a', 'b'], { a: node('a'), b: node('b') }, { a: [{ to: 'b', distanceM: 1, weightMultiplier: Infinity }] }), /bad multiplier/);
  has(mk(['a'], { a: node('a') }, { a: [{ to: 'ghost', distanceM: 1 }] }), /missing node/);
  ok('validation: reserved/duplicate IDs, invalid coords, NaN/negative/infinite weights, dangling refs');
}

// ---- Static: generic contract carries no Ijtema/app knowledge ----
{
  const dir = 'packages/offline-navigation/src/domain/venue';
  for (const f of readdirSync(dir)) {
    const src = readFileSync(join(dir, f), 'utf8');
    for (const [, spec] of src.matchAll(/from\s+'([^']+)'/g)) assert.ok(spec.startsWith('.') && !spec.includes('ijtema'), `${f}: import ${spec}`);
    assert.ok(!/ijtema|GATE_\d|\bB\d+_C\d|\breact\b|\bexpo\b|zustand|process\.env/i.test(src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')), `${f}: venue-specific token`);
  }
  ok('static: venue contract has relative imports only and no Ijtema/GATE_/Bxx_Cn/RN/env tokens');
}
console.log(`venue-contract: PASS (${n} groups)`);

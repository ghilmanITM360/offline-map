// B3a gate: venue contract + Ijtema adapter. Golden fixture is read-only; never rewritten here.
import { strict as assert } from 'node:assert';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { IJTEMA_NAVIGATION_GRAPH_V2 as G, IJTEMA_BLOCKS, IJTEMA_GATES } from '../src/data/ijtema';
import { IJTEMA_VENUE_SOURCE as V, createIjtemaVenueSource } from '../src/data/ijtema/venueAdapter';
import { findVenuePath, validateVenueGraph } from '../packages/offline-navigation/src/domain/venue';
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

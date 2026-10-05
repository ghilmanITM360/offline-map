// #133: every maintenance check must (a) pass on the committed data and (b) actually fail on a broken input.
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { IJTEMA_GATES } from '../src/data/ijtema/gates';
import { IJTEMA_BLOCKS } from '../src/data/ijtema/blocks';
import { IJTEMA_SPECIAL_ROUTES } from '../src/data/ijtema/specialRoutes';
import { IJTEMA_STREET_GRAPH_DATA } from '../src/data/ijtema/streetGraph';
import { IJTEMA_NAVIGATION_GRAPH_V2, IJTEMA_NAVIGATION_GRAPH_V2_REPORT } from '../src/data/ijtema/navigationGraph';
import {
  MANIFEST_PATH, buildManifest, checkCategories, checkManifest, checkNearDuplicates, checkSpecialRoutes,
  checkStreetGraph, checkStreetReachability, checkVenueReachability, sha256, validateAll, Manifest,
} from './venue-data-maintenance';

const root = process.cwd();
const none = { gates: [], blocks: [], rastas: [], specialRoutes: [], centralPoints: [] };
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));
const checks = (f: { check: string }[]) => f.map((x) => x.check);

// Committed data is clean.
assert.deepEqual(validateAll(root), [], 'committed venue data, artifact and manifest must pass data:check');

// Categories.
assert.deepEqual(checkCategories({ ...none, gates: IJTEMA_GATES }), []);
assert.deepEqual(checks(checkCategories({ ...none, gates: [{ ...IJTEMA_GATES[0], category: 'tent' } as never] })), ['category']);
assert.deepEqual(checks(checkCategories({ ...none, blocks: [{ ...IJTEMA_BLOCKS[0], id: 'X9' } as never] })), ['category']);

// Near duplicates: undocumented pair fails, documented pair passes.
const a = { ...IJTEMA_GATES[0], id: 'GATE_91', coordinate: { lat: 24.97, lng: 67.0 } } as never;
const b = { ...IJTEMA_GATES[0], id: 'GATE_92', coordinate: { lat: 24.97, lng: 67.0000001 } } as never;
assert.deepEqual(checks(checkNearDuplicates({ gates: [a, b], blocks: [], centralPoints: [] }, [])), ['near-duplicate']);
assert.deepEqual(checkNearDuplicates({ gates: [a, b], blocks: [], centralPoints: [] },
  [{ id: 'X', severity: 'info', category: 'near_duplicate', affectedIds: ['GATE_91', 'GATE_92'], summary: '', resolution: '' }]), []);

// Special route references.
assert.deepEqual(checkSpecialRoutes(IJTEMA_SPECIAL_ROUTES), []);
const badRoute = clone(IJTEMA_SPECIAL_ROUTES[0]);
badRoute.points[1].sequence = badRoute.points[0].sequence;
badRoute.points[1].id = badRoute.points[0].id;
assert.deepEqual(new Set(checks(checkSpecialRoutes([badRoute]))), new Set(['route-reference']));
assert(checkSpecialRoutes([badRoute]).length >= 2, 'duplicate id and non-increasing sequence are both reported');

// Street graph structure: dangling edge, count mismatch, bad connector.
const gateIds = IJTEMA_GATES.map((g) => g.id);
assert.deepEqual(checkStreetGraph(IJTEMA_STREET_GRAPH_DATA, gateIds), []);
const dangling = clone(IJTEMA_STREET_GRAPH_DATA);
dangling.edgeTo[3] = dangling.nodeLat.length + 5;
assert(checkStreetGraph(dangling, gateIds).some((f) => /missing node/.test(f.message)), 'dangling edge');
const counts = clone(IJTEMA_STREET_GRAPH_DATA);
counts.metadata.simplifiedNodeCount += 1;
assert(checkStreetGraph(counts, gateIds).some((f) => /simplifiedNodeCount/.test(f.message)), 'metadata count drift');
const nan = clone(IJTEMA_STREET_GRAPH_DATA);
nan.nodeLat[0] = NaN as never;
assert(checkStreetGraph(nan, gateIds).some((f) => /non-finite/.test(f.message)), 'non-finite node');
const connector = clone(IJTEMA_STREET_GRAPH_DATA);
connector.gateConnectorGateIds[0] = 'GATE_NOPE';
assert(checkStreetGraph(connector, gateIds).some((f) => /unknown gate/.test(f.message)), 'connector for unknown gate');

// Reachability: an isolated connector node is rejected.
const routable = IJTEMA_GATES.filter((g) => g.routingStatus === 'routable').map((g) => g.id);
assert.deepEqual(checkStreetReachability(IJTEMA_STREET_GRAPH_DATA, routable), []);
const isolated = clone(IJTEMA_STREET_GRAPH_DATA);
isolated.nodeLat.push(24.9); isolated.nodeLng.push(67.0);
isolated.gateConnectorNodeIndex[isolated.gateConnectorGateIds.indexOf(routable[0])] = isolated.nodeLat.length - 1;
assert(checkStreetReachability(isolated, routable).some((f) => f.message.includes(routable[0])), 'isolated street connector');
assert.deepEqual(checkVenueReachability(IJTEMA_NAVIGATION_GRAPH_V2, IJTEMA_NAVIGATION_GRAPH_V2_REPORT, IJTEMA_GATES, IJTEMA_BLOCKS), []);
const brokenReport = clone(IJTEMA_NAVIGATION_GRAPH_V2_REPORT);
brokenReport.blockEntryConnectors.filter((c) => c.blockId === 'B1').forEach((c) => { c.connected = false; });
assert(checkVenueReachability(IJTEMA_NAVIGATION_GRAPH_V2, brokenReport, IJTEMA_GATES, IJTEMA_BLOCKS).some((f) => f.message.includes('B1')), 'block without connected entry');

// Manifest: deterministic, CRLF-stable, drift and provenance enforced.
const committed = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) as Manifest;
assert.equal(JSON.stringify(buildManifest(root, committed.provenance)), JSON.stringify(buildManifest(root, committed.provenance)), 'manifest build is deterministic');
assert.equal(sha256('a\r\nb'), sha256('a\nb'), 'hash ignores CRLF checkouts');
const drift = clone(committed);
drift.files['src/data/ijtema/gates.ts'] = '0'.repeat(64);
assert(checkManifest(root, drift).some((f) => f.check === 'drift' && /gates\.ts/.test(f.message)), 'edited source without manifest regeneration');
const noProv = clone(committed);
noProv.provenance.editor = '';
assert(checkManifest(root, noProv).some((f) => f.check === 'provenance'), 'missing provenance');
assert.deepEqual(checkManifest(root, committed), []);

console.log('Venue data maintenance checks passed.');

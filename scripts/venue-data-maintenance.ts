// #133: deterministic, reviewable venue-data maintenance. Runbook: docs/OFFLINE_MAP_AND_DATA.md.
//   npm run data:check     validate sources + generated artifact + manifest (read-only; also part of `npm test`)
//   npm run data:manifest  rewrite src/data/ijtema/DATA_MANIFEST.json (machine fields only), then review the diff
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { IJTEMA_GATES } from '../src/data/ijtema/gates';
import { IJTEMA_BLOCKS } from '../src/data/ijtema/blocks';
import { IJTEMA_RASTAS } from '../src/data/ijtema/rastas';
import { IJTEMA_SPECIAL_ROUTES } from '../src/data/ijtema/specialRoutes';
import { IJTEMA_CENTRAL_POINTS } from '../src/data/ijtema/centralPoints';
import { DATA_ISSUES as IJTEMA_DATA_ISSUES } from '../src/data/ijtema/dataIssues';
import { IJTEMA_NAVIGATION_GRAPH_V2, IJTEMA_NAVIGATION_GRAPH_V2_REPORT } from '../src/data/ijtema/navigationGraph';
import { IJTEMA_STREET_GRAPH_DATA } from '../src/data/ijtema/streetGraph';
import { validateV2Dataset } from '../src/data/ijtema/v2Validation';
import type { Block, CentralPoint, DataIssue, Gate, Rasta, SpecialRoute } from '../src/data/ijtema/types';
import type { NavigationGraphV2, GateConnectorReport, BlockEntryConnectorReport } from '../src/data/ijtema/graphTypes';
import type { StreetGraphData } from '../src/data/ijtema/streetGraphTypes';
import { haversineM } from '../src/utils/SpatialGrid';

export interface Finding { check: string; message: string }
export interface GraphReport { gateConnectors: GateConnectorReport[]; blockEntryConnectors: BlockEntryConnectorReport[] }
const fail = (check: string, message: string): Finding => ({ check, message });

const SPECIAL_ROUTE_GROUPS = ['shahr_e_pindal_north', 'shahr_e_pindal_south', 'shahr_e_pindal_west', 'prp'];
const NEAR_DUPLICATE_M = 1;

export function checkCategories(d: { gates: Gate[]; blocks: Block[]; rastas: Rasta[]; specialRoutes: SpecialRoute[]; centralPoints: CentralPoint[] }): Finding[] {
  const out: Finding[] = [];
  for (const g of d.gates) if (g.category !== 'gate' || !/^GATE_/.test(g.id)) out.push(fail('category', `gate ${g.id} has category/id outside the supported set`));
  for (const b of d.blocks) if (b.category !== 'block' || !/^B\d+$/.test(b.id)) out.push(fail('category', `block ${b.id} has category/id outside the supported set`));
  for (const r of d.rastas) if (r.category !== 'rasta' || !/^R\d+$/.test(r.id)) out.push(fail('category', `rasta ${r.id} has category/id outside the supported set`));
  for (const s of d.specialRoutes) if (s.category !== 'special_route') out.push(fail('category', `special route ${s.id} has unsupported category ${String(s.category)}`));
  for (const p of d.centralPoints) if (!/^P\d+$/.test(p.id)) out.push(fail('category', `central point ${p.id} has an unsupported id`));
  return out;
}

/** Two distinct venue entities on (almost) the same coordinate, unless dataIssues.ts documents the pair as near_duplicate. */
export function checkNearDuplicates(d: { gates: Gate[]; blocks: Block[]; centralPoints: CentralPoint[] }, issues: DataIssue[]): Finding[] {
  const pts = [
    ...d.gates.filter((g) => g.coordinate).map((g) => ({ id: g.id, c: g.coordinate! })),
    ...d.blocks.map((b) => ({ id: b.id, c: b.center })),
    ...d.centralPoints.map((p) => ({ id: p.id, c: p.coordinate })),
  ];
  const documented = issues.filter((i) => i.category === 'near_duplicate').map((i) => i.affectedIds);
  const out: Finding[] = [];
  for (let i = 0; i < pts.length; i++) {
    for (let j = i + 1; j < pts.length; j++) {
      const m = haversineM(pts[i].c.lat, pts[i].c.lng, pts[j].c.lat, pts[j].c.lng);
      if (m < NEAR_DUPLICATE_M && !documented.some((ids) => ids.includes(pts[i].id) && ids.includes(pts[j].id))) {
        out.push(fail('near-duplicate', `${pts[i].id} and ${pts[j].id} are ${m.toFixed(2)} m apart and not documented in dataIssues.ts`));
      }
    }
  }
  return out;
}

export function checkSpecialRoutes(routes: SpecialRoute[]): Finding[] {
  const out: Finding[] = [];
  const pointIds = new Set<string>();
  for (const r of routes) {
    if (r.points.length < 2) out.push(fail('route-reference', `special route ${r.id} has fewer than 2 points`));
    r.points.forEach((p, i) => {
      if (!SPECIAL_ROUTE_GROUPS.includes(p.group)) out.push(fail('route-reference', `${p.id} has unknown group ${p.group}`));
      if (pointIds.has(p.id)) out.push(fail('route-reference', `special route point id ${p.id} is duplicated`));
      pointIds.add(p.id);
      if (i > 0 && p.sequence <= r.points[i - 1].sequence) out.push(fail('route-reference', `${r.id} point sequence is not strictly increasing at ${p.id}`));
    });
  }
  return out;
}

/** Structure of the committed columnar OSM artifact: shape, indices, counts, connectors. */
export function checkStreetGraph(g: StreetGraphData, gateIds: string[]): Finding[] {
  const out: Finding[] = [];
  const n = g.nodeLat.length;
  const e = g.edgeFrom.length;
  const same = (label: string, len: number, want: number) => { if (len !== want) out.push(fail('street-graph', `${label} has length ${len}, expected ${want}`)); };
  same('nodeLng', g.nodeLng.length, n);
  for (const k of ['edgeTo', 'edgeDistanceM', 'edgeNameIndex', 'edgeGeometry'] as const) same(k, g[k].length, e);
  if (g.edgeDirection) same('edgeDirection', g.edgeDirection.length, e);
  if (g.edgeProfileIndex) same('edgeProfileIndex', g.edgeProfileIndex.length, e);
  same('gateConnectorNodeIndex', g.gateConnectorNodeIndex.length, g.gateConnectorGateIds.length);
  same('gateConnectorDistanceM', g.gateConnectorDistanceM.length, g.gateConnectorGateIds.length);
  same('metadata.simplifiedNodeCount', g.metadata.simplifiedNodeCount, n);
  same('metadata.simplifiedEdgeCount', g.metadata.simplifiedEdgeCount, e);
  if (!g.metadata.version || Number.isNaN(Date.parse(g.metadata.generatedAt))) out.push(fail('street-graph', 'metadata needs a version and a parseable generatedAt'));
  for (let i = 0; i < n; i++) if (!Number.isFinite(g.nodeLat[i]) || !Number.isFinite(g.nodeLng[i])) { out.push(fail('street-graph', `node ${i} has a non-finite coordinate`)); break; }
  for (let i = 0; i < e; i++) {
    const { edgeFrom: a, edgeTo: b } = { edgeFrom: g.edgeFrom[i], edgeTo: g.edgeTo[i] };
    if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0 || a >= n || b >= n) { out.push(fail('street-graph', `edge ${i} references a missing node (${a} -> ${b})`)); break; }
    if (a === b) { out.push(fail('street-graph', `edge ${i} is a self loop`)); break; }
    if (!(g.edgeDistanceM[i] > 0) || !Number.isFinite(g.edgeDistanceM[i])) { out.push(fail('street-graph', `edge ${i} has a non-positive or non-finite distance`)); break; }
    if (g.edgeNameIndex[i] < -1 || g.edgeNameIndex[i] >= g.names.length) { out.push(fail('street-graph', `edge ${i} name index is out of range`)); break; }
    if (g.edgeGeometry[i].length % 2 !== 0 || g.edgeGeometry[i].some((v) => !Number.isFinite(v))) { out.push(fail('street-graph', `edge ${i} geometry is not finite lat/lng pairs`)); break; }
  }
  g.gateConnectorGateIds.forEach((id, i) => {
    if (!gateIds.includes(id)) out.push(fail('street-graph', `gate connector for unknown gate ${id}`));
    const node = g.gateConnectorNodeIndex[i];
    if (!Number.isInteger(node) || node < 0 || node >= n) out.push(fail('street-graph', `gate connector for ${id} points at a missing node`));
  });
  return out;
}

function largestComponent(nodeCount: number, links: Array<[number, number]>): Set<number> {
  const adj: number[][] = Array.from({ length: nodeCount }, () => []);
  for (const [a, b] of links) { adj[a]?.push(b); adj[b]?.push(a); }
  let best = new Set<number>();
  const seen = new Uint8Array(nodeCount);
  for (let s = 0; s < nodeCount; s++) {
    if (seen[s]) continue;
    const comp = new Set<number>([s]); const stack = [s]; seen[s] = 1;
    while (stack.length) for (const v of adj[stack.pop()!]) if (!seen[v]) { seen[v] = 1; comp.add(v); stack.push(v); }
    if (comp.size > best.size) best = comp;
  }
  return best;
}

/** Every routable gate's street connector must sit in the main street-graph component. */
export function checkStreetReachability(g: StreetGraphData, routableGateIds: string[]): Finding[] {
  const main = largestComponent(g.nodeLat.length, g.edgeFrom.map((a, i) => [a, g.edgeTo[i]]));
  return routableGateIds.flatMap((id) => {
    const i = g.gateConnectorGateIds.indexOf(id);
    if (i < 0) return [fail('reachability', `routable gate ${id} has no street connector`)];
    return main.has(g.gateConnectorNodeIndex[i]) ? [] : [fail('reachability', `street connector of ${id} is not in the main street component`)];
  });
}

/** Every verified routable gate and every block must connect (via the build report) to the main venue-graph component. */
export function checkVenueReachability(graph: NavigationGraphV2, report: GraphReport, gates: Gate[], blocks: Block[]): Finding[] {
  const ids = Object.keys(graph.nodes);
  const index = new Map(ids.map((id, i) => [id, i]));
  const main = largestComponent(ids.length, graph.edges.filter((e) => index.has(e.from) && index.has(e.to)).map((e) => [index.get(e.from)!, index.get(e.to)!]));
  const inMain = (id?: string) => id !== undefined && index.has(id) && main.has(index.get(id)!);
  const out: Finding[] = [];
  for (const g of gates.filter((x) => x.routingStatus === 'routable' && x.connectorStatus === 'verified_by_geometry')) {
    const c = report.gateConnectors.find((x) => x.gateId === g.id);
    if (!c?.connected || !inMain(c.nearestNodeId)) out.push(fail('reachability', `verified gate ${g.id} is not connected to the main venue graph component`));
  }
  for (const b of blocks) {
    const cs = report.blockEntryConnectors.filter((x) => x.blockId === b.id);
    if (!cs.some((x) => x.connected && inMain(x.nearestNodeId))) out.push(fail('reachability', `block ${b.id} has no entry connected to the main venue graph component`));
  }
  return out;
}

// ---- Manifest: checksums of every source/artifact so any change is explicit in review ----

export const MANIFEST_PATH = 'src/data/ijtema/DATA_MANIFEST.json';
const TRACKED_FILES = [
  'src/data/ijtema/gates.ts', 'src/data/ijtema/gateMeta.ts', 'src/data/ijtema/blocks.ts', 'src/data/ijtema/rastas.ts',
  'src/data/ijtema/specialRoutes.ts', 'src/data/ijtema/centralPoints.ts', 'src/data/ijtema/perimeterConnectors.ts',
  'src/data/ijtema/mapBounds.ts', 'src/data/ijtema/entryPolicy.ts', 'src/data/ijtema/dataIssues.ts',
  'src/data/ijtema/streetGraph.ts', 'scripts/generate-street-graph.ts', 'scripts/pedestrianProfile.ts',
];

/** CRLF-normalised so a Windows checkout hashes the same as CI. */
export const sha256 = (text: string) => createHash('sha256').update(text.replace(/\r\n/g, '\n')).digest('hex');

export interface Manifest {
  schemaVersion: 1;
  /** Human-maintained: edit by hand in the same PR as the data change. */
  provenance: { dataVersion: string; updatedOn: string; editor: string; note: string };
  /** Machine-maintained by `npm run data:manifest`. */
  counts: Record<string, number>;
  streetGraph: { version: string; source: string; generatedAt: string; pedestrianProfileVersion: string | null };
  files: Record<string, string>;
}

export function buildManifest(root: string, previous: Manifest['provenance']): Manifest {
  const g = IJTEMA_STREET_GRAPH_DATA;
  return {
    schemaVersion: 1,
    provenance: previous,
    counts: {
      gates: IJTEMA_GATES.length, blocks: IJTEMA_BLOCKS.length, rastas: IJTEMA_RASTAS.length,
      specialRoutes: IJTEMA_SPECIAL_ROUTES.length, centralPoints: IJTEMA_CENTRAL_POINTS.length,
      streetNodes: g.nodeLat.length, streetEdges: g.edgeFrom.length,
    },
    streetGraph: { version: g.metadata.version, source: g.metadata.source, generatedAt: g.metadata.generatedAt, pedestrianProfileVersion: g.metadata.pedestrianProfileVersion ?? null },
    files: Object.fromEntries(TRACKED_FILES.map((f) => [f, sha256(readFileSync(join(root, f), 'utf8'))])),
  };
}

export function checkManifest(root: string, committed: Manifest): Finding[] {
  const out: Finding[] = [];
  const p = committed.provenance;
  if (!p || !p.dataVersion || !p.editor || !p.note || Number.isNaN(Date.parse(p.updatedOn))) out.push(fail('provenance', 'provenance needs dataVersion, editor, note and a valid updatedOn'));
  const fresh = buildManifest(root, committed.provenance);
  for (const f of TRACKED_FILES) if (fresh.files[f] !== committed.files?.[f]) out.push(fail('drift', `${f} changed but DATA_MANIFEST.json was not regenerated (npm run data:manifest)`));
  if (JSON.stringify(fresh.counts) !== JSON.stringify(committed.counts)) out.push(fail('drift', 'entity counts differ from DATA_MANIFEST.json'));
  if (JSON.stringify(fresh.streetGraph) !== JSON.stringify(committed.streetGraph)) out.push(fail('drift', 'street graph metadata differs from DATA_MANIFEST.json'));
  return out;
}

/** Everything `data:check` runs, source checks first. The existing v2 validator supplies ids, coordinates, names, orphan refs. */
export function validateAll(root: string): Finding[] {
  const d = { gates: IJTEMA_GATES, blocks: IJTEMA_BLOCKS, rastas: IJTEMA_RASTAS, specialRoutes: IJTEMA_SPECIAL_ROUTES, centralPoints: IJTEMA_CENTRAL_POINTS };
  const v2 = validateV2Dataset();
  const routable = IJTEMA_GATES.filter((g) => g.routingStatus === 'routable').map((g) => g.id);
  return [
    ...v2.errors.map((i) => fail('v2-validator', `${i.code} ${i.entityId}: ${i.message}`)),
    ...checkCategories(d),
    ...checkNearDuplicates(d, IJTEMA_DATA_ISSUES),
    ...checkSpecialRoutes(IJTEMA_SPECIAL_ROUTES),
    ...checkStreetGraph(IJTEMA_STREET_GRAPH_DATA, IJTEMA_GATES.map((g) => g.id)),
    ...checkStreetReachability(IJTEMA_STREET_GRAPH_DATA, routable),
    ...checkVenueReachability(IJTEMA_NAVIGATION_GRAPH_V2, IJTEMA_NAVIGATION_GRAPH_V2_REPORT, IJTEMA_GATES, IJTEMA_BLOCKS),
    ...checkManifest(root, JSON.parse(readFileSync(join(root, MANIFEST_PATH), 'utf8')) as Manifest),
  ];
}

if (process.argv[1] && /(^|\/)venue-data-maintenance\.ts$/.test(process.argv[1])) {
  const root = process.cwd();
  if (process.argv.includes('--write-manifest')) {
    const prev = JSON.parse(readFileSync(join(root, MANIFEST_PATH), 'utf8')) as Manifest;
    writeFileSync(join(root, MANIFEST_PATH), `${JSON.stringify(buildManifest(root, prev.provenance), null, 2)}\n`);
    console.log(`Wrote ${MANIFEST_PATH}. Review the diff; update provenance by hand if the data changed.`);
  } else {
    const findings = validateAll(root);
    findings.forEach((f) => console.error(`[${f.check}] ${f.message}`));
    if (findings.length) { console.error(`${findings.length} venue data finding(s).`); process.exit(1); }
    console.log('Venue data check passed.');
  }
}

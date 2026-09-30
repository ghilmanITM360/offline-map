/** Measurement-only harness for #119. Fixtures are fictional, never venue GIS. */
import { strict as assert } from 'node:assert';
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { cpus, platform, release, totalmem } from 'node:os';
import { performance } from 'node:perf_hooks';
import { resolve } from 'node:path';

import { IJTEMA_BLOCKS } from '../src/data/ijtema/blocks';
import { IJTEMA_CENTRAL_POINTS } from '../src/data/ijtema/centralPoints';
import { IJTEMA_GATES } from '../src/data/ijtema/gates';
import { buildNavigationGraphV2 } from '../src/data/ijtema/graphBuilder';
import { IJTEMA_PERIMETER_CONNECTORS } from '../src/data/ijtema/perimeterConnectors';
import { IJTEMA_RASTAS } from '../src/data/ijtema/rastas';
import { IJTEMA_SPECIAL_ROUTES } from '../src/data/ijtema/specialRoutes';
import type { Block, Coordinate, Rasta, RastaPoint } from '../src/data/ijtema/types';

const SIZES = [50, 100, 300, 500, 1000, 2000, 5000];
const QUERY_WARMUPS = 5;
const QUERY_SAMPLES = 30;
const GRAPH_WARMUPS = 1;
const GRAPH_SAMPLES = 5;
const SEARCH_BUILD_SAMPLES = 5;
const CHILD_TIMEOUT_MS = 120000;
const memory = () => ({ ...process.memoryUsage(), peakRssBytes: process.resourceUsage().maxRSS * 1024 });
function summarize(samples: number[]) {
  const sorted = [...samples].sort((a, b) => a - b);
  return { samples, medianMs: sorted[Math.floor(sorted.length / 2)], p95Ms: sorted[Math.ceil(sorted.length * 0.95) - 1] };
}
function measure<T>(fn: () => T) {
  const start = performance.now();
  const value = fn();
  return { value, ms: performance.now() - start };
}
function replace<T>(target: T[], fixture: T[]) { target.splice(0, target.length, ...fixture); }
const coordinate = (index: number): Coordinate => ({ lat: Math.floor(index / 100) * 0.0004, lng: (index % 100) * 0.0004 });
function makeBlock(index: number): Block {
  const center = coordinate(index);
  const corner = (lat: number, lng: number) => ({ lat: center.lat + lat, lng: center.lng + lng });
  const corners = { c1: corner(0.00006, 0.00006), c2: corner(0.00006, 0.00012), c3: corner(0.00012, 0.00012), c4: corner(0.00012, 0.00006) };
  const word = index === 0 ? 'benchmarktarget' : `destination${String(index).padStart(5, '0')}`;
  return {
    id: `B${index + 100}`, number: index + 100, name: { en: word, ur: word, romanUrdu: word },
    center, corners, entryPoints: corners, polygon: Object.values(corners), aliases: [`alias${String(index).padStart(5, '0')}`],
    category: 'block', status: 'needs_verification', visual: { label: word, fillKey: 'synthetic', showLabelByDefault: false },
    sourceNotes: ['Fictional benchmark fixture near origin; not Karachi venue data.'],
  };
}
function clearOtherData() {
  replace(IJTEMA_GATES, []); replace(IJTEMA_CENTRAL_POINTS, []);
  replace(IJTEMA_SPECIAL_ROUTES, []); replace(IJTEMA_PERIMETER_CONNECTORS, []);
}
function graphFixture(nodeCount: number) {
  clearOtherData();
  const blocks = Array.from({ length: Math.floor(nodeCount / 20) }, (_, i) => makeBlock(i));
  const walkableCount = nodeCount - blocks.length * 4;
  const routes: Rasta[] = [1, 2, 3, 4].map((number) => {
    const points: RastaPoint[] = [];
    for (let i = number - 1; i < walkableCount; i += 4) {
      points.push({ id: `R${number}-${i}`, rastaId: `R${number}`, rastaNumber: number, sequence: points.length,
        coordinate: coordinate(i), name: { en: `Synthetic point ${i}` } });
    }
    return { id: `R${number}`, number, name: { en: `Synthetic corridor ${number}` }, points,
      segments: [{ id: `synthetic-${number}`, pointIds: points.map((point) => point.id) }], junctions: [], aliases: [], category: 'rasta',
      visual: { label: 'Synthetic', strokeKey: 'synthetic', showLabelByDefault: false } };
  });
  replace(IJTEMA_BLOCKS, blocks); replace(IJTEMA_RASTAS, routes);
  return { requestedNodeCount: nodeCount, blockCount: blocks.length, blockEntryNodeCount: blocks.length * 4, walkableNodeCount: walkableCount, routeCount: routes.length };
}
async function runChild(kind: string, size: number) {
  process.env.EXPO_PUBLIC_USE_IJTEMA_V2_MAP = 'true';
  const synthetic = size > 0;
  // Baseline modules must load before mutation; their cached real graph remains untouched.
  const { SearchService } = await import('../src/services/SearchService.js');
  const { V2PlaceAdapter } = await import('../src/services/V2PlaceAdapter.js');
  const { FuzzySearchService } = await import('../src/services/FuzzySearchService.js');
  let fixture: Record<string, unknown> = { dataset: 'bundled-real' };
  if (synthetic && kind === 'graph') fixture = { dataset: 'fictional-synthetic', ...graphFixture(size) };
  if (synthetic && kind === 'search') {
    clearOtherData(); replace(IJTEMA_RASTAS, []);
    replace(IJTEMA_BLOCKS, Array.from({ length: size }, (_, i) => makeBlock(i)));
    fixture = { dataset: 'fictional-synthetic', destinationCount: size, blockCount: size, aliasesPerDestination: 1 };
  }
  global.gc?.();
  const before = memory();
  if (kind === 'graph') {
    for (let i = 0; i < GRAPH_WARMUPS; i++) buildNavigationGraphV2();
    global.gc?.();
    const buildBaseline = memory();
    const samples: number[] = [];
    let output: ReturnType<typeof buildNavigationGraphV2> | undefined;
    for (let i = 0; i < GRAPH_SAMPLES; i++) {
      global.gc?.();
      const result = measure(() => buildNavigationGraphV2()); output = result.value; samples.push(result.ms);
    }
    assert(output, 'Graph samples must produce a result');
    const after = memory();
    global.gc?.();
    const retainedAfterGc = memory();
    const actualNodeCount = Object.keys(output.graph.nodes).length;
    if (synthetic) {
      assert.equal(actualNodeCount, size);
      assert.equal(output.report.blockEntryConnectors.length, Number(fixture.blockEntryNodeCount));
      assert(output.report.blockEntryConnectors.every((connector) => connector.connected));
    }
    return { kind, fixture, actualNodeCount, edgeCount: output.graph.edges.length,
      connectedBlockEntries: output.report.blockEntryConnectors.filter((connector) => connector.connected).length,
      warningCount: output.report.warnings.length, warmups: GRAPH_WARMUPS, build: summarize(samples),
      memory: { before, buildBaseline, after, retainedAfterGc, heapDeltaBytes: after.heapUsed - buildBaseline.heapUsed, retainedHeapDeltaBytes: retainedAfterGc.heapUsed - buildBaseline.heapUsed }, correctness: 'passed' };
  }
  // Production has no separate search index. Measure the actual cold adapter cache construction.
  // Private cache reset is confined to this child process, using Reflect rather than a production API change.
  const resetCaches = () => {
    for (const key of ['allPlacesCache', 'categoryCache']) {
      const cache: unknown = Reflect.get(V2PlaceAdapter, key);
      assert(cache instanceof Map, `Production adapter cache ${key} changed`); cache.clear();
    }
  };
  const buildSamples: number[] = [];
  resetCaches(); V2PlaceAdapter.getAllPlaces({ includeUnavailableGates: true });
  for (let i = 0; i < SEARCH_BUILD_SAMPLES; i++) {
    resetCaches(); global.gc?.();
    buildSamples.push(measure(() => V2PlaceAdapter.getAllPlaces({ includeUnavailableGates: true })).ms);
  }
  const places = V2PlaceAdapter.getAllPlaces({ includeUnavailableGates: true });
  if (synthetic) assert.equal(places.length, size);
  const target = synthetic ? 'benchmarktarget' : 'Block 42';
  const targetId = synthetic ? 'B100' : 'B42';
  const queries = synthetic ? { exact: target, prefix: 'benchmark', fuzzy: 'benchmarktargex', noResult: 'zzzzzzzzzzzz', longReject: 'zzzzzzzzzzzzzzzzzzzz' }
    : { exact: target, prefix: 'Block', fuzzy: 'blok', noResult: 'zzzzzz', longReject: 'zzzzzzzzzzzzzzzzzzzz' };
  assert(FuzzySearchService.matches('benchmarktargex', 'benchmarktarget'));
  assert(!FuzzySearchService.matches(queries.noResult, 'benchmarktarget'));
  const queryResults = Object.fromEntries(Object.entries(queries).map(([name, query]) => {
    const result = SearchService.search(query);
    if (name === 'noResult' || name === 'longReject') assert.equal(result.length, 0);
    else assert(result.some((place) => place.id === targetId), `${name} must find ${targetId}`);
    for (let i = 0; i < QUERY_WARMUPS; i++) SearchService.search(query);
    const samples = Array.from({ length: QUERY_SAMPLES }, () => measure(() => SearchService.search(query)).ms);
    return [name, { query, resultCount: result.length, ...summarize(samples) }];
  }));
  const after = memory();
  global.gc?.();
  const retainedAfterGc = memory();
  return { kind, fixture, actualDestinationCount: places.length, build: summarize(buildSamples), buildWarmups: 1,
    queryWarmups: QUERY_WARMUPS, queries: queryResults,
    memory: { before, after, retainedAfterGc, heapDeltaBytes: after.heapUsed - before.heapUsed, retainedHeapDeltaBytes: retainedAfterGc.heapUsed - before.heapUsed }, correctness: 'passed' };
}
async function main() {
  const childIndex = process.argv.indexOf('--child');
  if (childIndex >= 0) {
    const result = await runChild(process.argv[childIndex + 1], Number(process.argv[childIndex + 2]));
    process.stdout.write(JSON.stringify(result)); return;
  }
  const outputPath = process.argv[2] ?? '/private/tmp/119-results.json';
  const results: unknown[] = [];
  const metadata = { measuredAt: new Date().toISOString(), node: process.version, platform: platform(), release: release(),
    architecture: process.arch, cpu: cpus()[0]?.model, logicalCpuCount: cpus().length, totalMemoryBytes: totalmem(),
    sourceHead: spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout.trim(),
    command: 'node --expose-gc --import tsx scripts/benchmark-core.ts /private/tmp/119-results.json',
    evidenceLevel: 'SOURCE/RUNTIME VERIFIED', childTimeoutMs: CHILD_TIMEOUT_MS,
    memoryNotes: 'Heap deltas include uncollected temporary allocations; RSS peak is process-lifetime OS high-water mark, includes module loading/tsx/fixtures; excludes parent and is not per-operation peak. GC outside timed regions. Fixture allocation excluded from timing. Node/V8 desktop only, not Hermes/device/startup.' };
  for (const size of [0, ...SIZES]) {
    for (const kind of ['search', 'graph']) {
      process.stderr.write(`Measuring ${kind} ${size || 'bundled-real'}\n`);
      const child = spawnSync(process.execPath, ['--expose-gc', '--import', 'tsx', resolve('scripts/benchmark-core.ts'), '--child', kind, String(size)],
        { encoding: 'utf8', timeout: CHILD_TIMEOUT_MS, maxBuffer: 8 * 1024 * 1024 });
      assert.equal(child.status, 0, `${kind}/${size} failed: ${child.error?.message ?? child.stderr}`);
      results.push(JSON.parse(child.stdout));
      writeFileSync(outputPath, `${JSON.stringify({ metadata, results }, null, 2)}\n`);
    }
  }
  process.stderr.write(`Wrote ${outputPath}\n`);
}
main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });

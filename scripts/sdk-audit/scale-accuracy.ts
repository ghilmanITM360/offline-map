/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Repeatable accuracy and scale measurements for the SDK (production-scale review, 2026-11-10).
//   node --import tsx scripts/sdk-audit/scale-accuracy.ts [out.json] [--quick]
// Part 1 uses the real Karachi pack resources. Part 2 uses SYNTHETIC grids (scalability fixtures, not surveyed venues).
// Walks are SIMULATED fixes on the route with seeded noise: they measure the engine's behaviour, not real-world GPS accuracy.
// Timings are from this machine's Node; a phone is slower. Nothing here is a pass/fail gate.
import { writeFileSync } from 'node:fs';
import {
  createNavigationController, createPlaceCatalog, findVenuePath, haversineM, parsePackPlaceCatalog, parsePackVenueData, edgeCostM,
  type LiveFixCoordinate, type NavigationLocationAdapter, type PlaceCatalog, type RouteLine, type VenueCoordinate, type VenueDataSource,
} from '../../packages/offline-navigation/src';
import { filterPlaceItems } from '../../packages/offline-navigation/src/ui/placeSearch';
import { IJTEMA_VENUE_SOURCE } from '../../src/data/ijtema/venueAdapter';
import { buildKarachiPlaceCatalog } from '../../src/data/ijtema/packResources';

const quick = process.argv.includes('--quick');
const outFile = process.argv.slice(2).find((a) => !a.startsWith('--'));

// ---- helpers ----
const rng = (seed: number) => () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const gauss = (r: () => number) => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());
const pct = (xs: number[], p: number) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); return +s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))].toFixed(3); };
const stats = (xs: number[]) => ({ n: xs.length, p50: pct(xs, 50), p95: pct(xs, 95), p99: pct(xs, 99), max: pct(xs, 100) });
const ms = (f: () => void) => { const t = performance.now(); f(); return performance.now() - t; };
const M = 111_320;
const offset = (p: VenueCoordinate, eastM: number, northM: number): VenueCoordinate => ({ lat: p.lat + northM / M, lng: p.lng + eastM / (M * Math.cos((p.lat * Math.PI) / 180)) });
const at = (line: RouteLine, m: number): VenueCoordinate => {
  const c = line.cumulativeM; let i = 0;
  while (i < c.length - 2 && c[i + 1] < m) i += 1;
  const t = c[i + 1] === c[i] ? 0 : Math.max(0, Math.min(1, (m - c[i]) / (c[i + 1] - c[i])));
  const a = line.points[i], b = line.points[i + 1];
  return { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t };
};

// ---- a controller driven by a scripted walker ----
const rig = (venue: VenueDataSource, catalog?: PlaceCatalog) => {
  let nowMs = 1_800_000_000_000;
  let onFix: ((f: LiveFixCoordinate) => void) | null = null;
  let position: VenueCoordinate = { lat: 0, lng: 0 };
  const fix = (p: VenueCoordinate, accuracy = 8): LiveFixCoordinate => ({ latitude: p.lat, longitude: p.lng, accuracy, observedAtMs: nowMs });
  const location: NavigationLocationAdapter = {
    getPermission: async () => ({ granted: true, canAskAgain: true, precision: 'fine', servicesState: 'enabled' }),
    requestPermission: async () => ({ granted: true, canAskAgain: true, precision: 'fine', servicesState: 'enabled' }),
    getCurrentFix: async () => fix(position),
    watch: (cb) => { onFix = cb; return () => { onFix = null; }; },
  };
  const controller = createNavigationController({ venue, location, now: () => nowMs, availability: catalog?.availability });
  return {
    controller,
    stand: (p: VenueCoordinate) => { position = p; },
    step: (p: VenueCoordinate, accuracy = 8, silent = false) => { nowMs += 1000; position = p; if (!silent) onFix?.(fix(p, accuracy)); controller.tick(); },
  };
};

interface Walk { arrived: boolean; trueRemainingAtArrivalM: number | null; reroutes: number; keptRoute: number; alongErrors: number[]; endDistanceM: number | null }
/** Walks the live route at 1.4 m/s with one fix a second and gaussian noise of `sigmaM`; reports what the engine concluded. */
const walk = async (venue: VenueDataSource, catalog: PlaceCatalog | undefined, originNode: string, destinationId: string, sigmaM: number, seed: number): Promise<Walk | null> => {
  const r = rig(venue, catalog);
  const random = rng(seed);
  const start = venue.graph.getNode(originNode)!.coordinate;
  r.controller.selectDestination(destinationId);
  r.stand(start);
  if (!(await r.controller.requestLive())) return null;
  let reroutes = 0, keptRoute = 0, lastNotice: string | null = null;
  r.controller.subscribe(() => {
    const n = r.controller.getState().live?.notice ?? null;
    const rr = r.controller.getState().live?.rerouting ?? false;
    if (n !== lastNotice && !rr) { if (n === 'rerouted') reroutes += 1; if (n === 'kept_route') keptRoute += 1; }
    lastNotice = rr ? null : n;
  });
  const line = r.controller.getState().route!.line!;
  const alongErrors: number[] = [];
  let trueM = 0;
  for (let s = 0; s < line.totalM / 1.4 + 120 && r.controller.getState().phase === 'live'; s += 1) {
    trueM = Math.min(line.totalM, trueM + 1.4);
    const truth = at(line, trueM);
    r.step(offset(truth, gauss(random) * sigmaM, gauss(random) * sigmaM), Math.max(5, sigmaM * 2));
    const st = r.controller.getState();
    // Along-route error is only defined while the engine still follows the route the walker is on.
    if (st.live && st.route?.line === line) alongErrors.push(Math.abs(st.live.progressM - trueM));
  }
  const st = r.controller.getState();
  const arrived = st.phase === 'arrived';
  const end = line.points[line.points.length - 1];
  const result = { arrived, trueRemainingAtArrivalM: arrived ? line.totalM - trueM : null, reroutes, keptRoute, alongErrors, endDistanceM: arrived ? haversineM(at(line, trueM), end) : null };
  r.controller.dispose();
  return result;
};

const main = async () => {
  const report: Record<string, unknown> = { generatedBy: 'scripts/sdk-audit/scale-accuracy.ts', node: process.version, quick, note: 'Simulated fixes and synthetic grids. Not real-world GPS accuracy; not a surveyed venue beyond the Karachi data it reads.' };

  // =========================== Part 1: Karachi ===========================
  const venue = IJTEMA_VENUE_SOURCE as unknown as VenueDataSource;
  const g = venue.graph;
  const nodeIds = [...g.nodeIds()];
  const parsedCatalog = parsePackPlaceCatalog(JSON.stringify(buildKarachiPlaceCatalog()), { venueId: venue.venueId, nodeIds: new Set(nodeIds) });
  if (!parsedCatalog.ok) throw new Error(parsedCatalog.error.message);
  const catalog = createPlaceCatalog(parsedCatalog.catalog);

  // Graph facts.
  let edges = 0, asymmetric = 0, shorterThanStraight = 0, weighted = 0;
  const noOut: string[] = [];
  for (const id of nodeIds) {
    const out = g.edgesFrom(id);
    if (out.length === 0) noOut.push(id);
    for (const e of out) {
      edges += 1;
      if (e.weightMultiplier !== undefined && e.weightMultiplier !== 1) weighted += 1;
      if (!g.edgesFrom(e.to).some((b) => b.to === id)) asymmetric += 1;
      if (e.distanceM < haversineM(g.getNode(id)!.coordinate, g.getNode(e.to)!.coordinate) - 0.5) shorterThanStraight += 1;
    }
  }
  // Weak components (treating edges as undirected).
  const comp = new Map<string, number>();
  const undirected = new Map<string, string[]>(nodeIds.map((id) => [id, []]));
  for (const id of nodeIds) for (const e of g.edgesFrom(id)) { undirected.get(id)!.push(e.to); undirected.get(e.to)!.push(id); }
  let components = 0;
  for (const id of nodeIds) {
    if (comp.has(id)) continue;
    const stack = [id]; comp.set(id, components);
    while (stack.length) for (const n of undirected.get(stack.pop()!)!) if (!comp.has(n)) { comp.set(n, components); stack.push(n); }
    components += 1;
  }
  const sizes = new Map<number, number>(); for (const c of comp.values()) sizes.set(c, (sizes.get(c) ?? 0) + 1);
  const main = [...sizes.entries()].sort((a, b) => b[1] - a[1])[0][0];
  const offMain = nodeIds.filter((id) => comp.get(id) !== main).map((id) => {
    let nearest = Infinity;
    for (const other of nodeIds) if (comp.get(other) === main) nearest = Math.min(nearest, haversineM(g.getNode(id)!.coordinate, g.getNode(other)!.coordinate));
    return { id, nearestMainNodeM: +nearest.toFixed(1) };
  });
  const byCategory: Record<string, Record<string, number>> = {};
  for (const p of catalog.list()) { byCategory[p.category] ??= {}; byCategory[p.category][p.routing] = (byCategory[p.category][p.routing] ?? 0) + 1; }
  report.karachiData = { nodes: nodeIds.length, directedEdges: edges, oneWayEdges: asymmetric, weightedEdges: weighted, edgesShorterThanStraightLine: shorterThanStraight,
    weakComponents: components, nodesOutsideMainComponent: offMain, nodesWithNoOutgoingEdge: noOut, routerPlaces: venue.placeIds().length, catalogPlaces: catalog.list().length, catalogByCategoryAndRouting: byCategory };

  // Route optimality: A* against an independent array-scan Dijkstra, every ordered node pair.
  const index = new Map(nodeIds.map((id, i) => [id, i]));
  let pairs = 0, mismatches = 0, unreachable = 0, endpointErrors = 0;
  const routeMs: number[] = [];
  for (const src of quick ? nodeIds.slice(0, 40) : nodeIds) {
    const dist = new Float64Array(nodeIds.length).fill(Infinity); const done = new Uint8Array(nodeIds.length);
    dist[index.get(src)!] = 0;
    for (;;) {
      let u = -1; for (let i = 0; i < dist.length; i += 1) if (!done[i] && (u < 0 || dist[i] < dist[u])) u = i;
      if (u < 0 || dist[u] === Infinity) break;
      done[u] = 1;
      for (const e of g.edgesFrom(nodeIds[u])) { const v = index.get(e.to)!; const d = dist[u] + edgeCostM(e); if (d < dist[v]) dist[v] = d; }
    }
    for (const dst of nodeIds) {
      if (dst === src) continue;
      pairs += 1;
      let path: ReturnType<typeof findVenuePath>;
      routeMs.push(ms(() => { path = findVenuePath(g, src, dst); }));
      const want = dist[index.get(dst)!];
      if (!path!) { if (want !== Infinity) mismatches += 1; else unreachable += 1; continue; }
      if (Math.abs(path!.costM - want) > 1e-6) mismatches += 1;
      if (path!.nodes[0] !== src || path!.nodes[path!.nodes.length - 1] !== dst) endpointErrors += 1;
    }
  }
  report.karachiRouteOptimality = { orderedNodePairs: pairs, costMismatchesVsIndependentDijkstra: mismatches, unreachablePairsBothAgree: unreachable, endpointErrors, routeLatencyMs: stats(routeMs) };

  // Destination selection and endpoint correctness, per catalog place, from Gate 12.
  const selection = { routable: 0, refusedUnreachable: 0, refusedNotLocated: 0, endsOnOwnNode: 0, wrong: [] as string[] };
  for (const p of catalog.list()) {
    const r = rig(venue, catalog);
    r.controller.selectDestination(p.id);
    r.controller.selectOrigin(p.id === 'GATE_12' ? 'GATE_13' : 'GATE_12');
    const st = r.controller.getState();
    const can = catalog.availability(p.id)!.canRoute;
    if (!can) { if (st.route !== null) selection.wrong.push(`${p.id}: route drawn to a non-routable place`); else if (st.error === 'destination_unreachable') selection.refusedUnreachable += 1; else selection.refusedNotLocated += 1; }
    else if (!st.route) selection.wrong.push(`${p.id}: no route (${st.error})`);
    else { selection.routable += 1; if (p.nodeIds.includes(st.route.nodeIds[st.route.nodeIds.length - 1])) selection.endsOnOwnNode += 1; else selection.wrong.push(`${p.id}: ends on a node that is not the place's`); }
    r.controller.dispose();
  }
  report.karachiDestinationSelection = selection;

  // Simulated live walks: every routable destination from a spread of start nodes.
  const destinations = catalog.list().filter((p) => catalog.availability(p.id)!.canRoute).map((p) => p.id);
  const connected = nodeIds.filter((id) => comp.get(id) === main && g.edgesFrom(id).length > 0);
  const starts = connected.filter((_, i) => i % (quick ? 60 : 12) === 0);
  for (const [label, sigma] of [['clean', 0], ['noise5m', 5], ['noise12m', 12]] as const) {
    let attempted = 0, started = 0, arrived = 0, premature = 0, reroutes = 0, kept = 0, walksWithReroute = 0, runaway = 0;
    const along: number[] = [], remainingAtArrival: number[] = [], endDistance: number[] = [];
    let seed = 1;
    for (const s of starts) for (const d of destinations) {
      attempted += 1;
      const w = await walk(venue, catalog, s, d, sigma, (seed += 1));
      if (!w) continue;
      started += 1;
      if (w.arrived) { arrived += 1; remainingAtArrival.push(w.trueRemainingAtArrivalM!); endDistance.push(w.endDistanceM!); if (w.trueRemainingAtArrivalM! > 40) premature += 1; }
      reroutes += w.reroutes; kept += w.keptRoute; if (w.reroutes + w.keptRoute > 0) walksWithReroute += 1;
      let worst = 0; for (const e of w.alongErrors) { along.push(e); if (e > worst) worst = e; }
      if (worst > 60) runaway += 1;
    }
    report[`karachiSimulatedWalks_${label}`] = { sigmaM: sigma, attempted, liveStarted: started, notStarted: attempted - started, arrived, arrivalRate: +(arrived / Math.max(1, started)).toFixed(4),
      prematureArrivals_over40mOfRouteLeft: premature, rerouteEventsOnAnOnRouteWalker: reroutes, keptRouteEvents: kept, walksWithAnyRerouteEvent: walksWithReroute, walksWithProgressErrorOver60m: runaway,
      alongRouteErrorM: stats(along), trueRouteLeftAtArrivalM: stats(remainingAtArrival), straightLineToEndpointAtArrivalM: stats(endDistance) };
  }

  // Search: the headless catalog and the ready-made screen's directory filter, on every name of every place.
  const items = catalog.list().map((p) => ({ id: p.id, title: p.names.en, searchTerms: [...Object.values(p.names), ...p.aliases, p.id, p.category] }));
  const toArabicKeyboard = (s: string) => s.replace(/ی/g, 'ي').replace(/ک/g, 'ك').replace(/ہ/g, 'ه');
  const probe = (name: string, mutate: (s: string) => string) => {
    let n = 0, catalogTop1 = 0, catalogFound = 0, screenTop1 = 0, screenFound = 0;
    for (const p of catalog.list()) for (const text of new Set([...Object.values(p.names), ...p.aliases])) {
      const q = mutate(text);
      if (q === null || q.trim() === '') continue;
      n += 1;
      const c = catalog.search(q).map((h) => h.place.id); const s = filterPlaceItems(items, q).map((i) => i.id);
      if (c[0] === p.id) catalogTop1 += 1; if (c.includes(p.id)) catalogFound += 1;
      if (s[0] === p.id) screenTop1 += 1; if (s.includes(p.id)) screenFound += 1;
    }
    return { probe: name, queries: n, catalogFound, catalogTop1, screenFound, screenTop1 };
  };
  report.karachiSearch = [
    probe('exact name or alias', (s) => s),
    probe('upper case', (s) => s.toUpperCase()),
    probe('punctuation instead of spaces', (s) => s.replace(/\s+/g, '-')),
    probe('Urdu typed on an Arabic keyboard (ي ك ه)', (s) => (/[؀-ۿ]/.test(s) && toArabicKeyboard(s) !== s ? toArabicKeyboard(s) : '')),
    probe('one letter dropped (misspelling)', (s) => (s.length > 4 ? s.slice(0, 2) + s.slice(3) : '')),
    probe('two adjacent letters swapped (misspelling)', (s) => (s.length > 4 ? s.slice(0, 1) + s[2] + s[1] + s.slice(3) : '')),
  ];

  // =========================== Part 2: synthetic scale ===========================
  const scale: unknown[] = [];
  for (const n of quick ? [1_000, 10_000] : [1_000, 10_000, 50_000, 100_000]) {
    const side = Math.ceil(Math.sqrt(n));
    const origin = { lat: 24.9, lng: 67.0 };
    const nodes: { id: string; lat: number; lng: number }[] = [];
    const gEdges: { from: string; to: string; distanceM: number }[] = [];
    for (let i = 0; i < side * side; i += 1) { const p = offset(origin, (i % side) * 20, Math.floor(i / side) * 20); nodes.push({ id: `n${i}`, lat: p.lat, lng: p.lng }); }
    for (let i = 0; i < side * side; i += 1) {
      if (i % side < side - 1) { gEdges.push({ from: `n${i}`, to: `n${i + 1}`, distanceM: 20 }, { from: `n${i + 1}`, to: `n${i}`, distanceM: 20 }); }
      if (i + side < side * side) { gEdges.push({ from: `n${i}`, to: `n${i + side}`, distanceM: 20 }, { from: `n${i + side}`, to: `n${i}`, distanceM: 20 }); }
    }
    const words = ['Lahore', 'Multan', 'Quetta', 'Peshawar', 'Hyderabad', 'Sukkur', 'Faisalabad', 'Sialkot', 'Gujrat', 'Larkana'];
    const places = Array.from({ length: n }, (_, i) => ({ id: `P${i}`, kind: 'ilaqa', nodeIds: [`n${i}`] }));
    const catalogDoc = { schemaVersion: 1, venueId: 'synthetic-scale', places: places.map((p, i) => ({
      id: p.id, category: 'ilaqa', names: { en: `${words[i % 10]} Camp ${i}`, ur: `کیمپ ${i}` }, aliases: [`halqa ${i}`], location: 'provisional', coordinate: { lat: nodes[i].lat, lng: nodes[i].lng },
      routing: 'routable', nodeIds: p.nodeIds, provenance: { source: 'synthetic' },
    })) };
    const graphText = JSON.stringify({ schemaVersion: 1, venueId: 'synthetic-scale', dataVersion: 's1', nodes, edges: gEdges });
    const placesText = JSON.stringify({ schemaVersion: 1, venueId: 'synthetic-scale', places });
    const catalogText = JSON.stringify(catalogDoc);
    const heap0 = (global.gc?.(), process.memoryUsage().heapUsed);
    let source!: VenueDataSource; let cat!: PlaceCatalog;
    const parseGraphMs = ms(() => { const r = parsePackVenueData(graphText, placesText); if (!r.ok) throw new Error(r.error.message); source = r.source; });
    const parseCatalogMs = ms(() => { const r = parsePackPlaceCatalog(catalogText); if (!r.ok) throw new Error(r.error.message); cat = createPlaceCatalog(r.catalog); });
    const heap1 = (global.gc?.(), process.memoryUsage().heapUsed);
    const random = rng(n);
    const pick = () => Math.floor(random() * n);
    const searchMs: number[] = [], screenMs: number[] = [], routeMs2: number[] = [], rerouteMs: number[] = [];
    const sItems = cat.list().map((p) => ({ id: p.id, title: p.names.en, searchTerms: [...Object.values(p.names), ...p.aliases, p.id, p.category] }));
    for (let i = 0; i < (quick ? 20 : 60); i += 1) {
      const q = i % 3 === 0 ? `${words[i % 10]} camp ${pick()}` : i % 3 === 1 ? `camp ${pick() % 100}` : words[i % 10].slice(0, 3);
      searchMs.push(ms(() => { cat.search(q, { limit: 50 }); }));
      screenMs.push(ms(() => { filterPlaceItems(sItems, q); }));
    }
    for (let i = 0; i < (quick ? 20 : 60); i += 1) { const a = `n${pick()}`, b = `n${pick()}`; routeMs2.push(ms(() => { findVenuePath(source.graph, a, b); })); }
    // Live start (nearest node + route) through the controller, inside and far outside the venue.
    const r = rig(source, cat);
    const liveStart = async (p: VenueCoordinate) => { r.controller.selectDestination(`P${pick()}`); r.stand(p); const t = performance.now(); await r.controller.requestLive(); const d = performance.now() - t; r.controller.exit(); return d; };
    const firstLiveStartMs = await liveStart(offset(origin, 31, 47));
    for (let i = 0; i < 20; i += 1) rerouteMs.push(await liveStart(offset(origin, (pick() % side) * 20 + 3, (pick() % side) * 20 + 4)));
    const outside2kmMs = await liveStart(offset(origin, -2_000, -2_000));
    const outside50kmMs = await liveStart(offset(origin, -50_000, -50_000));
    const outside1000kmMs = await liveStart({ lat: 31.5, lng: 74.3 });
    r.controller.dispose();
    scale.push({ places: n, graphNodes: nodes.length, graphEdges: gEdges.length, packJsonBytes: graphText.length + placesText.length + catalogText.length,
      parseRoutingGraphAndDirectoryMs: +parseGraphMs.toFixed(1), parseAndIndexCatalogMs: +parseCatalogMs.toFixed(1), retainedHeapMB: +((heap1 - heap0) / 1048576).toFixed(1),
      catalogSearchMs: stats(searchMs), screenDirectoryFilterMs: stats(screenMs), routeAcrossGridMs: stats(routeMs2),
      firstLiveStartMs_buildsNodeIndex: +firstLiveStartMs.toFixed(1), liveStartInsideVenueMs: stats(rerouteMs),
      liveRequestOutsideVenue_2kmMs: +outside2kmMs.toFixed(1), liveRequestOutsideVenue_50kmMs: +outside50kmMs.toFixed(1), liveRequestOutsideVenue_1000kmMs: +outside1000kmMs.toFixed(1) });
  }
  report.syntheticScale = scale;

  const text = `${JSON.stringify(report, null, 1)}\n`;
  if (outFile) writeFileSync(outFile, text); else process.stdout.write(text);
};

main().catch((e) => { console.error(e); process.exit(1); });

// B2c headless consumer: executes the REAL extracted offline-navigation domain in a plain Node process.
// Imports only the domain; no app facades, no Jest, no RN/Expo/Zustand. Compiled to CJS by run.mjs.
import { strict as assert } from 'node:assert';
import { MinHeap } from '../../packages/offline-navigation/src/domain/algorithms/MinHeap';
import { reconstructAStarPath, runAStar, type AStarNeighbor } from '../../packages/offline-navigation/src/domain/algorithms/AStar';
import * as journey from '../../packages/offline-navigation/src/domain/journey';
import { findVenuePath, validateVenueGraph } from '../../packages/offline-navigation/src/domain/venue';
import { findStreetRouteToTargets } from '../../packages/offline-navigation/src/domain/street';
import { createSyntheticVenue } from './syntheticVenue';
import { streetGraphA, streetGraphB } from './syntheticStreets';

const {
  MAX_LIVE_FIX_AGE_MS, evaluateLocationCapability, evaluateNavigationStart, resolveStartActionKind,
  decideAutoLive, consumeIntent, retireIntent, selectJourneyPresentationState, isJourneyStartable,
} = journey;

let passed = 0;
const check = (name: string, fn: () => void): void => {
  fn();
  passed++;
  console.log(`  ok - ${name}`);
};

// ---- Routing: synthetic graph, zero heuristic (Dijkstra-equivalent) ----
type Edge = { from: string; to: string; weight: number };
const edges: Edge[] = [
  { from: 'A', to: 'B', weight: 1 }, { from: 'B', to: 'C', weight: 1 }, { from: 'C', to: 'E', weight: 1 },
  { from: 'A', to: 'E', weight: 10 },
  { from: 'A', to: 'X', weight: 1 }, { from: 'A', to: 'Y', weight: 1 },
  { from: 'X', to: 'T', weight: 1 }, { from: 'Y', to: 'T', weight: 1 },
  { from: 'Z', to: 'A', weight: 1 }, // Z is a source-only island: nothing leads to it
];
const run = (from: string, to: string, expanded?: string[]) => {
  const result = runAStar<Edge>({
    seeds: [{ id: from, gScore: 0 }],
    heuristic: () => 0,
    isGoal: (id) => id === to,
    neighbors: (id): AStarNeighbor<Edge>[] => {
      expanded?.push(id);
      return edges.filter((e) => e.from === id).map((e) => ({ to: e.to, weight: e.weight, edge: e }));
    },
  });
  return result && { result, cost: result.gScore[result.goalId], path: reconstructAStarPath(result, result.goalId) };
};

check('A* picks the cheaper multi-hop route over the costly direct edge', () => {
  const r = run('A', 'E')!;
  assert.equal(r.cost, 3);
  assert.deepEqual(r.path.nodes, ['A', 'B', 'C', 'E']);
  assert.deepEqual(r.path.edges.map((e) => `${e.from}>${e.to}`), ['A>B', 'B>C', 'C>E']);
});
check('A* returns undefined for an unreachable destination', () => {
  assert.equal(run('A', 'Z'), undefined);
});
check('A* same start and goal is a zero-cost single-node path', () => {
  const r = run('A', 'A')!;
  assert.equal(r.cost, 0);
  assert.deepEqual(r.path, { nodes: ['A'], edges: [] });
});
check('A* equal-cost tie is deterministic: same optimal cost and identical path on every run', () => {
  const first = run('A', 'T')!;
  assert.equal(first.cost, 2);
  assert.ok(['X', 'Y'].includes(first.path.nodes[1]));
  for (let i = 0; i < 20; i++) assert.deepEqual(run('A', 'T')!.path.nodes, first.path.nodes);
  // Pinned observed behaviour (B2a heap, no stable-order guarantee): Y's push sifts ahead of the equal-priority X.
  assert.deepEqual(first.path.nodes, ['A', 'Y', 'T']);
});
check('A* expands nodes in non-decreasing cost order (MinHeap drives the frontier)', () => {
  const expanded: string[] = [];
  const r = run('A', 'E', expanded)!;
  const g = (id: string) => r.result.gScore[id];
  for (let i = 1; i < expanded.length; i++) assert.ok(g(expanded[i - 1]) <= g(expanded[i]), `${expanded.join(',')}`);
  assert.ok(!expanded.includes('E'), 'goal is detected on pop, never expanded');
});
check('MinHeap pops by ascending priority and is empty afterwards', () => {
  const h = new MinHeap<string>();
  [['d', 4], ['a', 1], ['c', 3], ['b', 2], ['a2', 1]].forEach(([v, p]) => h.push(v as string, p as number));
  const order = [];
  while (!h.isEmpty()) order.push(h.pop()!.priority);
  assert.deepEqual(order, [1, 1, 2, 3, 4]);
  assert.equal(h.pop(), undefined);
});

// ---- Journey policy: injected clock, copy-free codes ----
const NOW = 1_700_000_000_000;
const fix = (over: Partial<{ accuracy: number; observedAtMs: number; latitude: number }> = {}) =>
  ({ latitude: 24.9, longitude: 67.1, accuracy: 10, observedAtMs: NOW - 1_000, ...over });
const fine = { granted: true, canAskAgain: true, precision: 'fine' as const, servicesState: 'enabled' as const };
const cap = (permission: journey.LocationPermissionInput = fine, liveFix: ReturnType<typeof fix> | null = fix()) =>
  evaluateLocationCapability({ permission, liveFix, nowMs: NOW });

check('fresh precise GPS is live navigation with no blocker', () => {
  const c = cap();
  assert.equal(c.fix, 'usable');
  assert.equal(c.mode, 'live_navigation');
  assert.equal(c.liveBlocker, null);
  assert.equal(c.routeGuideAvailable, true);
});
check('stale GPS (age beyond the limit) falls back to the route guide', () => {
  const c = cap(fine, fix({ observedAtMs: NOW - MAX_LIVE_FIX_AGE_MS - 1 }));
  assert.deepEqual([c.fix, c.liveBlocker, c.mode], ['stale', 'stale_fix', 'route_guide']);
  assert.equal(cap(fine, fix({ observedAtMs: NOW - MAX_LIVE_FIX_AGE_MS })).fix, 'usable'); // boundary is inclusive
});
check('freshness depends only on the injected clock (same fix, later now => stale)', () => {
  const f = fix();
  assert.equal(evaluateLocationCapability({ permission: fine, liveFix: f, nowMs: NOW }).fix, 'usable');
  assert.equal(evaluateLocationCapability({ permission: fine, liveFix: f, nowMs: NOW + 60_000 }).fix, 'stale');
  assert.equal(evaluateLocationCapability({ permission: fine, liveFix: f, nowMs: NOW - 5_000 }).fix, 'stale'); // clock rollback
});
check('weak accuracy is unusable', () => {
  assert.equal(cap(fine, fix({ accuracy: 51 })).liveBlocker, 'weak_fix');
});
check('approximate location blocks live navigation', () => {
  assert.equal(cap({ ...fine, precision: 'coarse' }).liveBlocker, 'approximate_only');
  assert.equal(cap({ ...fine, precision: 'none' }).liveBlocker, 'precision_unknown');
});
check('permission denied: askable vs blocked', () => {
  assert.equal(cap({ granted: false, canAskAgain: true }, null).liveBlocker, 'permission_needed');
  assert.equal(cap({ granted: false, canAskAgain: false }, null).liveBlocker, 'permission_blocked');
});
check('location services disabled blocks live navigation', () => {
  assert.equal(cap({ ...fine, servicesState: 'disabled' }).liveBlocker, 'services_off');
});
check('no fix / acquiring are distinct blockers', () => {
  assert.equal(cap(fine, null).liveBlocker, 'no_fix');
  assert.equal(evaluateLocationCapability({ permission: fine, liveFix: null, acquiring: true, nowMs: NOW }).liveBlocker, 'acquiring');
});
check('start gate: manual/saved starts never go live; fresh fine fix can', () => {
  const go = (startSource: journey.NavigationStartSource, precision: 'fine' | 'coarse' | 'none' = 'fine', coordinate = fix()) =>
    evaluateNavigationStart({ startSource, coordinate, precision, nowMs: NOW });
  assert.deepEqual(go('live_gps'), { canStart: true, block: null });
  assert.equal(go('manual_place').block, 'manual_start');
  assert.equal(go('hypothetical_place').block, 'manual_start');
  assert.equal(go('remembered_location').block, 'saved_start');
  assert.equal(go('live_gps', 'coarse').block, 'approximate_precision');
  assert.equal(go('live_gps', 'none').block, 'precision_unknown');
  assert.equal(go('live_gps', 'fine', fix({ observedAtMs: NOW - 31_000 })).block, 'stale_fix');
});
check('start action: manual origin is a route guide whatever the location state', () => {
  const base = { liveFix: null, permission: { granted: false, precision: 'none' as const }, nowMs: NOW };
  assert.equal(resolveStartActionKind({ ...base, startSource: 'manual_place' }).kind, 'route_guide');
  assert.equal(resolveStartActionKind({ ...base, startSource: 'live_gps' }).kind, 'turn_on_location');
  assert.equal(resolveStartActionKind({ ...base, startSource: 'live_gps', permission: { granted: true, precision: 'coarse' } }).kind, 'precise_location');
  assert.deepEqual(
    resolveStartActionKind({ ...base, startSource: 'live_gps', permission: { granted: true, precision: 'none' } }),
    { kind: 'use_location', precisionUnknown: true });
  const live = { ...base, startSource: 'live_gps' as const, permission: { granted: true, precision: 'fine' as const } };
  assert.equal(resolveStartActionKind({ ...live, liveFix: fix() }).kind, 'start');
  assert.equal(resolveStartActionKind({ ...live, liveFix: fix({ observedAtMs: NOW - 99_000 }) }).kind, 'use_location');
  assert.equal(resolveStartActionKind({ ...live, liveFix: fix(), directGuide: true }).kind, 'route_guide');
});
check('destination intent: one explicit tap grants one live attempt; cancel/supersede refuse', () => {
  assert.equal(decideAutoLive({ isNavigating: false, servicesState: 'enabled', capabilityMode: 'live_navigation' }), 'eligible');
  assert.equal(decideAutoLive({ isNavigating: true, servicesState: 'enabled', capabilityMode: 'live_navigation' }), 'ineligible');
  assert.equal(decideAutoLive({ isNavigating: false, servicesState: 'unknown', capabilityMode: 'live_navigation' }), 'ineligible');
  assert.equal(decideAutoLive({ isNavigating: false, servicesState: 'enabled', capabilityMode: 'route_guide' }), 'ineligible');
  const intent = { id: 7, destinationId: 'D1', autoLive: 'eligible' as const };
  assert.equal(consumeIntent(intent, 8), null); // superseded by a newer tap
  assert.equal(consumeIntent(null, 7), null);
  const spent = consumeIntent(intent, 7)!;
  assert.equal(spent.autoLive, 'consumed');
  assert.equal(intent.autoLive, 'eligible', 'input is not mutated');
  assert.equal(consumeIntent(spent, 7), null); // one-shot
  assert.equal(retireIntent(spent, 7), null);
  assert.equal(retireIntent(intent, 8), null);
  assert.equal(retireIntent(intent, 7)!.autoLive, 'consumed');
});
check('presentation state: explicit, copy-free, fails closed', () => {
  const ready = { loadState: 'ready' as const, route: {} };
  assert.equal(selectJourneyPresentationState({ ...ready, startSource: 'live_gps', liveReady: true }), 'LIVE_READY');
  assert.equal(selectJourneyPresentationState({ ...ready, startSource: 'live_gps' }), 'NEEDS_START');
  assert.equal(selectJourneyPresentationState({ ...ready, startSource: 'manual_place' }), 'MANUAL_GUIDE_READY');
  assert.equal(selectJourneyPresentationState({ ...ready, startSource: 'hypothetical_place' }), 'HYPOTHETICAL_PREVIEW');
  assert.equal(selectJourneyPresentationState({ loadState: 'ready', startSource: 'manual_place', route: null }), 'ROUTE_FAILURE');
  assert.equal(selectJourneyPresentationState({ loadState: 'needs_origin', startSource: 'live_gps', route: null }), 'NEEDS_START');
  assert.equal(selectJourneyPresentationState({ ...ready, startSource: 'manual_place', navigation: 'active' }), 'ACTIVE_NAVIGATION');
  const direct = { loadState: 'ready' as const, startSource: 'manual_place' as const, route: { outsideRoute: { provider: 'direct-guide' } } };
  assert.equal(selectJourneyPresentationState(direct), 'OUTSIDE_VENUE_GUIDE');
  assert.ok(isJourneyStartable('OUTSIDE_VENUE_GUIDE') && !isJourneyStartable('NEEDS_START'));
});
check('decision outputs are copy-free codes (snake_case / UPPER_SNAKE identifiers only)', () => {
  const codes = [
    cap().mode, cap(fine, null).liveBlocker, evaluateNavigationStart({ startSource: 'manual_place', coordinate: null, nowMs: NOW }).block,
    resolveStartActionKind({ startSource: 'manual_place', liveFix: null, permission: { granted: false, precision: 'none' }, nowMs: NOW }).kind,
    selectJourneyPresentationState({ loadState: 'idle', startSource: 'live_gps', route: null }),
  ];
  for (const c of codes) assert.match(c!, /^[a-z]+(_[a-z]+)*$|^[A-Z]+(_[A-Z]+)*$/);
});

// ---- Venue contract: synthetic non-Ijtema venue through the real domain (B3a) ----
check('synthetic venue: lookup, shortest route via A*, one-way edge, unreachable, structurally valid', () => {
  const v = createSyntheticVenue();
  assert.deepEqual(validateVenueGraph(v.graph), []);
  assert.equal(v.getPlace('lobby')!.nodeIds[0], 'n/1');
  const p = findVenuePath(v.graph, 'n/1', 'n/5')!;
  assert.deepEqual(p.nodes, ['n/1', 'n/2', 'n/3', 'n/5']);
  assert.equal(p.costM, 56 + 61 + 120);
  assert.equal(findVenuePath(v.graph, 'n/5', 'n/1'), undefined); // 3->5 is one-way
  assert.equal(findVenuePath(v.graph, 'n/1', 'island'), undefined);
  assert.equal(findVenuePath(v.graph, 'n/1', 'GATE_01'), undefined);
  assert.equal(findVenuePath(v.graph, 'n/1', 'n/1')!.costM, 0);
});

// ---- Street routing: two synthetic street graphs through the real extracted calculation (B3c) ----
const CAP = 1.8;
const at = (lat: number, lng: number) => ({ lat, lng });
const route = (g: ReturnType<typeof streetGraphA>, origin: { lat: number; lng: number }, ids: string[], extra: Record<string, number[]> = {}, cap = CAP) =>
  findStreetRouteToTargets(g.graph, origin, ids.map((id) => ({ id, coordinate: at(9, 9), extraCostsM: extra[id] })), cap);

check('street graph A: shortest two-way route, geometry in travel order, costs split into street/connector', () => {
  const r = route(streetGraphA(), at(0, 0), ['P'])!;
  assert.equal(r.targetId, 'P');
  assert.equal(r.graphRoutedDistanceM, 300);
  assert.equal(r.totalDistanceM, 310);
  assert.deepEqual(r.topologyEdgeDistancesM, [150, 150, 10]);
  assert.deepEqual(r.topologyEdgeNames, ['Alpha Rd', undefined, undefined]);
  assert.deepEqual(r.coordinates, [at(0, 0), at(0, 0.001), at(0.0001, 0.0015), at(0, 0.002), at(9, 9)]);
  assert.equal(r.sanityCapExceeded, false);
  assert.equal(route(streetGraphA(), at(0, 0), ['P'], {}, 1.2)!.sanityCapExceeded, true, 'sanity ratio is caller policy');
});
check('street graph A: reversed two-way geometry, one-way edges honoured in one direction only', () => {
  const back = route(streetGraphA(), at(0, 0.002), ['Q'])!; // a3 -> a4 must not reverse the one-way a4 -> a3
  assert.equal(back.graphRoutedDistanceM, 150 + 150 + 200);
  assert.deepEqual(back.coordinates.slice(0, 3), [at(0, 0.002), at(0.0001, 0.0015), at(0, 0.001)]);
  assert.equal(route(streetGraphA(), at(0.001, 0.001), ['P'])!.graphRoutedDistanceM, 200); // a4 -> a3 forward
});
check('street routing minimises connector + extra arrival costs, not just the street leg', () => {
  assert.equal(route(streetGraphA(), at(0, 0), ['P', 'Q'])!.targetId, 'Q'); // 205 < 310
  assert.equal(route(streetGraphA(), at(0, 0), ['P', 'Q'], { Q: [100, 100] })!.targetId, 'P'); // 405 > 310
  const snap = route(streetGraphA(), at(0.0005, 0), ['P'])!; // ~55 m off a1: snap leg becomes a real first hop
  assert.deepEqual(snap.coordinates[0], at(0.0005, 0));
  assert.ok(snap.topologyEdgeDistancesM[0] > 50 && snap.totalDistanceM === snap.topologyEdgeDistancesM[0] + 310);
});
check('street routing: unreachable, unknown and connector-less targets return undefined', () => {
  const a = streetGraphA();
  assert.equal(route(a, at(0, 0), ['Lost']), undefined);
  assert.equal(route(a, at(0, 0), ['Nope', '__proto__', 'constructor']), undefined);
  assert.equal(route(a, at(0, 0), []), undefined);
  assert.equal(route(streetGraphB(), at(1, 1.001), ['R']), undefined); // b2 is a one-way dead end
});
check('two graphs share node id "x" with different connectivity; interleaved requests never leak state', () => {
  const a = streetGraphA();
  const b = streetGraphB();
  const fromA = () => route(a, at(0, 0.001), ['P']);
  const fromB = () => route(b, at(1, 1), ['P', 'R']);
  const firstA = fromA()!;
  const firstB = fromB()!;
  assert.deepEqual([firstA.targetId, firstA.totalDistanceM], ['P', 160]);
  assert.deepEqual([firstB.targetId, firstB.totalDistanceM], ['R', 123]);
  assert.equal(route(b, at(1, 1), ['P'])!.totalDistanceM, 507);
  for (let i = 0; i < 5; i++) {
    assert.deepEqual(fromB(), firstB);
    assert.deepEqual(fromA(), firstA);
  }
  const before = a.reads.edgesFrom;
  fromB();
  assert.equal(a.reads.edgesFrom, before, 'routing graph B read nothing from graph A');
  assert.deepEqual(route(streetGraphA(), at(0, 0.001), ['P']), firstA, 'a fresh instance gives the same answer');
});
check('street inputs stay frozen and unmutated', () => {
  const a = streetGraphA();
  const snapshot = JSON.stringify(a.input);
  const targets = Object.freeze([Object.freeze({ id: 'P', coordinate: Object.freeze(at(9, 9)), extraCostsM: Object.freeze([1, 2]) })]);
  assert.ok(findStreetRouteToTargets(a.graph, Object.freeze(at(0, 0)), targets, CAP));
  assert.equal(JSON.stringify(a.input), snapshot);
  assert.ok(Object.isFrozen(a.graph.edgesFrom('a1')[0]));
});

// ---- Runtime dependency graph: everything loaded must be the emitted domain itself ----
check('loaded module graph contains only emitted domain files (so no node_modules, RN, Expo, Zustand, app code or Ijtema data)', () => {
  const loaded = Object.keys(require.cache).filter((f) => f !== __filename && !/\/synthetic(Venue|Streets)\.js$/.test(f));
  assert.ok(loaded.length >= 7, `unexpectedly small module graph: ${loaded.length}`);
  for (const f of loaded) {
    assert.match(f, /\/packages\/offline-navigation\/src\/domain\//, `non-domain module loaded: ${f}`);
  }
});

console.log(`sdk-headless: PASS (${passed} checks, node ${process.version})`);

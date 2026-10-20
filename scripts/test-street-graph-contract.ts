// B3c: the Ijtema street adapter is a zero-copy view of the bundled street graph, the extracted street search
// reproduces production outside routes through it, and the default outside route needs no reachable server.
import { strict as assert } from 'node:assert';
import { createHash } from 'node:crypto';
import { findStreetRouteToTargets } from '../packages/offline-navigation/src/domain/street';
import { IJTEMA_GATES } from '../src/data/ijtema/gates';
import { createStreetRoutingGraph, getIjtemaStreetRoutingGraph } from '../src/data/ijtema/streetAdapter';
import { findNearestStreetNode, getStreetNavigationGraph } from '../src/data/ijtema/streetGraphBuilder';
import { DISTANCE_SANITY_CAP_RATIO, isWithinStreetGraphRadius, selectStreetGraphOutsidePath } from '../src/services/OutsideStreetRoutingService';
import { createProductionOutsideRouteSource } from '../src/services/outsideRouting/ProductionOutsideRouteSource';
import { RoutingServiceV2 } from '../src/services/RoutingServiceV2';
import { haversineM } from '../src/utils/SpatialGrid';
import { createSyntheticStreetGraph, streetGraphA, streetGraphB } from './sdk-headless/syntheticStreets';

const raw = getStreetNavigationGraph();
const street = getIjtemaStreetRoutingGraph();
let checks = 0;
const check = (name: string, fn: () => void | Promise<void>) => Promise.resolve(fn()).then(() => { checks++; console.log(`  ok - ${name}`); });

const run = async () => {
  await check('adapter is a lazily bound singleton and copies nothing', () => {
    assert.equal(getIjtemaStreetRoutingGraph(), street);
    const ids = Object.keys(raw.nodes);
    assert.equal(ids.length, raw.metadata.simplifiedNodeCount);
    assert.equal(raw.edges.length, raw.metadata.simplifiedEdgeCount);
    let directed = 0;
    for (const id of ids) {
      assert.equal(street.getNode(id), raw.nodes[id]);
      if (raw.adjacency[id]) assert.equal(street.edgesFrom(id), raw.adjacency[id]);
      else assert.deepEqual(street.edgesFrom(id), []);
      directed += street.edgesFrom(id).length;
    }
    const oneWay = raw.edges.filter((e) => e.direction !== 'both').length;
    assert.equal(directed, 2 * raw.edges.length - oneWay, 'two-way edges appear under both endpoints, one-way under one');
    console.log(`     ${ids.length} nodes, ${raw.edges.length} edges (${oneWay} one-way), ${directed} directed adjacency entries`);
  });

  await check('adapter lookups are prototype-safe and match the builder', () => {
    for (const id of ['__proto__', 'constructor', 'toString', 'S-1']) {
      assert.equal(street.getNode(id), undefined);
      assert.deepEqual(street.edgesFrom(id), []);
      assert.equal(street.connectorFor(id), undefined);
    }
    for (const gateId of Object.keys(raw.gateConnectors)) assert.equal(street.connectorFor(gateId), raw.gateConnectors[gateId]);
    const { centerLat, centerLng } = raw.metadata;
    for (let i = 0; i < 25; i++) {
      const p = { lat: centerLat - 0.02 + i * 0.0017, lng: centerLng + 0.015 - i * 0.0013 };
      assert.deepEqual(street.nearestNode(p), findNearestStreetNode(p));
    }
  });

  await check('production wrapper and an explicitly supplied graph give identical routes', () => {
    const own = createStreetRoutingGraph(raw); // second, independently indexed view of the same data
    const gates = IJTEMA_GATES.filter((g) => g.coordinate);
    const hash = createHash('sha256');
    for (let i = 0; i < 12; i++) {
      const origin = { lat: raw.metadata.centerLat - 0.012 + i * 0.002, lng: raw.metadata.centerLng - 0.01 + i * 0.0018 };
      const viaDefault = selectStreetGraphOutsidePath(origin, gates);
      assert.deepEqual(selectStreetGraphOutsidePath(origin, gates, undefined, own), viaDefault);
      const bare = findStreetRouteToTargets(street, origin, gates.map((g) => ({ id: g.id, coordinate: g.coordinate! })), DISTANCE_SANITY_CAP_RATIO);
      assert.equal(bare?.targetId, viaDefault?.gate.id, `origin ${i}: bare search picked a different gate`);
      hash.update(JSON.stringify(viaDefault));
    }
    // Pinned from the pre-extraction service at e79cd0b (same 12 origins, all gates with a coordinate).
    assert.equal(hash.digest('hex'), PINNED_ROUTES_SHA256);
  });

  await check('B3d-A: Ijtema coverage is bit-identical to the pre-B3d-A metadata radius test', () => {
    const { centerLat, centerLng, radiusM } = raw.metadata;
    const own = createStreetRoutingGraph(raw);
    const degPerM = 1 / 111_320;
    let inside = 0;
    for (let i = 0; i < 400; i++) {
      // Rings straddling the boundary (0.5x .. 1.5x radius) plus a few points within a millimetre of it.
      const scale = i < 360 ? 0.5 + (i % 40) / 39 : 1 + ((i % 2 ? 1 : -1) * 1e-3) / radiusM;
      const bearing = (i * 137.508 * Math.PI) / 180;
      const p = Object.freeze({
        lat: centerLat + Math.cos(bearing) * radiusM * scale * degPerM,
        lng: centerLng + (Math.sin(bearing) * radiusM * scale * degPerM) / Math.cos((centerLat * Math.PI) / 180),
      });
      const before = haversineM(p.lat, p.lng, centerLat, centerLng) <= radiusM; // the exact pre-B3d-A expression
      assert.equal(isWithinStreetGraphRadius(p), before, `point ${i}`);
      assert.equal(isWithinStreetGraphRadius(p, street), before);
      assert.equal(isWithinStreetGraphRadius(p, own), before);
      if (before) inside++;
    }
    assert.ok(inside > 50 && inside < 350, `boundary sample is two-sided (${inside} inside)`);
  });

  await check('B3d-A: coverage comes only from the supplied graph (synthetic isolation, no global fallback, no mutation)', () => {
    const a = streetGraphA();
    const b = streetGraphB();
    const snapshot = JSON.stringify([a.input, b.input]);
    const centreA = Object.freeze({ lat: 0, lng: 0.001 });
    const centreB = Object.freeze({ lat: 1, lng: 1 });
    const ijtema = Object.freeze({ lat: raw.metadata.centerLat, lng: raw.metadata.centerLng });
    assert.deepEqual([centreA, centreB, ijtema].map((p) => isWithinStreetGraphRadius(p, a.graph)), [true, false, false]);
    assert.deepEqual([centreA, centreB, ijtema].map((p) => isWithinStreetGraphRadius(p, b.graph)), [false, true, false]);
    assert.deepEqual([centreA, centreB, ijtema].map((p) => isWithinStreetGraphRadius(p)), [false, false, true]);
    assert.equal(isWithinStreetGraphRadius({ lat: 1, lng: 1.0028 }, b.graph), false, 'graph B uses its own 300 m radius');
    assert.equal(isWithinStreetGraphRadius({ lat: 0, lng: 0.005 }, a.graph), true, 'graph A uses its own 500 m radius (~445 m out)');
    assert.equal(JSON.stringify([a.input, b.input]), snapshot);
    // The Ijtema adapter reads its own graph's metadata, not the bundled singleton's.
    const moved = createStreetRoutingGraph({ ...raw, metadata: { ...raw.metadata, centerLat: 0, centerLng: 0.001 } });
    assert.deepEqual([centreA, ijtema].map((p) => isWithinStreetGraphRadius(p, moved)), [true, false]);
  });

  await check('B3d-B: production outside paths route on the supplied street graph only (no Ijtema fallback)', async () => {
    const gate = IJTEMA_GATES.find((g) => g.id === 'GATE_12')!.coordinate!;
    const origin = { latitude: 24.9762, longitude: 67.011 };
    // A private one-street graph between the same origin and GATE_12, deliberately unlike the Ijtema streets.
    const own = createSyntheticStreetGraph({
      nodes: [{ id: 's', lat: origin.latitude, lng: origin.longitude }, { id: 'g', lat: gate.lat, lng: gate.lng }],
      ways: [{ from: 's', to: 'g', distanceM: 777, name: 'Own Rd' }],
      connectors: { GATE_12: { nodeId: 'g', distanceM: 0 } },
      coverage: { lat: origin.latitude, lng: origin.longitude, radiusM: 5000 },
    });
    const a = streetGraphA();
    const b = streetGraphB();
    const snapshot = JSON.stringify([own.input, a.input, b.input]);

    const viaDefault = RoutingServiceV2.resolveOfflineOsmOutsideCandidate(origin, 'GATE_12');
    assert.ok(viaDefault && viaDefault.outsideDistanceM !== 777);
    assert.deepEqual(RoutingServiceV2.resolveOfflineOsmOutsideCandidate(origin, 'GATE_12', street), viaDefault);
    assert.equal(RoutingServiceV2.resolveOfflineOsmOutsideCandidate(origin, 'GATE_12', own.graph)?.outsideDistanceM, 777);
    assert.ok(own.reads.edgesFrom > 0, 'the supplied graph was actually searched');
    // Neither synthetic graph covers Karachi, so both must refuse rather than quietly use the bundled graph.
    for (const g of [a, b]) assert.equal(RoutingServiceV2.resolveOfflineOsmOutsideCandidate(origin, 'GATE_12', g.graph), null);
    // Graph A covers its own centre but has no GATE_12 connector: still no route, not an Ijtema one.
    assert.equal(RoutingServiceV2.resolveOfflineOsmOutsideCandidate({ latitude: 0, longitude: 0.001 }, 'GATE_12', a.graph), null);

    const realFetch = globalThis.fetch;
    let fetches = 0;
    globalThis.fetch = (async () => { fetches++; throw new TypeError('Network request failed'); }) as typeof fetch;
    try {
      const request = () => ({
        token: { requestId: 'b3d-b', requestVersion: 1 },
        origin,
        gates: [{ gateId: 'GATE_12', gateCoordinate: { latitude: gate.lat, longitude: gate.lng }, routeTargetCoordinate: { latitude: gate.lat, longitude: gate.lng } }],
        signal: new AbortController().signal,
      });
      const ownRoute = await createProductionOutsideRouteSource({ streetGraph: own.graph }).routeToGates(request());
      assert.equal(ownRoute.status === 'success' && ownRoute.candidateSet.provider, 'offline-osm');
      const outcome = ownRoute.status === 'success' ? ownRoute.candidateSet.outcomes[0] : undefined;
      assert.equal(outcome?.status === 'routed' && outcome.routes[0].distanceM, 777);
      const uncovered = await createProductionOutsideRouteSource({ streetGraph: b.graph }).routeToGates(request());
      assert.notEqual(uncovered.status === 'success' && uncovered.candidateSet.provider, 'offline-osm', 'graph B falls to the direct guide');
      assert.equal(fetches, 0);
    } finally {
      globalThis.fetch = realFetch;
    }
    assert.equal(JSON.stringify([own.input, a.input, b.input]), snapshot);
  });

  await check('default outside route is offline: OSM street graph wins with every network call failing', async () => {
    const realFetch = globalThis.fetch;
    let fetches = 0;
    globalThis.fetch = (async () => { fetches++; throw new TypeError('Network request failed'); }) as typeof fetch;
    try {
      const gate = IJTEMA_GATES.find((g) => g.id === 'GATE_12')!;
      const target = { latitude: gate.coordinate!.lat, longitude: gate.coordinate!.lng };
      const request = () => ({
        token: { requestId: 'offline', requestVersion: 1 },
        origin: { latitude: 24.9762, longitude: 67.011 },
        gates: [{ gateId: gate.id, gateCoordinate: target, routeTargetCoordinate: target }],
        signal: new AbortController().signal,
      });
      const byDefault = await createProductionOutsideRouteSource().routeToGates(request());
      assert.equal(byDefault.status === 'success' && byDefault.candidateSet.provider, 'offline-osm');
      assert.equal(fetches, 0, 'default policy never touches the network');
      const withDiagnostic = await createProductionOutsideRouteSource({
        googleProxyBaseUrl: 'https://routing.example.test', enableGoogleDiagnosticProxy: true,
      }).routeToGates(request());
      assert.ok(fetches > 0, 'diagnostic opt-in really attempts the proxy');
      assert.equal(withDiagnostic.status === 'success' && withDiagnostic.candidateSet.provider, 'offline-osm');
    } finally {
      globalThis.fetch = realFetch;
    }
  });
};

const PINNED_ROUTES_SHA256 = '8692f3ea6d30c1fb91617e36db17b98b084a3c886f76a6e4e95ee1f9db04e5d3';

run().then(
  () => console.log(`test-street-graph-contract.ts: all ${checks} checks passed`),
  (e) => { console.error(e); process.exit(1); },
);

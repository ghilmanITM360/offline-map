// B3c: the Ijtema street adapter is a zero-copy view of the bundled street graph, the extracted street search
// reproduces production outside routes through it, and the default outside route needs no reachable server.
import { strict as assert } from 'node:assert';
import { createHash } from 'node:crypto';
import { findStreetRouteToTargets } from '../packages/offline-navigation/src/domain/street';
import { IJTEMA_GATES } from '../src/data/ijtema/gates';
import { createStreetRoutingGraph, getIjtemaStreetRoutingGraph } from '../src/data/ijtema/streetAdapter';
import { findNearestStreetNode, getStreetNavigationGraph } from '../src/data/ijtema/streetGraphBuilder';
import { DISTANCE_SANITY_CAP_RATIO, selectStreetGraphOutsidePath } from '../src/services/OutsideStreetRoutingService';
import { createProductionOutsideRouteSource } from '../src/services/outsideRouting/ProductionOutsideRouteSource';

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

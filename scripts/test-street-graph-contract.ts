// B3c: the Ijtema street adapter is a zero-copy, prototype-safe view of the bundled street graph.
import { strict as assert } from 'node:assert';
import { getIjtemaStreetRoutingGraph } from '../src/data/ijtema/streetAdapter';
import { findNearestStreetNode, getStreetNavigationGraph } from '../src/data/ijtema/streetGraphBuilder';

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
};

run().then(
  () => console.log(`test-street-graph-contract.ts: all ${checks} checks passed`),
  (e) => { console.error(e); process.exit(1); },
);

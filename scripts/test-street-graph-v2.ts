import { strict as assert } from 'node:assert';
import { IJTEMA_GATES } from '../src/data/ijtema/gates';
import { IJTEMA_STREET_GRAPH_DATA } from '../src/data/ijtema/streetGraph';
import {
  buildStreetNavigationGraph,
  findNearestStreetNode,
  getStreetGraphSpatialIndex,
  getStreetNavigationGraph,
} from '../src/data/ijtema/streetGraphBuilder';
import { haversineM } from '../src/utils/SpatialGrid';
import { PEDESTRIAN_PROFILE_VERSION } from './pedestrianProfile';

const GATE_CONNECTOR_MAX_M = 320;
// Same distance sanity-cap ratio approved for graph-routed segments in
// docs/NAVIGATION_AND_ROUTING.md — an edge's travel distance vs.
// the straight-line distance between its endpoints should never exceed this,
// or it signals corrupted/out-of-order geometry (the RASTA_06-class bug
// dataIssues.ts already guards against for the venue graph).
const DISTANCE_SANITY_CAP_RATIO = 1.8;

const data = IJTEMA_STREET_GRAPH_DATA;
const graph = buildStreetNavigationGraph(data);
assert.equal(graph.metadata.pedestrianProfileVersion, PEDESTRIAN_PROFILE_VERSION, 'production graph must be generated with the current pedestrian profile');
assert.equal(data.edgeDirection?.length, data.edgeFrom.length, 'every edge must preserve pedestrian direction metadata');
assert.equal(data.edgeProfileIndex?.length, data.edgeFrom.length, 'every edge must preserve compact profile diagnostics');

// ─── Basic shape ───────────────────────────────────────────────────────────
{
  const nodeCount = Object.keys(graph.nodes).length;
  const edgeCount = graph.edges.length;
  assert.ok(nodeCount > 1000, `expected several thousand nodes, got ${nodeCount}`);
  assert.ok(edgeCount > 1000, `expected several thousand edges, got ${edgeCount}`);
  assert.equal(nodeCount, data.metadata.simplifiedNodeCount);
  assert.equal(edgeCount, data.metadata.simplifiedEdgeCount);
  console.log(`Street graph: ${nodeCount} nodes, ${edgeCount} edges (simplified from ${data.metadata.rawNodeCount} raw nodes / ${data.metadata.rawEdgeCount} raw edges).`);
}

// ─── No excluded highway classes leaked through ────────────────────────────
{
  assert.ok(data.metadata.excludedConstructionWayCount >= 1, 'expected at least the known construction-tagged way to be excluded');
  assert.ok(data.metadata.excludedDisconnectedNodeCount >= 0);
}

// ─── Connectivity: BFS from an arbitrary node should reach (almost) every node ──
{
  const nodeIds = Object.keys(graph.nodes);
  const start = nodeIds[0];
  const visited = new Set<string>([start]);
  const queue = [start];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const edge of graph.adjacency[current] ?? []) {
      if (!visited.has(edge.to)) {
        visited.add(edge.to);
        queue.push(edge.to);
      }
    }
  }
  const reachableRatio = visited.size / nodeIds.length;
  assert.ok(
    reachableRatio > 0.99,
    `expected the simplified graph to be almost entirely one connected component, got ${(reachableRatio * 100).toFixed(2)}% reachable from an arbitrary start node`,
  );
  console.log(`Connectivity: ${visited.size}/${nodeIds.length} nodes reachable from an arbitrary start (${(reachableRatio * 100).toFixed(2)}%).`);
}

// ─── Edge distances are sane (no zero/negative, internally consistent geometry) ──
// A whole-edge travel-vs-straight-line ratio (the 1.8x cap used for outside-leg
// *route* sanity in FINAL_SPEC) isn't the right test for individual street
// segments — a short, legitimately winding residential street can easily
// exceed 1.8x between its two endpoints without anything being wrong.
// A single-hop-distance check (consecutive points in one edge's own polyline)
// is closer to what would catch corrupted/out-of-order OSM geometry (the
// RASTA_06-class bug), but real OSM data legitimately includes sparsely
// digitized straight boundary/arterial roads with hops of several hundred
// meters — so this is reported as a warning list for human review, not a
// hard gate; genuine data corruption (not sparse-but-real digitization) is
// something a human should confirm by inspecting the flagged edges' geometry
// against a map, same as the RASTA_06 fix itself required.
const HOP_WARNING_THRESHOLD_M = 250;
{
  let maxHopM = 0;
  const warnings: string[] = [];

  for (const edge of graph.edges) {
    assert.ok(edge.distanceM > 0, `edge ${edge.id} has non-positive distance ${edge.distanceM}`);

    const from = graph.nodes[edge.from];
    const to = graph.nodes[edge.to];
    const sequence = [
      { lat: from.lat, lng: from.lng },
      ...(edge.geometry ?? []),
      { lat: to.lat, lng: to.lng },
    ];

    let hopSumM = 0;
    for (let i = 1; i < sequence.length; i += 1) {
      const hopM = haversineM(sequence[i - 1].lat, sequence[i - 1].lng, sequence[i].lat, sequence[i].lng);
      hopSumM += hopM;
      maxHopM = Math.max(maxHopM, hopM);
      if (hopM > HOP_WARNING_THRESHOLD_M) {
        warnings.push(`  ${edge.id}: ${hopM.toFixed(1)}m single hop (edge total ${edge.distanceM}m)`);
      }
    }

    // Internal consistency: stored distanceM should match the sum of hops
    // along the edge's own geometry (small float rounding tolerance only).
    // This is a hard gate — it catches a real generator bug, not raw OSM
    // data quality variance.
    assert.ok(
      Math.abs(hopSumM - edge.distanceM) < 1,
      `edge ${edge.id} stored distanceM ${edge.distanceM}m doesn't match its own geometry hop sum ${hopSumM.toFixed(2)}m`,
    );
  }

  console.log(`Distance sanity check: all edges internally consistent with their own geometry (worst single hop: ${maxHopM.toFixed(1)}m).`);
  if (warnings.length > 0) {
    console.log(`  ${warnings.length} edge(s) have a hop over ${HOP_WARNING_THRESHOLD_M}m — worth a human spot-check against a map, not necessarily a bug (sparsely-digitized real roads produce these too):`);
    warnings.slice(0, 10).forEach((line) => console.log(line));
    if (warnings.length > 10) console.log(`  ... and ${warnings.length - 10} more`);
  }
}

// ─── Whole-edge sanity-cap ratio is still reported (informational, not a hard gate) ──
{
  let maxRatio = 0;
  for (const edge of graph.edges) {
    const from = graph.nodes[edge.from];
    const to = graph.nodes[edge.to];
    const straightLineM = haversineM(from.lat, from.lng, to.lat, to.lng);
    if (straightLineM < 1) continue;
    maxRatio = Math.max(maxRatio, edge.distanceM / straightLineM);
  }
  console.log(`Informational: worst single-edge travel/straight-line ratio observed: ${maxRatio.toFixed(2)}x (${DISTANCE_SANITY_CAP_RATIO}x cap applies to whole outside-leg routes, not individual street segments — see FINAL_SPEC).`);
}

// ─── Gate connectors: every routable gate with a coordinate must have a connector ≤320m ──
{
  const routableGatesWithCoordinate = IJTEMA_GATES.filter((gate) => gate.coordinate && gate.canStartRouteFromOutside);
  for (const gate of routableGatesWithCoordinate) {
    const connector = graph.gateConnectors[gate.id];
    assert.ok(connector, `expected a street-graph connector for ${gate.id}`);
    assert.ok(
      connector.distanceM <= GATE_CONNECTOR_MAX_M,
      `${gate.id} connector distance ${connector.distanceM}m exceeds ${GATE_CONNECTOR_MAX_M}m threshold`,
    );
    const node = graph.nodes[connector.nodeId];
    assert.ok(node, `connector for ${gate.id} references missing node ${connector.nodeId}`);
  }
  console.log(`Gate connectors: ${routableGatesWithCoordinate.length}/${routableGatesWithCoordinate.length} gates connected, all within ${GATE_CONNECTOR_MAX_M}m.`);
}

// ─── Spatial index matches brute force on a real sample of street-graph nodes ──
{
  const spatialIndex = getStreetGraphSpatialIndex();
  const nodeList = Object.values(graph.nodes);
  const sampleSize = 100;
  for (let i = 0; i < sampleSize; i += 1) {
    const probe = nodeList[Math.floor((i / sampleSize) * nodeList.length)];
    // Query a point slightly offset from a known node — grid result must match brute force.
    const queryLat = probe.lat + (Math.random() - 0.5) * 0.001;
    const queryLng = probe.lng + (Math.random() - 0.5) * 0.001;

    let bruteBest: { id: string; distanceM: number } | undefined;
    for (const node of nodeList) {
      const distanceM = haversineM(queryLat, queryLng, node.lat, node.lng);
      if (!bruteBest || distanceM < bruteBest.distanceM) bruteBest = { id: node.id, distanceM };
    }

    const gridResult = spatialIndex.nearest(queryLat, queryLng);
    assert.ok(gridResult, `spatial index returned nothing for sample ${i}`);
    assert.ok(
      Math.abs(gridResult!.distanceM - bruteBest!.distanceM) < 1e-6,
      `sample ${i}: spatial index found ${gridResult!.distanceM}m, brute force found ${bruteBest!.distanceM}m`,
    );
  }
  console.log(`Spatial index: ${sampleSize}/${sampleSize} sampled queries matched brute-force nearest node.`);
}

// ─── findNearestStreetNode / getStreetNavigationGraph singleton wiring ─────
{
  const graphSingleton = getStreetNavigationGraph();
  assert.equal(Object.keys(graphSingleton.nodes).length, Object.keys(graph.nodes).length);

  const venueCenter = { lat: data.metadata.centerLat, lng: data.metadata.centerLng };
  const nearest = findNearestStreetNode(venueCenter);
  assert.ok(nearest, 'expected findNearestStreetNode to resolve a node near the venue center');
  assert.ok(nearest!.distanceM < 500, `nearest node to venue center is implausibly far: ${nearest!.distanceM}m`);
}

console.log('test-street-graph-v2.ts: all assertions passed');

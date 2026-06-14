import { strict as assert } from 'node:assert';
import {
  IJTEMA_BLOCKS,
  IJTEMA_GATES,
  IJTEMA_NAVIGATION_GRAPH_V2,
  IJTEMA_NAVIGATION_GRAPH_V2_REPORT,
  IJTEMA_RASTAS,
  IJTEMA_SPECIAL_ROUTES,
  getBlockEntryNodeIds,
} from '../src/data/ijtema';

const internalIdPattern = /\b(?:R\d+-\d+|SPNP-\d+|SPSP-\d+|SPWP-\d+|P\d+|B\d+_C\d+)\b/;

const graph = IJTEMA_NAVIGATION_GRAPH_V2;
const nodeIds = Object.keys(graph.nodes);
const edgeIds = graph.edges.map((edge) => edge.id);

assert(nodeIds.length > 0, 'v2 graph must have nodes');
assert(graph.edges.length > 0, 'v2 graph must have edges');
assert.equal(graph.metadata.source, 'ijtema_v2', 'v2 graph metadata source');
assert.equal(graph.metadata.version, '2026-06-ijtema-v2-navigation-graph', 'v2 graph metadata version');
assert.equal(new Set(nodeIds).size, nodeIds.length, 'v2 graph node IDs must be unique');
assert.equal(new Set(edgeIds).size, edgeIds.length, 'v2 graph edge IDs must be unique');

for (const edge of graph.edges) {
  assert(graph.nodes[edge.from], `${edge.id} references missing from node ${edge.from}`);
  assert(graph.nodes[edge.to], `${edge.id} references missing to node ${edge.to}`);
  assert(edge.distanceM > 0, `${edge.id} must have positive distance`);
  assert(edge.distanceM < 1200, `${edge.id} distance must be plausible`);
  assert(edge.name.en.trim().length > 0, `${edge.id} must have a friendly English name`);
  assert(edge.name.ur?.trim().length, `${edge.id} must have a friendly Urdu name`);
  assert(!internalIdPattern.test(edge.name.en), `${edge.id} normal edge name must not expose internal IDs`);
}

for (const rasta of IJTEMA_RASTAS) {
  for (let i = 0; i < rasta.points.length - 1; i += 1) {
    const from = rasta.points[i].id;
    const to = rasta.points[i + 1].id;
    assert(graph.nodes[from], `${from} rasta node missing`);
    assert(graph.nodes[to], `${to} rasta node missing`);
    assert(
      graph.edges.some((edge) => edge.from === from && edge.to === to && edge.pathType === 'rasta'),
      `${from}->${to} sequential rasta edge missing`,
    );
  }
}

const rasta9NodeIds = nodeIds.filter((id) => id.startsWith('R9-')).sort();
assert.deepEqual(rasta9NodeIds, ['R9-01', 'R9-02', 'R9-03', 'R9-04', 'R9-05', 'R9-06', 'R9-07', 'R9-08', 'R9-09'], 'Rasta 09 must use normalized R9 IDs');

const perimeterNodeIds = nodeIds.filter((id) => id.startsWith('NPC-')).sort();
assert.deepEqual(perimeterNodeIds, ['NPC-01', 'NPC-02'], 'Hidden north perimeter connector must keep two internal bridge nodes');
assert(
  graph.edges.some((edge) => edge.from === 'NPC-01' && edge.to === 'NPC-02' && edge.pathType === 'perimeter_connector'),
  'Hidden north perimeter bridge must use perimeter_connector path type instead of public rasta path type',
);
assert(
  graph.edges.some(
    (edge) =>
      edge.pathType === 'intersection_connector' &&
      ((edge.from === 'NPC-01' && edge.to === 'R7-01') || (edge.from === 'R7-01' && edge.to === 'NPC-01')) &&
      edge.distanceM <= 12,
  ),
  'Hidden north perimeter bridge must connect into Rasta 07 near R7-01',
);
assert(
  graph.edges.some(
    (edge) =>
      edge.pathType === 'intersection_connector' &&
      ((edge.from === 'NPC-02' && edge.to === 'R8-01') || (edge.from === 'R8-01' && edge.to === 'NPC-02')) &&
      edge.distanceM <= 12,
  ),
  'Hidden north perimeter bridge must connect into Rasta 08 near R8-01',
);

for (const route of IJTEMA_SPECIAL_ROUTES) {
  for (let i = 0; i < route.points.length - 1; i += 1) {
    const from = route.points[i].id;
    const to = route.points[i + 1].id;
    assert(graph.nodes[from], `${from} special route node missing`);
    assert(graph.nodes[to], `${to} special route node missing`);
    assert(
      graph.edges.some((edge) => edge.from === from && edge.to === to && edge.pathType === 'special_route'),
      `${from}->${to} sequential special route edge missing`,
    );
  }
}

for (const gate of IJTEMA_GATES) {
  if (gate.routingStatus === 'missing_coordinate') {
    assert(!graph.nodes[gate.id], `${gate.id} missing-coordinate gate must not become a graph node`);
    assert(!IJTEMA_NAVIGATION_GRAPH_V2_REPORT.gateConnectors.some((item) => item.gateId === gate.id), `${gate.id} missing-coordinate gate must not have connector report`);
  } else {
    assert(graph.nodes[gate.id], `${gate.id} provided gate must be a graph node`);
    const connectorReport = IJTEMA_NAVIGATION_GRAPH_V2_REPORT.gateConnectors.find((item) => item.gateId === gate.id);
    assert(connectorReport, `${gate.id} must connect to graph or produce an explicit warning`);
    assert(connectorReport.connected || connectorReport.warning, `${gate.id} must be connected or explicitly warned`);
  }
}

for (const block of IJTEMA_BLOCKS) {
  const entryIds = getBlockEntryNodeIds(block.id);
  assert.deepEqual(entryIds, [`${block.id}_C1`, `${block.id}_C2`, `${block.id}_C3`, `${block.id}_C4`], `${block.id} must expose four candidate entries`);
  entryIds.forEach((entryId) => {
    const node = graph.nodes[entryId];
    assert(node, `${entryId} block entry node missing`);
    assert.equal(node.type, 'block_entry', `${entryId} must be a block entry node`);
    assert(!internalIdPattern.test(node.name.en), `${entryId} normal label must not expose internal IDs`);
  });
  assert(
    IJTEMA_NAVIGATION_GRAPH_V2_REPORT.blockEntryConnectors.some((item) => item.blockId === block.id && item.connected),
    `${block.id} must have at least one connected route candidate entry`,
  );
}

assert(IJTEMA_NAVIGATION_GRAPH_V2_REPORT.intersectionConnectors.length > 0, 'v2 graph should create conservative intersection connectors');

console.log(
  `Navigation graph v2 checks passed: ${nodeIds.length} nodes, ${graph.edges.length} edges, ${IJTEMA_NAVIGATION_GRAPH_V2_REPORT.intersectionConnectors.length} intersections.`,
);

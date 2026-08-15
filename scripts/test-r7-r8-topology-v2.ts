import assert from 'node:assert/strict';

import { IJTEMA_NAVIGATION_GRAPH_V2 } from '../src/data/ijtema/navigationGraph';
import { IJTEMA_RASTAS } from '../src/data/ijtema/rastas';
import { V2MapRenderingService } from '../src/services/V2MapRenderingService';

const expectedSegments = [
  ['R7-01', 'R7-02', 'R7-03', 'R7-04'],
  ['R7-05', 'R7-06', 'R7-07', 'R7-08'],
  ['R8-01', 'R8-02', 'R8-03'],
  ['R8-04', 'R8-05', 'R8-06'],
  ['R8-07', 'R8-08', 'R8-09', 'R8-10'],
] as const;

const expectedJunctions = [
  ['R7-03', 'R7-06'],
  ['R8-01', 'R8-05'],
  ['R8-02', 'R8-08'],
] as const;

const forbiddenEdges = [
  ['R7-04', 'R7-05'],
  ['R8-03', 'R8-04'],
  ['R8-06', 'R8-07'],
] as const;

const authoritativeNewNodeCoordinates = {
  'R7-05': { lat: 24.972557, lng: 67.006536 },
  'R7-06': { lat: 24.972550, lng: 67.007154 },
  'R7-07': { lat: 24.972543, lng: 67.008944 },
  'R7-08': { lat: 24.972495, lng: 67.010625 },
  'R8-04': { lat: 24.974910, lng: 67.007261 },
  'R8-05': { lat: 24.974945, lng: 67.008926 },
  'R8-06': { lat: 24.975059, lng: 67.010935 },
  'R8-07': { lat: 24.973377, lng: 67.007191 },
  'R8-08': { lat: 24.973346, lng: 67.008916 },
  'R8-09': { lat: 24.973348, lng: 67.010156 },
  'R8-10': { lat: 24.973345, lng: 67.010741 },
} as const;

const expectedIncidentEdges = [
  'block_connector:B25_C2<->R8-04',
  'block_connector:B25_C3<->R7-05',
  'block_connector:B25_C4<->R7-06',
  'block_connector:B26_C1<->R8-04',
  'block_connector:B26_C3<->R8-07',
  'block_connector:B26_C4<->R8-08',
  'block_connector:B27_C2<->R8-09',
  'block_connector:B27_C4<->R8-09',
  'block_connector:B28_C2<->R8-08',
  'block_connector:B29_C2<->R8-09',
  'block_connector:B29_C3<->R7-07',
  'block_connector:B29_C4<->R7-08',
  'block_connector:B30_C1<->R7-05',
  'block_connector:B32_C1<->R7-07',
  'block_connector:B32_C2<->R7-08',
  'gate_connector:GATE_17<->R7-08',
  'gate_connector:GATE_20<->R8-06',
  'intersection_connector:R6-02<->R7-05',
  'intersection_connector:R7-01<->R8-04',
  'intersection_connector:R7-02<->R8-07',
  'intersection_connector:R7-03<->R7-06',
  'intersection_connector:R7-07<->R8-03',
  'intersection_connector:R8-01<->R8-05',
  'intersection_connector:R8-02<->R8-08',
  'rasta:R7-05<->R7-06',
  'rasta:R7-06<->R7-07',
  'rasta:R7-07<->R7-08',
  'rasta:R8-04<->R8-05',
  'rasta:R8-05<->R8-06',
  'rasta:R8-07<->R8-08',
  'rasta:R8-08<->R8-09',
  'rasta:R8-09<->R8-10',
] as const;

const edgeExists = (from: string, to: string): boolean =>
  IJTEMA_NAVIGATION_GRAPH_V2.edges.some(
    (edge) =>
      (edge.from === from && edge.to === to) ||
      (edge.bidirectional && edge.from === to && edge.to === from),
  );

for (const nodeId of expectedSegments.flat()) {
  assert(IJTEMA_NAVIGATION_GRAPH_V2.nodes[nodeId], `${nodeId} must be present in the graph`);
}

for (const [nodeId, coordinate] of Object.entries(authoritativeNewNodeCoordinates)) {
  assert.deepEqual(
    IJTEMA_NAVIGATION_GRAPH_V2.nodes[nodeId]?.coordinate,
    coordinate,
    `${nodeId} must retain its authoritative coordinate`,
  );
}

for (const segment of expectedSegments) {
  for (let index = 0; index < segment.length - 1; index += 1) {
    assert(edgeExists(segment[index], segment[index + 1]), `${segment[index]} -> ${segment[index + 1]} must be connected`);
  }
}

for (const [from, to] of expectedJunctions) {
  assert(edgeExists(from, to), `${from} <-> ${to} surveyed same-Rasta junction must be connected`);
}

for (const [from, to] of forbiddenEdges) {
  assert(!edgeExists(from, to), `${from} -> ${to} artificial cross-segment diagonal must not exist`);
}

assert(
  !edgeExists('R8-05', 'NPC-02'),
  'R8-05 <-> NPC-02 undocumented proximity edge must not exist',
);

const newNodeIds = new Set(Object.keys(authoritativeNewNodeCoordinates));
const actualIncidentEdges = IJTEMA_NAVIGATION_GRAPH_V2.edges
  .filter(
    (edge) => newNodeIds.has(edge.from) || newNodeIds.has(edge.to),
  )
  .map((edge) => `${edge.pathType}:${[edge.from, edge.to].sort().join('<->')}`)
  .sort();

assert.deepEqual(
  actualIncidentEdges,
  [...expectedIncidentEdges].sort(),
  'New R7/R8 nodes must have exactly the documented incident edges of every path type',
);

for (const edge of IJTEMA_NAVIGATION_GRAPH_V2.edges) {
  assert(edge.distanceM > 0, `${edge.id} must not be zero length`);
}

assert.equal(
  IJTEMA_NAVIGATION_GRAPH_V2.adjacency.GATE_19?.length ?? 0,
  0,
  'Gate19 must remain disconnected until physical ground truth verifies its connector',
);

const layers = V2MapRenderingService.getHomeLayers({ mapFilter: 'rastas', zoomLevel: 17 });
for (const rastaId of ['R7', 'R8']) {
  const source = IJTEMA_RASTAS.find((rasta) => rasta.id === rastaId);
  assert(source, `${rastaId} source data must exist`);
  const renderedCoordinates = layers.rastas
    .filter((layer) => (layer.sourceId ?? layer.id) === rastaId)
    .flatMap((layer) => layer.polyline);
  for (const point of source.points) {
    assert(
      renderedCoordinates.some(
        (coordinate) =>
          coordinate.latitude === point.coordinate.lat &&
          coordinate.longitude === point.coordinate.lng,
      ),
      `${point.id} must be rendered by a ${rastaId} segment`,
    );
  }
}

console.log('R7/R8 branched topology checks passed.');

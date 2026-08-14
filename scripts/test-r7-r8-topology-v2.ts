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

const edgeExists = (from: string, to: string): boolean =>
  IJTEMA_NAVIGATION_GRAPH_V2.edges.some(
    (edge) =>
      (edge.from === from && edge.to === to) ||
      (edge.bidirectional && edge.from === to && edge.to === from),
  );

for (const nodeId of expectedSegments.flat()) {
  assert(IJTEMA_NAVIGATION_GRAPH_V2.nodes[nodeId], `${nodeId} must be present in the graph`);
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

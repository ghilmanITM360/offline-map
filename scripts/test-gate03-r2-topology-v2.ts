import assert from 'node:assert/strict';

import { IJTEMA_GATES } from '../src/data/ijtema/gates';
import { IJTEMA_NAVIGATION_GRAPH_V2, IJTEMA_NAVIGATION_GRAPH_V2_REPORT } from '../src/data/ijtema/navigationGraph';
import { IJTEMA_RASTAS } from '../src/data/ijtema/rastas';
import { RoutingServiceV2 } from '../src/services/RoutingServiceV2';
import { IJTEMA_BLOCKS } from '../src/data/ijtema/blocks';

// Owner-supplied ground truth (2026-08-16): Gate03 relocated, and Rasta02
// extended north with two new surveyed points, resolving Gate03's prior
// "no connector within 320m" block.
const authoritativeCoordinates = {
  GATE_03: { lat: 24.972114, lng: 67.001482 },
  'R2-06': { lat: 24.971520, lng: 67.001529 },
  'R2-07': { lat: 24.970929, lng: 67.001610 },
} as const;

for (const [nodeId, coordinate] of Object.entries(authoritativeCoordinates)) {
  assert.deepEqual(
    IJTEMA_NAVIGATION_GRAPH_V2.nodes[nodeId]?.coordinate,
    coordinate,
    `${nodeId} must carry its exact owner-supplied coordinate`,
  );
}

const edgeExists = (from: string, to: string): boolean =>
  IJTEMA_NAVIGATION_GRAPH_V2.edges.some(
    (edge) =>
      (edge.from === from && edge.to === to) ||
      (edge.bidirectional && edge.from === to && edge.to === from),
  );

// Physical continuation is Gate03 -> R2-06 -> R2-07 -> the pre-existing
// R2-01..R2-05 chain, even though R2-06/R2-07 are appended at the end of
// the Rasta02 point array (their IDs are fixed by the owner and must not
// be renumbered ahead of R2-01).
const expectedSegment = ['R2-06', 'R2-07', 'R2-01', 'R2-02', 'R2-03', 'R2-04', 'R2-05'];
for (let index = 0; index < expectedSegment.length - 1; index += 1) {
  assert(
    edgeExists(expectedSegment[index], expectedSegment[index + 1]),
    `${expectedSegment[index]} -> ${expectedSegment[index + 1]} must be connected`,
  );
}

// The naive default (connect points in raw array order) would wire
// R2-05 -> R2-06 directly, a ~600m artificial jump across the whole rasta.
// That must not exist.
assert(!edgeExists('R2-05', 'R2-06'), 'R2-05 -> R2-06 artificial long edge must not exist');

// Gate03 must connect only to its true nearest walkable node (R2-06), not
// to some other nearby-but-unrelated rasta/special-route point.
assert(edgeExists('GATE_03', 'R2-06'), 'GATE_03 must connect to R2-06');
assert(!edgeExists('GATE_03', 'R2-07'), 'GATE_03 must not skip R2-06 and connect directly to R2-07');
assert(!edgeExists('GATE_03', 'R2-01'), 'GATE_03 must not connect directly to R2-01, bypassing the new points');

const gate03ConnectorReport = IJTEMA_NAVIGATION_GRAPH_V2_REPORT.gateConnectors.find(
  (report) => report.gateId === 'GATE_03',
);
assert.equal(gate03ConnectorReport?.connected, true, 'GATE_03 connector report must show connected');
assert.equal(gate03ConnectorReport?.nearestNodeId, 'R2-06', 'GATE_03 nearest connector node must be R2-06');

// Gate03 must route into the internal graph and reach every block.
const gate03 = IJTEMA_GATES.find((gate) => gate.id === 'GATE_03');
assert(gate03, 'GATE_03 must exist in gate data');
assert.equal(gate03?.routingStatus, 'routable', 'GATE_03 must be routable with the new coordinate');

let reachable = 0;
for (const block of IJTEMA_BLOCKS) {
  const route = RoutingServiceV2.calculateRoute({
    start: { type: 'gate', gateId: 'GATE_03' },
    destination: { type: 'block', blockId: block.id },
  });
  if (route) reachable += 1;
}
assert.equal(reachable, IJTEMA_BLOCKS.length, 'GATE_03 must reach every routable block');

// Existing Rasta02 routing (R2-01..R2-05) must be unbroken.
const rasta2 = IJTEMA_RASTAS.find((rasta) => rasta.id === 'R2');
assert(rasta2, 'Rasta 02 source data must exist');
for (let seq = 1; seq < 5; seq += 1) {
  const from = `R2-${String(seq).padStart(2, '0')}`;
  const to = `R2-${String(seq + 1).padStart(2, '0')}`;
  assert(edgeExists(from, to), `${from} -> ${to} pre-existing Rasta02 segment must remain connected`);
}

// Other gates must be unaffected by this change. GATE_18's connectorStatus was later
// (deliberately) changed from the auto-evaluated default to 'ground_truth_required' — see
// gates.ts and docs/CURRENT_HANDOFF.md "Gate reconciliation" — because it has no valid graph
// connector within 320m of any internal path; declaring that known-blocked status, instead of
// leaving it looking auto-evaluated, is what the Gate 17-vs-18 directory count fix corrected.
// This assertion pins the CURRENT value; what must stay true regardless is that the gate
// remains disconnected in the graph, asserted separately right below.
assert.equal(
  IJTEMA_GATES.find((gate) => gate.id === 'GATE_18')?.connectorStatus,
  'ground_truth_required',
  'GATE_18 must remain untouched by this Gate03/R2 change (still expected to fail the distance check)',
);
const gate18Report = IJTEMA_NAVIGATION_GRAPH_V2_REPORT.gateConnectors.find((report) => report.gateId === 'GATE_18');
assert.equal(gate18Report?.connected, false, 'GATE_18 must remain blocked');
assert.equal(
  IJTEMA_GATES.find((gate) => gate.id === 'GATE_19')?.connectorStatus,
  'ground_truth_required',
  'GATE_19 must remain blocked pending physical ground truth',
);
const gate19Report = IJTEMA_NAVIGATION_GRAPH_V2_REPORT.gateConnectors.find((report) => report.gateId === 'GATE_19');
assert.equal(gate19Report?.connected, false, 'GATE_19 must remain blocked');

console.log('Gate03/R2 topology checks passed.');

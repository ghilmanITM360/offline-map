import assert from 'node:assert/strict';

import type { RoutingStartV2 } from '../src/services/RoutingServiceV2';
import { RoutingServiceV2 } from '../src/services/RoutingServiceV2';

const cases: Array<{
  label: string;
  start: RoutingStartV2;
  beforeDistanceM: number;
  afterDistanceM: number;
  requiredNewNodes?: string[];
}> = [
  { label: 'Gate01', start: { type: 'gate', gateId: 'GATE_01' }, beforeDistanceM: 1111, afterDistanceM: 1111 },
  { label: 'Gate02', start: { type: 'gate', gateId: 'GATE_02' }, beforeDistanceM: 1182, afterDistanceM: 1182 },
  { label: 'Gate20', start: { type: 'gate', gateId: 'GATE_20' }, beforeDistanceM: 2102, afterDistanceM: 1568, requiredNewNodes: ['R8-06', 'R8-05', 'R7-07', 'R7-06', 'R7-05'] },
  { label: 'Gate21', start: { type: 'gate', gateId: 'GATE_21' }, beforeDistanceM: 1897, afterDistanceM: 1366, requiredNewNodes: ['R7-07', 'R7-06', 'R7-05'] },
  { label: 'Gate22', start: { type: 'gate', gateId: 'GATE_22' }, beforeDistanceM: 1718, afterDistanceM: 1187, requiredNewNodes: ['R7-06', 'R7-05'] },
  { label: 'Block26', start: { type: 'block', blockId: 'B26' }, beforeDistanceM: 1542, afterDistanceM: 1012, requiredNewNodes: ['R8-07', 'R7-06', 'R7-05'] },
  { label: 'Block27', start: { type: 'block', blockId: 'B27' }, beforeDistanceM: 1981, afterDistanceM: 1184, requiredNewNodes: ['R7-07', 'R7-06', 'R7-05'] },
  { label: 'Block28', start: { type: 'block', blockId: 'B28' }, beforeDistanceM: 1464, afterDistanceM: 933, requiredNewNodes: ['R7-06', 'R7-05'] },
  { label: 'Block29', start: { type: 'block', blockId: 'B29' }, beforeDistanceM: 2086, afterDistanceM: 1093, requiredNewNodes: ['R7-07', 'R7-06', 'R7-05'] },
];

for (const testCase of cases) {
  const route = RoutingServiceV2.calculateRoute({
    start: testCase.start,
    destination: { type: 'block', blockId: 'B15' },
  });
  assert(route, `${testCase.label} -> Block15 must remain routable`);
  assert.equal(route.totalDistance, testCase.afterDistanceM, `${testCase.label} distance changed unexpectedly`);
  for (const nodeId of testCase.requiredNewNodes ?? []) {
    assert(route.nodes.includes(nodeId), `${testCase.label} shortening must be explained by surveyed node ${nodeId}`);
  }
  console.log(JSON.stringify({
    start: testCase.label,
    destination: 'Block15',
    beforeDistanceM: testCase.beforeDistanceM,
    afterDistanceM: route.totalDistance,
    deltaM: route.totalDistance - testCase.beforeDistanceM,
    nodePath: route.nodes,
  }));
}

console.log('R7/R8 route-regression checks passed.');

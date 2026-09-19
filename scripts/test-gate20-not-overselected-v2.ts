import { strict as assert } from 'node:assert';

import { RoutingServiceV2 } from '../src/services/RoutingServiceV2';

process.env.EXPO_PUBLIC_USE_IJTEMA_V2_MAP = 'true';
process.env.EXPO_PUBLIC_USE_IJTEMA_V2_ROUTING = 'true';

const northEastOrigin = { latitude: 24.9753, longitude: 67.011 };

const gate20ToB34 = RoutingServiceV2.calculateRoute({
  start: { type: 'outside_coordinate', coordinate: northEastOrigin, manualGateId: 'GATE_20' },
  destination: { type: 'block', blockId: 'B34' },
});
assert(gate20ToB34, 'Gate 20 must stay routable when selected explicitly.');
assert.equal(gate20ToB34.startLabel, 'Gate 20', 'Explicit Gate 20 route must keep Gate 20 as start.');

const northEastToB34 = RoutingServiceV2.calculateRoute({
  start: { type: 'outside_coordinate', coordinate: northEastOrigin },
  destination: { type: 'block', blockId: 'B34' },
});
assert(northEastToB34, 'North-east outside coordinate must route to Block 34.');
assert.notEqual(
  northEastToB34.startResolution?.gate?.id,
  'GATE_20',
  'Outside route must not choose Gate 20 when lower total-cost official entry exists.',
);
assert(
  northEastToB34.totalDistance < gate20ToB34.totalDistance,
  'Automatic complete-journey selection must beat the same-origin journey forced through Gate 20.',
);

console.log('Gate 20 not overselected v2 checks passed.');

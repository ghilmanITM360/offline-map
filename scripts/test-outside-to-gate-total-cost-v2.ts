import { strict as assert } from 'node:assert';

import { distanceMeters } from '../src/data/ijtema/graphBuilder';
import { IJTEMA_GATES } from '../src/data/ijtema/gates';
import { RoutingServiceV2 } from '../src/services/RoutingServiceV2';

process.env.EXPO_PUBLIC_USE_IJTEMA_V2_MAP = 'true';
process.env.EXPO_PUBLIC_USE_IJTEMA_V2_ROUTING = 'true';

const start = { latitude: 24.9682, longitude: 67.0087 };
const gate15 = IJTEMA_GATES.find((gate) => gate.id === 'GATE_15');
assert(gate15?.coordinate, 'Gate 15 fixture must have coordinate.');

const route = RoutingServiceV2.calculateRoute({
  start: { type: 'outside_coordinate', coordinate: start },
  destination: { type: 'gate', gateId: 'GATE_15' },
});

assert(route, 'Outside near Gate 15 must route to Gate 15 destination.');
assert.equal(route.startResolution?.gate?.id, 'GATE_15', 'Outside-to-Gate15 route must choose Gate 15 as entry/destination.');
assert.equal(route.nodes[0], 'GATE_15', 'Outside-to-Gate15 route must start graph path at Gate 15.');
assert.equal(route.nodes[route.nodes.length - 1], 'GATE_15', 'Outside-to-Gate15 route must end graph path at Gate 15.');

const approachM = Math.round(distanceMeters({ lat: start.latitude, lng: start.longitude }, gate15.coordinate));
assert(route.totalDistance <= approachM + 2, `Outside-to-Gate15 distance must be approach-only. Expected ~${approachM}m, got ${route.totalDistance}m.`);
assert.match(route.instructions[0]?.text ?? '', /enter through Gate 15/i, 'Outside-to-gate route must instruct entry through Gate 15.');

console.log('Outside to gate total cost v2 checks passed.');

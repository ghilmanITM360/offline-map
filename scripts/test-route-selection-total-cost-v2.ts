import { strict as assert } from 'node:assert';

import { IJTEMA_GATES } from '../src/data/ijtema/gates';
import { distanceMeters } from '../src/data/ijtema/graphBuilder';
import { RoutingServiceV2 } from '../src/services/RoutingServiceV2';

process.env.EXPO_PUBLIC_USE_IJTEMA_V2_MAP = 'true';
process.env.EXPO_PUBLIC_USE_IJTEMA_V2_ROUTING = 'true';

const toV2 = (coordinate: { latitude: number; longitude: number }) => ({
  lat: coordinate.latitude,
  lng: coordinate.longitude,
});

const outsideNorthEast = { latitude: 24.9762, longitude: 67.011 };

interface GateTotal {
  gateId: string;
  externalM: number;
  internalM: number;
  totalM: number;
}

const bestGateTotals: GateTotal[] = [];

for (const gate of IJTEMA_GATES.filter((item) => item.coordinate && item.canStartRouteFromOutside)) {
    const internal = RoutingServiceV2.calculateRoute({
      start: { type: 'gate', gateId: gate.id },
      destination: { type: 'block', blockId: 'B34' },
    });
    if (!internal || !gate.coordinate) continue;
    const externalM = Math.round(distanceMeters(toV2(outsideNorthEast), gate.coordinate));
    bestGateTotals.push({
      gateId: gate.id,
      externalM,
      internalM: internal.totalDistance,
      totalM: externalM + internal.totalDistance,
    });
}

bestGateTotals.sort((left, right) => left.totalM - right.totalM);

const route = RoutingServiceV2.calculateRoute({
  start: { type: 'outside_coordinate', coordinate: outsideNorthEast },
  destination: { type: 'block', blockId: 'B34' },
});

assert(route, 'Outside north-east start must route to Block 34.');
assert(bestGateTotals.length > 1, 'Fixture must have multiple official gate alternatives.');
assert.equal(bestGateTotals[0].gateId, 'GATE_15', 'Fixture expects Gate 15 to be lowest total-cost official entry.');
assert.notEqual(bestGateTotals[0].gateId, 'GATE_20', 'Gate 20 must not be best total-cost entry for this fixture.');
assert.equal(
  route.startResolution?.gate?.id,
  bestGateTotals[0].gateId,
  `Outside routing must choose lowest total cost gate; expected ${bestGateTotals[0].gateId}, got ${route.startResolution?.gate?.id ?? 'none'}.`,
);
assert(
  route.totalDistance <= bestGateTotals[0].totalM + 2,
  `Route distance must include start-to-entry + internal path. Expected <= ${bestGateTotals[0].totalM + 2}m, got ${route.totalDistance}m.`,
);

console.log('Route selection total cost v2 checks passed.');

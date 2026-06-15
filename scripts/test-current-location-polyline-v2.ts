import { strict as assert } from 'node:assert';

import { distanceMeters } from '../src/data/ijtema/graphBuilder';
import { RoutingServiceV2 } from '../src/services/RoutingServiceV2';

process.env.EXPO_PUBLIC_USE_IJTEMA_V2_MAP = 'true';
process.env.EXPO_PUBLIC_USE_IJTEMA_V2_ROUTING = 'true';

const start = { latitude: 24.9762, longitude: 67.011 };
const route = RoutingServiceV2.calculateRoute({
  start: { type: 'outside_coordinate', coordinate: start },
  destination: { type: 'block', blockId: 'B34' },
});

assert(route, 'Outside route preview must be calculable.');
assert((route.startConnectorDistanceM ?? 0) > 0, 'Outside route must include current-location-to-entry connector distance.');

const first = route.coordinates[0];
const firstDistanceM = distanceMeters(
  { lat: start.latitude, lng: start.longitude },
  { lat: first.latitude, lng: first.longitude },
);

assert(
  firstDistanceM <= 2,
  `First route coordinate must be current/start location within tolerance. Got ${Math.round(firstDistanceM)}m away.`,
);
assert.match(
  route.instructions[0]?.text ?? '',
  /enter through Gate 15/i,
  'Outside route first instruction must guide user from current location to selected entry gate.',
);

console.log('Current location polyline v2 checks passed.');

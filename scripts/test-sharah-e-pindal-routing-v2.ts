import { strict as assert } from 'node:assert';

import { SearchService } from '../src/services/SearchService';
import { V2DirectionsService } from '../src/services/V2DirectionsService';

process.env.EXPO_PUBLIC_USE_IJTEMA_V2_MAP = 'true';
process.env.EXPO_PUBLIC_USE_IJTEMA_V2_ROUTING = 'true';

const shahrNorth = SearchService.search('Shahr-e-Pindal North')[0];
const shahrSouth = SearchService.search('Shahr-e-Pindal South')[0];
const block28 = SearchService.search('Block 28')[0];
const gate08 = SearchService.search('Gate 08')[0];

assert.equal(shahrNorth?.routingStatus, 'routable', 'Shahr-e-Pindal North must be routable when graph-connected');
assert.equal(shahrSouth?.routingStatus, 'routable', 'Shahr-e-Pindal South must be routable when graph-connected');

const destinationPreview = V2DirectionsService.calculatePreview({
  startPlace: gate08,
  destination: shahrNorth,
  currentLocation: null,
  walkingSpeedMs: 1.4,
});
assert.equal(destinationPreview.status, 'ready', 'Gate 08 -> Shahr-e-Pindal North must route');
assert.equal(destinationPreview.route?.destinationLabel, 'Shahr-e-Pindal North', 'Route to Shahr-e-Pindal North must keep friendly route label');

const originPreview = V2DirectionsService.calculatePreview({
  startPlace: shahrNorth,
  destination: block28,
  currentLocation: null,
  walkingSpeedMs: 1.4,
});
assert.equal(originPreview.status, 'ready', 'Shahr-e-Pindal North -> Block 28 must route');
assert.equal(originPreview.route?.startLabel, 'Shahr-e-Pindal North', 'Route start must keep the friendly special-route label');
assert(originPreview.route?.nodes[0]?.startsWith('SPNP-'), 'Route from Shahr-e-Pindal North must resolve to a point on that route');
const firstSegment = originPreview.route?.segments[0];
assert(
  firstSegment?.name === 'Shahr-e-Pindal North' ||
    (firstSegment?.fromId.startsWith('SPNP-') && firstSegment.name === 'Rasta intersection' && firstSegment.distance <= 15),
  'A route may leave from a surveyed Shahr-e-Pindal intersection without first traversing a same-family segment',
);
assert(originPreview.route?.destinationEntryNodeId?.startsWith('B28_C'), 'Shahr-e-Pindal route must still resolve block entry nodes');

console.log('Shahr-e-Pindal routing v2 checks passed.');

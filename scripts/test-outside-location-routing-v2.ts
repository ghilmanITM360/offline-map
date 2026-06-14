import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

import { SearchService } from '../src/services/SearchService';
import { V2DirectionsService } from '../src/services/V2DirectionsService';

process.env.EXPO_PUBLIC_USE_IJTEMA_V2_MAP = 'true';
process.env.EXPO_PUBLIC_USE_IJTEMA_V2_ROUTING = 'true';

const directionsScreenSource = readFileSync('src/views/screens/DirectionsScreen.tsx', 'utf8');
const directionsViewModelSource = readFileSync('src/viewmodels/DirectionsViewModel.ts', 'utf8');
const directionsServiceSource = readFileSync('src/services/V2DirectionsService.ts', 'utf8');

assert(
  !directionsScreenSource.includes('Last known location is outside Ijtema and cannot be used for routing.'),
  'Directions screen must not reject outside remembered location.',
);
assert(
  directionsScreenSource.includes("We'll enter through nearest official gate"),
  'Directions screen must explain nearest-official-gate entry for outside starts.',
);
assert(
  directionsViewModelSource.includes('forceOutside'),
  'Directions viewmodel must forward outside-start routing mode into v2 preview service.',
);
assert(
  !directionsViewModelSource.includes('Choose a start point inside the ground'),
  'Directions viewmodel must stop forcing outside users to choose an inside-only start.',
);
assert(
  directionsServiceSource.includes('This gate has no verified location yet.'),
  'V2 directions service must expose missing-coordinate gate message.',
);
assert(
  directionsServiceSource.includes('This gate is not ready for navigation. Please choose another nearby gate.'),
  'V2 directions service must expose disconnected-gate message.',
);
assert(
  directionsServiceSource.includes('No safe offline route found between these points.'),
  'V2 directions service must expose safe no-route message.',
);

const block1 = SearchService.search('Block 1')[0];
const block42 = SearchService.search('Block 42')[0];
const gate18 = SearchService.search('Gate 18')[0];
const gate15 = SearchService.search('Gate 15')[0];

assert(block1, 'Block 1 fixture must exist');
assert(block42, 'Block 42 fixture must exist');
assert(gate18, 'Gate 18 fixture must exist');
assert(gate15, 'Gate 15 fixture must exist');
assert.equal(gate15.routingStatus, 'routable', 'Gate 15 fixture must become routable with latest data');

const outsideWestPreview = V2DirectionsService.calculatePreview({
  startPlace: null,
  destination: block1,
  currentLocation: { latitude: 24.9695, longitude: 66.9968 },
  walkingSpeedMs: 1.4,
  forceOutside: true,
});
assert.equal(outsideWestPreview.status, 'ready', 'Outside west location must route through nearest connected official gate.');
assert.equal(
  outsideWestPreview.route?.startResolution?.startType,
  'nearest_official_gate',
  'Outside route must enter through nearest connected official gate.',
);
assert(outsideWestPreview.route?.startResolution?.gate?.id, 'Outside route must resolve an entry gate.');
assert.notEqual(
  outsideWestPreview.route?.startResolution?.gate?.id,
  'GATE_18',
  'Outside route must not silently choose disconnected Gate 18.',
);
assert.notEqual(
  outsideWestPreview.route?.startResolution?.gate?.id,
  'GATE_15',
  'Outside route must not silently choose missing-coordinate Gate 15.',
);

const outsideEastPreview = V2DirectionsService.calculatePreview({
  startPlace: null,
  destination: block42,
  currentLocation: { latitude: 24.9719, longitude: 67.0068 },
  walkingSpeedMs: 1.4,
  forceOutside: true,
});
assert.equal(outsideEastPreview.status, 'ready', 'Outside east location must route into venue.');
assert.equal(
  outsideEastPreview.route?.startResolution?.startType,
  'nearest_official_gate',
  'Outside east route must still enter through official gate.',
);

const disconnectedGatePreview = V2DirectionsService.calculatePreview({
  startPlace: gate18,
  destination: block1,
  currentLocation: null,
  walkingSpeedMs: 1.4,
});
assert.equal(disconnectedGatePreview.status, 'unavailable', 'Gate 18 must stay blocked.');
assert.equal(
  disconnectedGatePreview.message,
  'This gate is not ready for navigation. Please choose another nearby gate.',
  'Gate 18 must show disconnected-gate user copy.',
);

const missingGatePreview = V2DirectionsService.calculatePreview({
  startPlace: gate15,
  destination: block1,
  currentLocation: null,
  walkingSpeedMs: 1.4,
});
assert.equal(missingGatePreview.status, 'ready', 'Gate 15 must route when selected explicitly.');
assert.equal(missingGatePreview.route?.startLabel, 'Gate 15', 'Gate 15 preview must keep friendly gate label.');

console.log('Outside location routing v2 checks passed.');

import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

import { IJTEMA_NAVIGATION_GRAPH_V2 } from '../src/data/ijtema';
import { SearchService } from '../src/services/SearchService';
import { V2DirectionsService } from '../src/services/V2DirectionsService';

const RAW_NODE_PATTERN = /\b(?:P\d+|S\d+|T\d+|C\d+|R\d+-\d+|SPNP-\d+|SPSP-\d+|SPWP-\d+|B\d+_C\d+)\b/;
const directionsScreenSource = readFileSync('src/views/components/map/LocationSheet.tsx', 'utf8');
const homeScreenSource = readFileSync('src/views/screens/HomeScreen.tsx', 'utf8');
const homeViewModelSource = readFileSync('src/viewmodels/HomeViewModel.ts', 'utf8');

assert(directionsScreenSource.includes('Get Directions'), 'Directions screen must use layman-friendly heading');
assert(directionsScreenSource.includes('Show route on map'), 'Directions screen must return user to Home map preview');
assert(directionsScreenSource.includes('Route ready'), 'Directions screen must show route-ready summary');
assert(!directionsScreenSource.includes('Could not calculate a v2 route. The selected gate or place may need connector verification.'), 'Directions screen must not show generic v2 route error copy');
assert(homeScreenSource.includes("selectedPlace.sourceVersion !== 'v2'"), 'Home screen must not show old entry chips for v2 blocks');
assert(homeViewModelSource.includes('if (!place.coordinate)'), 'Home selection must guard unavailable v2 places with no coordinate');

process.env.EXPO_PUBLIC_USE_IJTEMA_V2_MAP = 'true';
process.env.EXPO_PUBLIC_USE_IJTEMA_V2_ROUTING = 'true';

const block42 = SearchService.search('Block 42')[0];
assert.equal(block42?.id, 'B42', 'Select Block 42 preview fixture must exist');
const block42Preview = V2DirectionsService.calculatePreview({
  startPlace: SearchService.search('Gate 13')[0],
  destination: block42,
  currentLocation: null,
  walkingSpeedMs: 1.4,
});
assert.equal(block42Preview.status, 'ready', 'Select Block 42 preview must not crash');
assert(block42Preview.route && block42Preview.route.coordinates.length > 1, 'Block 42 preview must create route coordinates');

const gate21Preview = V2DirectionsService.calculatePreview({
  startPlace: SearchService.search('Gate 21')[0],
  destination: SearchService.search('Block 28')[0],
  currentLocation: null,
  walkingSpeedMs: 1.4,
});
assert.equal(gate21Preview.status, 'ready', 'Gate 21 to Block 28 must route with v2 routing flag');
assert(gate21Preview.route && gate21Preview.route.totalDistance > 0, 'Gate 21 route distance must be positive');
assert(gate21Preview.route?.startLabel.includes('Gate 21'), 'Gate 21 route must keep friendly start label');

const outsidePreview = V2DirectionsService.calculatePreview({
  startPlace: null,
  destination: SearchService.search('Block 28')[0],
  currentLocation: { latitude: 24.9695, longitude: 66.9968 },
  walkingSpeedMs: 1.4,
  forceOutside: true,
});
assert.equal(outsidePreview.status, 'ready', 'Outside west coordinate must route via nearest connected official gate');
assert(outsidePreview.route?.startResolution?.startType === 'nearest_official_gate', 'Outside route must start at nearest official gate');
assert.notEqual(outsidePreview.route?.startResolution?.gate?.id, 'GATE_03', 'Outside helper must not choose disconnected Gate 03');

const outsideInsideBroadBoundsPreview = V2DirectionsService.calculatePreview({
  startPlace: null,
  destination: SearchService.search('Block 28')[0],
  currentLocation: { latitude: 24.9696, longitude: 66.9975 },
  walkingSpeedMs: 1.4,
});
assert.equal(outsideInsideBroadBoundsPreview.status, 'ready', 'Outside user inside broad map bounds must still route');
assert.equal(
  outsideInsideBroadBoundsPreview.route?.startResolution?.startType,
  'nearest_official_gate',
  'Outside user inside broad map bounds must enter through nearest connected official gate, not internal snap',
);
assert(
  outsideInsideBroadBoundsPreview.route?.startResolution?.gate?.id,
  'Outside user inside broad map bounds must resolve to a connected official gate',
);

const insidePreview = V2DirectionsService.calculatePreview({
  startPlace: null,
  destination: SearchService.search('Block 2')[0],
  currentLocation: { latitude: 24.9694, longitude: 67.0016 },
  walkingSpeedMs: 1.4,
});
assert.equal(insidePreview.status, 'ready', 'Inside coordinate must snap internally and route to block');
assert.equal(insidePreview.route?.startResolution?.startType, 'internal_snap', 'Inside route must use internal graph snap');
const insideSnapNode = insidePreview.route?.startResolution?.candidateNodes[0];
assert(insideSnapNode, 'Inside route must keep snapped graph node');
assert.equal(
  insidePreview.route?.startResolution?.coordinate.latitude,
  IJTEMA_NAVIGATION_GRAPH_V2.nodes[insideSnapNode].coordinate.lat,
  'Inside route must expose snapped graph latitude',
);
assert.equal(
  insidePreview.route?.startResolution?.coordinate.longitude,
  IJTEMA_NAVIGATION_GRAPH_V2.nodes[insideSnapNode].coordinate.lng,
  'Inside route must expose snapped graph longitude',
);

const disconnectedGate18 = V2DirectionsService.calculatePreview({
  startPlace: SearchService.search('Gate 18')[0],
  destination: SearchService.search('Block 26')[0],
  currentLocation: null,
  walkingSpeedMs: 1.4,
});
assert.equal(disconnectedGate18.status, 'unavailable', 'Disconnected Gate 18 route start must fail gracefully');
assert.equal(disconnectedGate18.message, 'This gate is not ready for navigation. Please choose another nearby gate.', 'Disconnected Gate 18 must explain blocked start clearly');

const gate15Preview = V2DirectionsService.calculatePreview({
  startPlace: SearchService.search('Gate 15')[0],
  destination: SearchService.search('Block 26')[0],
  currentLocation: null,
  walkingSpeedMs: 1.4,
});
assert.equal(gate15Preview.status, 'ready', 'Gate 15 must route with latest coordinate set');
assert.equal(gate15Preview.route?.startLabel, 'Gate 15', 'Gate 15 preview must keep friendly gate label');

const shahrRoutePreview = V2DirectionsService.calculatePreview({
  startPlace: SearchService.search('Gate 08')[0],
  destination: SearchService.search('Shahr-e-Pindal North')[0],
  currentLocation: null,
  walkingSpeedMs: 1.4,
});
assert.equal(shahrRoutePreview.status, 'ready', 'Shahr-e-Pindal routes must be routable when graph-connected');
assert(shahrRoutePreview.route, 'Shahr-e-Pindal preview must return a route');
assert.equal(shahrRoutePreview.route?.destinationLabel, 'Shahr-e-Pindal North', 'Shahr-e-Pindal preview must keep friendly destination label');

const friendlyInstructions = gate21Preview.instructions.map((instruction) => instruction.text).join(' ');
assert(!RAW_NODE_PATTERN.test(friendlyInstructions), `V2 directions instructions must not expose raw node IDs: ${friendlyInstructions}`);
assert(/Gate 21|Rasta|Block 28|junction/i.test(friendlyInstructions), 'V2 directions instructions must use friendly labels');

process.env.EXPO_PUBLIC_USE_IJTEMA_V2_ROUTING = 'false';
const disabledPreview = V2DirectionsService.calculatePreview({
  startPlace: SearchService.search('Gate 21')[0],
  destination: SearchService.search('Block 28')[0],
  currentLocation: null,
  walkingSpeedMs: 1.4,
});
assert.equal(disabledPreview.status, 'disabled', 'V2-only route calculation must be disabled when routing flag is off');

console.log('Directions v2 checks passed.');

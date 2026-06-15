import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

import { SearchService } from '../src/services/SearchService';
import { V2DirectionsService } from '../src/services/V2DirectionsService';
import { V2NavigationAdapter } from '../src/services/V2NavigationAdapter';

const RAW_NODE_PATTERN = /\b(?:P\d+|S\d+|T\d+|C\d+|R\d+-\d+|SPNP-\d+|SPSP-\d+|SPWP-\d+|B\d+_C\d+)\b/;

process.env.EXPO_PUBLIC_USE_IJTEMA_V2_MAP = 'true';
process.env.EXPO_PUBLIC_USE_IJTEMA_V2_ROUTING = 'true';

const directionsScreenSource = readFileSync('src/views/screens/DirectionsScreen.tsx', 'utf8');
const directionsViewModelSource = readFileSync('src/viewmodels/DirectionsViewModel.ts', 'utf8');
const navigationScreenSource = readFileSync('src/views/screens/NavigationScreen.tsx', 'utf8');
const homeViewModelSource = readFileSync('src/viewmodels/HomeViewModel.ts', 'utf8');
const featureFlagSource = readFileSync('src/services/MapFeatureFlagsService.ts', 'utf8');

assert(featureFlagSource.includes('useIjtemaV2Navigation'), 'MapFeatureFlagsService must expose EXPO_PUBLIC_USE_IJTEMA_V2_NAVIGATION');
assert(directionsScreenSource.includes('Show route on map'), 'DirectionsScreen must hand preview back to Home map');
assert(directionsScreenSource.includes('Get Directions'), 'DirectionsScreen must keep layman-friendly heading');
assert(directionsViewModelSource.includes('V2NavigationAdapter'), 'DirectionsViewModel must adapt v2 previews before starting active navigation');
assert(directionsViewModelSource.includes('setActiveRoute(preview.route)'), 'DirectionsViewModel must persist v2 preview route for Home preview');
assert(navigationScreenSource.includes('NavigationViewModelV2'), 'NavigationScreen must have an isolated v2 navigation branch');
assert(navigationScreenSource.includes("activeRoute.sourceVersion === 'v2'"), 'NavigationScreen must choose v2 only for v2 active routes');
assert(navigationScreenSource.includes('NavigationScreenV2Disabled'), 'NavigationScreen must not pass v2 active routes into v1 when nav flag is off');
assert(navigationScreenSource.includes('V2 navigation is disabled'), 'Disabled v2 active navigation branch must show a clear message');
assert(directionsViewModelSource.includes('useIjtemaV2Map()'), 'Directions start handler must require v2 map flag before active v2 navigation');
assert(directionsViewModelSource.includes('useIjtemaV2Routing()'), 'Directions start handler must require v2 routing flag before active v2 navigation');

const runtimeCoordinateLiteralPattern = /\b(?:24|66|67)\.\d{3,}\b/;
for (const [file, source] of [
  ['src/views/screens/NavigationScreen.tsx', navigationScreenSource],
  ['src/viewmodels/HomeViewModel.ts', homeViewModelSource],
]) {
  assert(
    !runtimeCoordinateLiteralPattern.test(source),
    `${file} must use src/data/ijtema map constants instead of hard-coded Karachi coordinate fallbacks`,
  );
}

const gate21 = SearchService.search('Gate 21')[0];
const block28 = SearchService.search('Block 28')[0];
assert.equal(gate21?.id, 'GATE_21', 'Gate 21 fixture must exist');
assert.equal(block28?.id, 'B28', 'Block 28 fixture must exist');

const gate21Preview = V2DirectionsService.calculatePreview({
  startPlace: gate21,
  destination: block28,
  currentLocation: null,
  walkingSpeedMs: 1.4,
});
assert.equal(gate21Preview.status, 'ready', 'Gate 21 -> Block 28 preview must be routable');
assert(gate21Preview.route, 'Gate 21 -> Block 28 must produce a route');

const activeRoute = V2NavigationAdapter.fromPreview({
  previewRoute: gate21Preview.route!,
  destination: block28,
  startPlace: gate21,
});

assert.equal(activeRoute.sourceVersion, 'v2', 'V2 active route must identify sourceVersion v2');
assert(activeRoute.routeId.length > 0, 'V2 active route must have routeId');
assert.equal(activeRoute.origin.type, 'official_gate', 'Manual gate start must become official_gate origin');
assert.equal(activeRoute.origin.gateId, 'GATE_21', 'Origin metadata must keep gate id');
assert.equal(activeRoute.destination.type, 'block', 'Destination metadata must keep block type');
assert.equal(activeRoute.destination.blockId, 'B28', 'Destination metadata must keep block id');
assert(activeRoute.destination.entryNodeId?.startsWith('B28_'), 'Block destination must keep chosen entry node');
assert(activeRoute.totalDistanceM > 0, 'V2 active route distance must be positive');
assert(activeRoute.coordinates.length >= 2, 'V2 active route coordinates must have at least two points');
assert(activeRoute.edges.length === activeRoute.nodes.length - 1, 'V2 active route must expose one edge per node hop');
assert(activeRoute.instructions.length > 0, 'V2 active route must expose active navigation instructions');

const normalInstructionText = activeRoute.instructions.map((instruction) => instruction.text).join('\n');
assert(!RAW_NODE_PATTERN.test(normalInstructionText), `Normal v2 instructions must hide raw internal IDs:\n${normalInstructionText}`);
const developerLabels = activeRoute.instructions.map((instruction) => instruction.developerLabel ?? '').join('\n');
assert(RAW_NODE_PATTERN.test(developerLabels), 'Developer labels may expose raw internal ids for diagnostics');

const outsidePreview = V2DirectionsService.calculatePreview({
  startPlace: null,
  destination: block28,
  currentLocation: { latitude: 24.9695, longitude: 66.9968 },
  walkingSpeedMs: 1.4,
  forceOutside: true,
});
assert.equal(outsidePreview.status, 'ready', 'Outside west coordinate -> Block 28 preview must be routable');
const outsideActiveRoute = V2NavigationAdapter.fromPreview({
  previewRoute: outsidePreview.route!,
  destination: block28,
  currentLocation: { latitude: 24.9695, longitude: 66.9968 },
});
assert.equal(outsideActiveRoute.metadata.startedOutside, true, 'Outside active route must record startedOutside');
assert(outsideActiveRoute.metadata.entryGateId, 'Outside active route must include entryGateId');
assert.equal(outsideActiveRoute.metadata.usesOfficialGateEntry, true, 'Outside active route must use official gate entry');
assert.equal(outsideActiveRoute.origin.type, 'official_gate', 'Outside origin must resolve to official_gate');

process.env.EXPO_PUBLIC_USE_IJTEMA_V2_NAVIGATION = 'false';
assert.equal(
  V2NavigationAdapter.canStartActiveNavigation({ route: gate21Preview.route, destination: block28 }).canStart,
  false,
  'V2 route must stay Preview Only when navigation flag is false',
);

process.env.EXPO_PUBLIC_USE_IJTEMA_V2_MAP = 'false';
process.env.EXPO_PUBLIC_USE_IJTEMA_V2_NAVIGATION = 'true';
const missingMapStartCheck = V2NavigationAdapter.canStartActiveNavigation({ route: gate21Preview.route, destination: block28 });
assert.equal(missingMapStartCheck.canStart, false, 'V2 active navigation must require the v2 map flag');
assert(
  missingMapStartCheck.message.includes('EXPO_PUBLIC_USE_IJTEMA_V2_MAP'),
  'V2 active navigation must explain when the v2 map flag is missing',
);

process.env.EXPO_PUBLIC_USE_IJTEMA_V2_MAP = 'true';
process.env.EXPO_PUBLIC_USE_IJTEMA_V2_NAVIGATION = 'true';
assert.equal(
  V2NavigationAdapter.canStartActiveNavigation({ route: gate21Preview.route, destination: block28 }).canStart,
  true,
  'Gate 21 -> Block 28 can start v2 navigation when navigation flag is true',
);

const gate15 = SearchService.search('Gate 15')[0];
assert.equal(gate15?.routingStatus, 'routable', 'Gate 15 fixture must be routable with latest data');
const gate15Preview = V2DirectionsService.calculatePreview({
  startPlace: gate15,
  destination: block28,
  currentLocation: null,
  walkingSpeedMs: 1.4,
});
assert.equal(gate15Preview.status, 'ready', 'Gate 15 must support active-navigation preview');

const block33 = SearchService.search('Block 33')[0];
const block38 = SearchService.search('Block 38')[0];
assert.equal(block33?.id, 'B33', 'Block 33 fixture must exist');
assert.equal(block38?.id, 'B38', 'Block 38 fixture must exist');
const blockStartPreview = V2DirectionsService.calculatePreview({
  startPlace: block33,
  destination: block38,
  currentLocation: null,
  walkingSpeedMs: 1.4,
});
assert.equal(blockStartPreview.status, 'ready', 'Block 33 -> Block 38 preview must route');
const blockStartActive = V2NavigationAdapter.fromPreview({
  previewRoute: blockStartPreview.route!,
  destination: block38,
  startPlace: block33,
});
assert.deepEqual(
  blockStartActive.origin.coordinate,
  blockStartPreview.route?.coordinates[0],
  'Manual block start origin must use selected route entry, not block center.',
);

const disconnectedGate18 = SearchService.search('Gate 18')[0];
assert.equal(disconnectedGate18?.routingStatus, 'needs_connector_verification', 'Gate 18 fixture must need connector verification');
const disconnectedGatePreview = V2DirectionsService.calculatePreview({
  startPlace: disconnectedGate18,
  destination: block28,
  currentLocation: null,
  walkingSpeedMs: 1.4,
});
assert.equal(disconnectedGatePreview.status, 'unavailable', 'Disconnected gates cannot start navigation silently');
assert.equal(
  disconnectedGatePreview.message,
  'This gate is not ready for navigation. Please choose another nearby gate.',
  'Disconnected gate message must be clear and stable',
);

console.log('Navigation v2 checks passed.');

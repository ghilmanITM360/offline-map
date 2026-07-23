import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

import { SearchService } from '../src/services/SearchService';
import { V2DirectionsService } from '../src/services/V2DirectionsService';
import { V2NavigationAdapter } from '../src/services/V2NavigationAdapter';

const RAW_NODE_PATTERN = /\b(?:P\d+|S\d+|T\d+|C\d+|R\d+-\d+|SPNP-\d+|SPSP-\d+|SPWP-\d+|B\d+_C\d+)\b/;

process.env.EXPO_PUBLIC_USE_IJTEMA_V2_MAP = 'true';
process.env.EXPO_PUBLIC_USE_IJTEMA_V2_ROUTING = 'true';

const directionsScreenSource = readFileSync('src/views/components/map/LocationSheet.tsx', 'utf8');
const directionsViewModelSource = readFileSync('src/viewmodels/DirectionsViewModel.ts', 'utf8');
const navigationViewModelV1Source = readFileSync('src/viewmodels/NavigationViewModel.ts', 'utf8');
const homeScreenSource = readFileSync('src/views/screens/HomeScreen.tsx', 'utf8');
const homeViewModelSource = readFileSync('src/viewmodels/HomeViewModel.ts', 'utf8');
const navigationOverlayV2Source = readFileSync('src/viewmodels/useNavigationOverlayV2.ts', 'utf8');
const navigationViewModelV2Source = readFileSync('src/viewmodels/NavigationViewModelV2.ts', 'utf8');
const featureFlagSource = readFileSync('src/services/MapFeatureFlagsService.ts', 'utf8');

// v2 live navigation now runs in-place on HomeScreen's persistent MapView (useNavigationOverlayV2),
// not on a separately pushed NavigationScreen — see docs/MAP_EXPERIENCE_AUDIT.md. v1's equivalent
// (NavigationViewModel + useNavigationOverlayV1) itself guards against ever adopting a
// v2-shaped active route, since both hooks now run unconditionally with no outer screen to gate on.
assert(featureFlagSource.includes('useIjtemaV2Navigation'), 'MapFeatureFlagsService must expose EXPO_PUBLIC_USE_IJTEMA_V2_NAVIGATION');
assert(directionsScreenSource.includes('Start Navigation'), 'DirectionsScreen must expose a Start Navigation CTA that reveals the map in place');
assert(directionsScreenSource.includes('Get Directions'), 'DirectionsScreen must keep layman-friendly heading');
assert(directionsViewModelSource.includes('V2NavigationAdapter'), 'DirectionsViewModel must adapt v2 previews before starting active navigation');
assert(directionsViewModelSource.includes('setActiveRoute(preview.route)'), 'DirectionsViewModel must persist v2 preview route for Home preview');
assert(homeScreenSource.includes('useNavigationOverlayV2'), 'HomeScreen must run an isolated v2 navigation branch on the persistent map');
assert(navigationOverlayV2Source.includes('useNavigationViewModelV2'), 'The v2 navigation overlay must be backed by NavigationViewModelV2');
assert(navigationViewModelV2Source.includes('isV2ActiveRoute(activeRoute)'), 'v2 navigation overlay must choose v2 only for v2 active routes');
assert(homeScreenSource.includes('MapFeatureFlagsService.useIjtemaV2Navigation()'), 'HomeScreen must gate the v2 navigation overlay behind the v2 navigation flag');
assert(
  navigationViewModelV1Source.includes("(activeRoute as { sourceVersion?: string }).sourceVersion === 'v2'"),
  'v1 navigation runtime must not adopt v2-shaped active routes',
);
// The single consolidated start-navigation path now lives on Home (route preview card ->
// handleStartPreviewNavigation), not on a per-screen Directions handler — it must validate
// v2 map/routing/navigation flags (and destination) via the shared adapter before starting.
assert(
  homeScreenSource.includes('V2NavigationAdapter.canStartActiveNavigation'),
  'Home start-navigation handler must validate v2 flags/destination before starting active navigation',
);

const runtimeCoordinateLiteralPattern = /\b(?:24|66|67)\.\d{3,}\b/;
for (const [file, source] of [
  ['src/viewmodels/NavigationViewModel.ts', navigationViewModelV1Source],
  ['src/viewmodels/HomeViewModel.ts', homeViewModelSource],
  ['src/viewmodels/useNavigationOverlayV2.ts', navigationOverlayV2Source],
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

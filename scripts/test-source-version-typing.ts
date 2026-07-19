import { strict as assert } from 'node:assert';

import { IJTEMA_DATA, LANDMARK_PLACES } from '../src/constants/data';
import { RoutingService } from '../src/services/RoutingService';
import { RoutingServiceV2 } from '../src/services/RoutingServiceV2';
import { SearchService } from '../src/services/SearchService';
import { V2PlaceAdapter } from '../src/services/V2PlaceAdapter';
import { V2NavigationAdapter } from '../src/services/V2NavigationAdapter';
import { V2DirectionsService } from '../src/services/V2DirectionsService';

// This suite asserts the *runtime* values behind the mandatory sourceVersion
// discriminated union in src/models/types.ts (Place / RoutePreview). Passing
// `npm run typecheck` only proves every construction site compiles with a
// literal 'v1' | 'v2' tag — it says nothing about whether the tag written at
// each site is actually correct. These checks catch a wrong-but-present tag
// (e.g. a v1 factory that was miscopied to write 'v2') that the type system
// alone cannot.

const VALID_V2_SOURCE_KINDS = new Set(['block', 'gate', 'rasta', 'special_route']);

// ─── 1. Legacy LANDMARK_PLACES must all be tagged v1 at the data level ─────
assert(LANDMARK_PLACES.length > 0, 'LANDMARK_PLACES fixture must be non-empty for this check to mean anything');
LANDMARK_PLACES.forEach((place) => {
  assert.equal(place.sourceVersion, 'v1', `${place.id} in LANDMARK_PLACES must be tagged sourceVersion "v1"`);
});

// ─── 2. RoutingService (v1) must runtime-tag every route it returns ────────
process.env.EXPO_PUBLIC_USE_IJTEMA_V2_MAP = 'false';
process.env.EXPO_PUBLIC_USE_IJTEMA_V2_ROUTING = 'false';
process.env.EXPO_PUBLIC_USE_IJTEMA_V2_NAVIGATION = 'false';

const v1BlockIds = Object.keys(IJTEMA_DATA.blocks);
const v1FromBlock = IJTEMA_DATA.blocks.B1 ?? IJTEMA_DATA.blocks[v1BlockIds[0]];
const v1ToBlock = IJTEMA_DATA.blocks.B24 ?? IJTEMA_DATA.blocks[v1BlockIds[v1BlockIds.length - 1]];

const v1DestNodes = RoutingService.resolveDestinationNodesFromPlace({
  id: v1ToBlock.id,
  name: v1ToBlock.name,
  category: 'Block',
  description: v1ToBlock.name,
  coordinate: v1ToBlock.center,
  sourceVersion: 'v1',
});

const v1Route = RoutingService.calculateRoute(v1FromBlock.center, v1DestNodes, undefined, 1.4);
assert(v1Route, 'RoutingService.calculateRoute must produce a route for the B1 -> B24 smoke pair');
assert.equal(v1Route!.sourceVersion, 'v1', 'RoutingService.calculateRoute must runtime-tag its route sourceVersion "v1"');
assert.notEqual(v1Route!.sourceVersion, 'v2', 'A v1 RoutingService route must never carry sourceVersion "v2"');

const v1Alternatives = RoutingService.calculateRoutes(v1FromBlock.center, v1DestNodes, 1.4);
assert(v1Alternatives.length > 0, 'RoutingService.calculateRoutes must produce at least one alternative');
v1Alternatives.forEach((alternative) => {
  assert.equal(
    alternative.route.sourceVersion,
    'v1',
    `RoutingService.calculateRoutes "${alternative.label}" alternative must be tagged sourceVersion "v1"`,
  );
});

// ─── 3. RoutingServiceV2 (v2) must runtime-tag every route it returns ──────
const v2BlockRoute = RoutingServiceV2.calculateRoute({
  start: { type: 'block', blockId: 'B1' },
  destination: { type: 'block', blockId: 'B24' },
  walkingSpeedMs: 1.4,
});
assert(v2BlockRoute, 'RoutingServiceV2.calculateRoute must produce a route for Block 1 -> Block 24');
assert.equal(v2BlockRoute!.sourceVersion, 'v2', 'RoutingServiceV2.calculateRoute must runtime-tag its route sourceVersion "v2"');
assert.notEqual(v2BlockRoute!.sourceVersion, 'v1', 'A v2 RoutingServiceV2 route must never carry sourceVersion "v1"');

const v2GateRoute = RoutingServiceV2.calculateRoute({
  start: { type: 'gate', gateId: 'GATE_05' },
  destination: { type: 'block', blockId: 'B2' },
  walkingSpeedMs: 1.4,
});
assert(v2GateRoute, 'RoutingServiceV2.calculateRoute must produce a route for Gate 05 -> Block 2');
assert.equal(v2GateRoute!.sourceVersion, 'v2', 'Gate-start v2 route must be tagged sourceVersion "v2"');

const v2OutsideRoute = RoutingServiceV2.calculateRoute({
  start: { type: 'outside_coordinate', coordinate: { latitude: 24.9696, longitude: 66.9967 } },
  destination: { type: 'block', blockId: 'B28' },
  walkingSpeedMs: 1.4,
});
assert(v2OutsideRoute, 'RoutingServiceV2.calculateRoute must produce a route for an outside coordinate start');
assert.equal(v2OutsideRoute!.sourceVersion, 'v2', 'Outside-coordinate v2 route must be tagged sourceVersion "v2"');

// ─── 4. V2PlaceAdapter must tag every place "v2" with a valid sourceKind ──
const allV2Places = V2PlaceAdapter.getAllPlaces({ includeUnavailableGates: true });
assert(allV2Places.length > 0, 'V2PlaceAdapter.getAllPlaces must return places');
allV2Places.forEach((place) => {
  assert.equal(place.sourceVersion, 'v2', `${place.id} from V2PlaceAdapter must be tagged sourceVersion "v2"`);
  assert(
    VALID_V2_SOURCE_KINDS.has(place.sourceKind),
    `${place.id} from V2PlaceAdapter must carry a valid sourceKind, got "${place.sourceKind}"`,
  );
});

// ─── 5. V2NavigationAdapter.fromPreview must produce a v2-tagged active route ──
process.env.EXPO_PUBLIC_USE_IJTEMA_V2_ROUTING = 'true';
const gate21 = allV2Places.find((place) => place.id === 'GATE_21');
const block28 = allV2Places.find((place) => place.id === 'B28');
assert(gate21 && block28, 'Gate 21 / Block 28 fixtures must exist in v2 place data');

const gate21Preview = V2DirectionsService.calculatePreview({
  startPlace: gate21!,
  destination: block28!,
  currentLocation: null,
  walkingSpeedMs: 1.4,
});
assert.equal(gate21Preview.status, 'ready', 'Gate 21 -> Block 28 v2 preview must be routable');
assert(gate21Preview.route, 'Gate 21 -> Block 28 v2 preview must return a route');
assert.equal(gate21Preview.route!.sourceVersion, 'v2', 'V2DirectionsService preview route must be tagged sourceVersion "v2"');

const v2ActiveRoute = V2NavigationAdapter.fromPreview({
  previewRoute: gate21Preview.route!,
  destination: block28!,
  startPlace: gate21!,
});
assert.equal(v2ActiveRoute.sourceVersion, 'v2', 'V2NavigationAdapter.fromPreview must produce sourceVersion "v2"');

// ─── 6. SearchService must only surface v1-tagged places when v2 map is off ──
process.env.EXPO_PUBLIC_USE_IJTEMA_V2_MAP = 'false';
const legacySearchResults = SearchService.search('Block 2');
assert(legacySearchResults.length > 0, 'Legacy v1 search must return results for "Block 2"');
legacySearchResults.forEach((place) => {
  assert.equal(place.sourceVersion, 'v1', `${place.id} from legacy (v1) search must be tagged sourceVersion "v1"`);
});

const legacyLandmarkResult = SearchService.search('food distribution')[0];
assert(legacyLandmarkResult, 'Legacy v1 search must resolve the food-distribution landmark');
assert.equal(legacyLandmarkResult.sourceVersion, 'v1', 'Legacy landmark search result must be tagged sourceVersion "v1"');

// ─── 7. SearchService must only surface v2-tagged places when v2 map is on ──
process.env.EXPO_PUBLIC_USE_IJTEMA_V2_MAP = 'true';
process.env.EXPO_PUBLIC_USE_IJTEMA_V2_ROUTING = 'true';
const v2SearchResults = SearchService.search('Block 2');
assert(v2SearchResults.length > 0, 'v2 search must return results for "Block 2"');
v2SearchResults.forEach((place) => {
  assert.equal(place.sourceVersion, 'v2', `${place.id} from v2 search must be tagged sourceVersion "v2"`);
  assert.notEqual(place.sourceVersion, 'v1', `${place.id} from v2 search must never carry sourceVersion "v1"`);
});

console.log('Source-version typing checks passed.');

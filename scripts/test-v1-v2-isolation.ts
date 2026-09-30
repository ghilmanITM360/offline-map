import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

import { IJTEMA_DATA } from '../src/constants/data';
import { RoutingService } from '../src/services/RoutingService';
import { SearchService } from '../src/services/SearchService';
import { V2DirectionsService } from '../src/services/V2DirectionsService';
import { V2NavigationAdapter } from '../src/services/V2NavigationAdapter';

const searchSource = readFileSync('src/services/SearchService.ts', 'utf8');
const directionsVmSource = readFileSync('src/viewmodels/DirectionsViewModel.ts', 'utf8');
const homeScreenSource = readFileSync('src/views/screens/HomeScreen.tsx', 'utf8');
const navigationV2Source = readFileSync('src/viewmodels/NavigationViewModelV2.ts', 'utf8');
const navigationV1Source = readFileSync('src/viewmodels/NavigationViewModel.ts', 'utf8');
const storeSource = readFileSync('src/store/useAppStore.ts', 'utf8');
const legacyDataSource = readFileSync('src/constants/data.ts', 'utf8');

assert(searchSource.includes('MapFeatureFlagsService.useIjtemaV2Map()'), 'SearchService must centralize v1 rollback behind the v2 map flag');
assert(
  directionsVmSource.includes('const isV2Destination = Boolean(destination && destinationFromPlace(destination))'),
  'DirectionsViewModel must branch only unified V2-routing destinations away from legacy routing',
);
// v2 active navigation now starts from Home's route preview card (the single consolidated
// start-navigation path), not from a per-screen Directions handler.
assert(homeScreenSource.includes('startPreviewNavigationV2({') && navigationV2Source.includes('V2NavigationAdapter.fromPreview({'), 'Home must forward to the V2 ViewModel, which adapts previews before active navigation');
// Both v1 and v2 navigation now run unconditionally inside HomeScreen (no outer screen to
// gate on activeRoute.sourceVersion), so NavigationViewModel (v1) must reject a v2-shaped
// activeRoute itself — checked with an inline duck-type test, not V2NavigationAdapter's
// isV2ActiveRoute, so this v1-only module stays free of any v2 import (see the assertion below).
assert(
  navigationV1Source.includes("(activeRoute as { sourceVersion?: string }).sourceVersion === 'v2'"),
  'NavigationViewModel (v1) must identify and reject v2-shaped active routes',
);
assert(!navigationV1Source.includes('V2NavigationAdapter'), 'Legacy NavigationViewModel must remain v1-only');
assert(!legacyDataSource.includes('../data/ijtema/mapBounds'), 'Legacy data constants must not import v2 map bounds');
assert(!legacyDataSource.includes('IJTEMA_MAP_BOUNDS'), 'Legacy MAP_BOUNDS must be derived from legacy data only');

delete process.env.EXPO_PUBLIC_USE_IJTEMA_V2_MAP;
delete process.env.EXPO_PUBLIC_USE_IJTEMA_V2_ROUTING;
delete process.env.EXPO_PUBLIC_USE_IJTEMA_V2_NAVIGATION;

const defaultBlock42 = SearchService.search('Block 42')[0];
assert.equal(defaultBlock42?.sourceVersion, 'v2', 'Normal production search must not use v1 B1-B24 data');
assert.equal(SearchService.getPlaceById('C1'), null, 'Production default getPlaceById must not resolve legacy global gate C1');
assert.equal(SearchService.getPlaceById('LM_GATE_EAST'), null, 'Production default getPlaceById must not resolve legacy landmarks');
assert(storeSource.includes('sanitizePersistedPlace'), 'Persisted places must be sanitized during production v2 migration');
assert(storeSource.includes("sourceVersion === 'v2'"), 'Persisted recent searches must keep v2 places only in production mode');

process.env.EXPO_PUBLIC_USE_IJTEMA_V2_MAP = 'false';
const rollbackBlock42 = SearchService.search('Block 42')[0];
assert.notEqual(rollbackBlock42?.sourceVersion, 'v2', 'Explicit rollback may leave v2 search path');
assert.notEqual(rollbackBlock42?.id, 'B42', 'Legacy rollback search must not masquerade as complete v2 B1-B42 production data');

process.env.EXPO_PUBLIC_USE_IJTEMA_V2_MAP = 'true';
process.env.EXPO_PUBLIC_USE_IJTEMA_V2_ROUTING = 'true';
process.env.EXPO_PUBLIC_USE_IJTEMA_V2_NAVIGATION = 'false';
const gate21 = SearchService.search('Gate 21')[0];
const block28 = SearchService.search('Block 28')[0];
const preview = V2DirectionsService.calculatePreview({
  startPlace: gate21,
  destination: block28,
  currentLocation: null,
  walkingSpeedMs: 1.4,
});
assert.equal(preview.status, 'ready', 'V2 preview remains available while active navigation rollback is off');
assert.equal(
  V2NavigationAdapter.canStartActiveNavigation({ route: preview.route, destination: block28 }).canStart,
  false,
  'V2 active route must not start when v2 navigation rollback flag is off',
);

// A v2-produced route must never carry sourceVersion 'v1', and a v1-produced
// route must never carry sourceVersion 'v2' — the two routing stacks must not
// bleed into each other's tagging.
assert(preview.route, 'V2DirectionsService preview must return a route for this isolation check');
assert.equal(preview.route!.sourceVersion, 'v2', 'RoutingServiceV2-derived route must be tagged sourceVersion "v2"');
assert.notEqual(preview.route!.sourceVersion, 'v1', 'RoutingServiceV2-derived route must never carry sourceVersion "v1"');

const v1BlockIds = Object.keys(IJTEMA_DATA.blocks);
const v1From = IJTEMA_DATA.blocks.B1 ?? IJTEMA_DATA.blocks[v1BlockIds[0]];
const v1To = IJTEMA_DATA.blocks.B24 ?? IJTEMA_DATA.blocks[v1BlockIds[v1BlockIds.length - 1]];
const v1DestNodes = RoutingService.resolveDestinationNodesFromPlace({
  id: v1To.id,
  name: v1To.name,
  category: 'Block',
  description: v1To.name,
  coordinate: v1To.center,
  sourceVersion: 'v1',
});
const v1Route = RoutingService.calculateRoute(v1From.center, v1DestNodes, undefined, 1.4);
assert(v1Route, 'RoutingService must return a route for this isolation check');
assert.equal(v1Route!.sourceVersion, 'v1', 'RoutingService-derived route must be tagged sourceVersion "v1"');
assert.notEqual(v1Route!.sourceVersion, 'v2', 'RoutingService-derived route must never carry sourceVersion "v2"');

console.log('V1/V2 isolation checks passed.');

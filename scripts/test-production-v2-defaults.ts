import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

import { SearchService } from '../src/services/SearchService';
import { MapFeatureFlagsService } from '../src/services/MapFeatureFlagsService';
import { V2DirectionsService } from '../src/services/V2DirectionsService';
import { V2NavigationAdapter } from '../src/services/V2NavigationAdapter';

delete process.env.EXPO_PUBLIC_USE_IJTEMA_V2_MAP;
delete process.env.EXPO_PUBLIC_USE_IJTEMA_V2_ROUTING;
delete process.env.EXPO_PUBLIC_USE_IJTEMA_V2_NAVIGATION;
delete process.env.EXPO_PUBLIC_USE_IJTEMA_OUTSIDE_STREET_GRAPH;

assert.equal(MapFeatureFlagsService.useIjtemaV2Map(), true, 'v2 map must be the production default when env is unset');
assert.equal(MapFeatureFlagsService.useIjtemaV2Routing(), true, 'v2 routing must be the production default when env is unset');
assert.equal(MapFeatureFlagsService.useIjtemaV2Navigation(), true, 'v2 navigation must be the production default when env is unset');
assert.equal(
  MapFeatureFlagsService.useOutsideStreetGraph(),
  false,
  'Outside street graph must default OFF when env is unset — Phase 1 build, not yet a supported production path',
);

const block42 = SearchService.search('Block 42')[0];
assert.equal(block42?.id, 'B42', 'Production default search must find v2 Block 42');
assert.equal(block42?.sourceVersion, 'v2', 'Production default search must return v2 places');

const allBlocks = SearchService.searchByCategory('blocks');
assert.equal(allBlocks.length, 42, 'Production default block category must use v2 B1-B42');
assert(allBlocks.every((place) => place.sourceVersion === 'v2'), 'Production default blocks must all come from v2 data');

const gate21 = SearchService.search('Gate 21')[0];
const block28 = SearchService.search('Block 28')[0];
const preview = V2DirectionsService.calculatePreview({
  startPlace: gate21,
  destination: block28,
  currentLocation: null,
  walkingSpeedMs: 1.4,
});
assert.equal(preview.status, 'ready', 'Production default directions must use v2 routing');
assert(preview.route, 'Production default directions must produce a v2 route');
assert.equal(
  V2NavigationAdapter.canStartActiveNavigation({ route: preview.route, destination: block28 }).canStart,
  true,
  'Production default active navigation must allow valid v2 routes',
);

for (const [key, value] of [
  ['EXPO_PUBLIC_USE_IJTEMA_V2_MAP', 'false'],
  ['EXPO_PUBLIC_USE_IJTEMA_V2_ROUTING', 'false'],
  ['EXPO_PUBLIC_USE_IJTEMA_V2_NAVIGATION', 'false'],
] as const) {
  process.env[key] = value;
}
assert.equal(MapFeatureFlagsService.useIjtemaV2Map(), false, 'Explicit false must remain an emergency rollback for v2 map');
assert.equal(MapFeatureFlagsService.useIjtemaV2Routing(), false, 'Explicit false must remain an emergency rollback for v2 routing');
assert.equal(MapFeatureFlagsService.useIjtemaV2Navigation(), false, 'Explicit false must remain an emergency rollback for v2 navigation');

process.env.EXPO_PUBLIC_USE_IJTEMA_OUTSIDE_STREET_GRAPH = 'true';
assert.equal(
  MapFeatureFlagsService.useOutsideStreetGraph(),
  true,
  'Outside street graph must turn on when explicitly enabled',
);
delete process.env.EXPO_PUBLIC_USE_IJTEMA_OUTSIDE_STREET_GRAPH;

const featureFlagSource = readFileSync('src/services/MapFeatureFlagsService.ts', 'utf8');
const envExample = readFileSync('.env.example', 'utf8');
const homeViewModelSource = readFileSync('src/viewmodels/HomeViewModel.ts', 'utf8');
assert(featureFlagSource.includes('defaultValue = true'), 'Feature flags must document true production defaults in code');
assert(
  featureFlagSource.includes("readFlag(process.env.EXPO_PUBLIC_USE_IJTEMA_OUTSIDE_STREET_GRAPH, false)"),
  'Outside street graph flag must be explicit about defaulting to false (not yet a supported production path)',
);
assert(envExample.includes('EXPO_PUBLIC_USE_IJTEMA_V2_MAP=true'), '.env.example must document v2 map as production default');
assert(envExample.includes('EXPO_PUBLIC_USE_IJTEMA_V2_ROUTING=true'), '.env.example must document v2 routing as production default');
assert(envExample.includes('EXPO_PUBLIC_USE_IJTEMA_V2_NAVIGATION=true'), '.env.example must document v2 navigation as production default');
assert(
  envExample.includes('EXPO_PUBLIC_USE_IJTEMA_OUTSIDE_STREET_GRAPH=false'),
  '.env.example must document outside street graph as off by default',
);
assert(homeViewModelSource.includes('EntryGateRoutingService'), 'Home production venue status/recenter must use v2 geometry helpers');
assert(homeViewModelSource.includes('MapFeatureFlagsService.useIjtemaV2Map()'), 'Home must select v2 helpers by production map flag');

console.log('Production v2 default checks passed.');

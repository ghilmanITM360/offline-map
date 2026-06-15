import { strict as assert } from 'node:assert';
import { performance } from 'node:perf_hooks';
import { readFileSync } from 'node:fs';

import { SearchService } from '../src/services/SearchService';
import { V2DirectionsService } from '../src/services/V2DirectionsService';
import { V2MapRenderingService } from '../src/services/V2MapRenderingService';

process.env.EXPO_PUBLIC_USE_IJTEMA_V2_MAP = 'true';
process.env.EXPO_PUBLIC_USE_IJTEMA_V2_ROUTING = 'true';
process.env.EXPO_PUBLIC_USE_IJTEMA_V2_NAVIGATION = 'true';

const navigationGraphSource = readFileSync('src/data/ijtema/navigationGraph.ts', 'utf8');
const placeAdapterSource = readFileSync('src/services/V2PlaceAdapter.ts', 'utf8');
const renderingSource = readFileSync('src/services/V2MapRenderingService.ts', 'utf8');
const navigationV2Source = readFileSync('src/viewmodels/NavigationViewModelV2.ts', 'utf8');
const homeScreenSource = readFileSync('src/views/screens/HomeScreen.tsx', 'utf8');

assert(
  navigationGraphSource.includes('const builtGraph = buildNavigationGraphV2();'),
  'V2 graph must be built once at module load, not per route calculation',
);
assert(
  placeAdapterSource.includes('private static allPlacesCache'),
  'V2 search places must be cached instead of rebuilt for every search',
);
assert(
  renderingSource.includes('private static baseLayersCache'),
  'V2 map rendering service must cache static layer geometry',
);
assert(
  !navigationV2Source.includes('V2MapRenderingService.getHomeLayers'),
  'Route progress updates must not rebuild full V2 map layers inside the navigation viewmodel',
);
assert(
  homeScreenSource.includes('tracksViewChanges={false}'),
  'Static custom map labels/markers must disable marker view tracking where possible',
);

const queries = [
  'Block 28',
  'Gate 21',
  'Rasta 09',
  'Shahr-e-Pindal North',
  'بلاک 42',
];

const searchStart = performance.now();
for (let i = 0; i < 50; i += 1) {
  const result = SearchService.search(queries[i % queries.length]);
  assert(result.length > 0, `Search fixture must return results for ${queries[i % queries.length]}`);
}
const searchMs = performance.now() - searchStart;
assert(searchMs < 250, `50 local v2 searches should finish under 250ms, got ${searchMs.toFixed(1)}ms`);

const gate21 = SearchService.search('Gate 21')[0];
const block28 = SearchService.search('Block 28')[0];
const routeStart = performance.now();
for (let i = 0; i < 25; i += 1) {
  const preview = V2DirectionsService.calculatePreview({
    startPlace: gate21,
    destination: block28,
    currentLocation: null,
    walkingSpeedMs: 1.4,
  });
  assert.equal(preview.status, 'ready', 'Repeated Gate 21 to Block 28 routes must stay routable');
  assert(preview.route && preview.route.totalDistance > 0, 'Repeated route distance must stay positive');
}
const routeMs = performance.now() - routeStart;
assert(routeMs < 350, `25 local v2 route calculations should finish under 350ms, got ${routeMs.toFixed(1)}ms`);

const normalLayers = V2MapRenderingService.getHomeLayers({ developerMode: false, graphOnlyFallback: true });
assert.equal(normalLayers.blocks.length, 42, 'Normal mode must render B1-B42 block layers');
assert.equal(normalLayers.rastas.length, 11, 'Normal mode must render Rasta 01-11 layers');
assert.equal(normalLayers.specialRoutes.length, 3, 'Normal mode must render Shahr-e-Pindal visual routes');
assert.equal(normalLayers.developerLabels.length, 0, 'Developer labels must be disabled in normal mode');

const devLayers = V2MapRenderingService.getHomeLayers({ developerMode: true, graphOnlyFallback: true });
assert(devLayers.developerLabels.length > 0, 'Developer labels must remain available only in developer mode');

console.log(`Performance v2 checks passed: 50 searches ${searchMs.toFixed(1)}ms, 25 routes ${routeMs.toFixed(1)}ms.`);

import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

import { SearchService } from '../src/services/SearchService';
import { V2DirectionsService } from '../src/services/V2DirectionsService';
import { V2MapRenderingService } from '../src/services/V2MapRenderingService';
import { V2NavigationAdapter } from '../src/services/V2NavigationAdapter';

delete process.env.EXPO_PUBLIC_USE_IJTEMA_V2_MAP;
delete process.env.EXPO_PUBLIC_USE_IJTEMA_V2_ROUTING;
delete process.env.EXPO_PUBLIC_USE_IJTEMA_V2_NAVIGATION;

const layers = V2MapRenderingService.getHomeLayers({ graphOnlyFallback: true });
assert.equal(layers.useV2Map, true, 'Offline graph-only mode must use v2 map by default');
assert.equal(layers.graphOnlyFallbackSupported, true, 'V2 map layers must support graph-only fallback');
assert.equal(layers.blocks.length, 42, 'Offline graph-only mode must render B1-B42');
assert.equal(layers.rastas.length, 14, 'Offline graph-only mode must render all 14 segments across logical Rasta 01-11');
assert.equal(layers.specialRoutes.length, 3, 'Offline graph-only mode must render Shahr-e-Pindal North/South/West');
assert(layers.gates.length >= 16, 'Offline graph-only mode must render coordinate gates');

const block42 = SearchService.search('Block 42')[0];
assert.equal(block42?.sourceVersion, 'v2', 'Offline search must use local v2 data');

const gate21 = SearchService.search('Gate 21')[0];
const block28 = SearchService.search('Block 28')[0];
const preview = V2DirectionsService.calculatePreview({
  startPlace: gate21,
  destination: block28,
  currentLocation: null,
  walkingSpeedMs: 1.4,
});
assert.equal(preview.status, 'ready', 'Offline directions must use local v2 graph');
assert(preview.route, 'Offline directions must produce route from local graph');
assert(preview.route!.totalDistance > 0, 'Offline route distance must be positive');

const activeRoute = V2NavigationAdapter.fromPreview({
  previewRoute: preview.route!,
  destination: block28,
  startPlace: gate21,
});
assert.equal(activeRoute.sourceVersion, 'v2', 'Offline active navigation must use v2 route shape');
assert(activeRoute.coordinates.length >= 2, 'Offline active navigation must keep route coordinates');

// v1 and v2 live navigation both render in-place on HomeScreen's persistent map (mapgl navigation scenes),
// not on a separate NavigationScreen — see docs/ARCHITECTURE.md.
const homeScreenForTiles = readFileSync('src/views/screens/HomeScreen.tsx', 'utf8');
const navigationMapLayersV2 = readFileSync('src/views/components/mapgl/navigationScene.ts', 'utf8');
assert(
  homeScreenForTiles.includes('<OfflineMapCanvas') && homeScreenForTiles.includes('archiveUri={basemapRejected ? null : basemap.uri}') && !homeScreenForTiles.includes('PROVIDER_GOOGLE'),
  'Home map must render the bundled offline basemap, never Google live tiles',
);
assert(navigationMapLayersV2.includes('mapLayers.blocks'), 'V2 navigation graph-only map must render block context');
assert(navigationMapLayersV2.includes('mapLayers.rastas'), 'V2 navigation graph-only map must render rasta lines');
assert(navigationMapLayersV2.includes('route.coordinates'), 'V2 navigation graph-only map must render active route');

console.log('Offline v2 checks passed.');

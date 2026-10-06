import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

import { SearchService } from '../src/services/SearchService';
import { V2DirectionsService } from '../src/services/V2DirectionsService';
import { V2NavigationAdapter } from '../src/services/V2NavigationAdapter';
import { V2MapRenderingService } from '../src/services/V2MapRenderingService';

process.env.EXPO_PUBLIC_USE_IJTEMA_V2_MAP = 'true';
process.env.EXPO_PUBLIC_USE_IJTEMA_V2_ROUTING = 'true';
process.env.EXPO_PUBLIC_USE_IJTEMA_V2_NAVIGATION = 'true';

let fetchCalls = 0;
const originalFetch = globalThis.fetch;
globalThis.fetch = ((async () => {
  fetchCalls += 1;
  throw new Error('network disabled for offline v2 test');
}) as unknown) as typeof fetch;

try {
  const gate21 = SearchService.search('Gate 21')[0];
  const block28 = SearchService.search('Block 28')[0];
  assert(gate21 && block28, 'Offline search must find local v2 fixtures');

  const preview = V2DirectionsService.calculatePreview({
    startPlace: gate21,
    destination: block28,
    currentLocation: null,
    walkingSpeedMs: 1.4,
  });
  assert.equal(preview.status, 'ready', 'Offline directions must use bundled graph data');
  assert(preview.route, 'Offline directions must produce a local route');

  const activeRoute = V2NavigationAdapter.fromPreview({
    previewRoute: preview.route!,
    destination: block28,
    startPlace: gate21,
  });
  assert.equal(activeRoute.sourceVersion, 'v2', 'Offline active navigation must use v2 route shape');
  assert(activeRoute.coordinates.length >= 2, 'Offline active navigation must retain route geometry');

  const layers = V2MapRenderingService.getHomeLayers({ graphOnlyFallback: true });
  assert.equal(layers.graphOnlyFallbackSupported, true, 'Graph-only fallback must not require downloaded tiles');
  assert.equal(fetchCalls, 0, 'Search, directions, navigation, and graph-only map layers must not call fetch');
} finally {
  globalThis.fetch = originalFetch;
}

const splash = readFileSync('src/views/screens/SplashScreen.tsx', 'utf8');
const appGuide = readFileSync('src/views/screens/AppGuideScreen.tsx', 'utf8');
const directionsScreen = readFileSync('src/views/components/map/LocationSheet.tsx', 'utf8');
// Navigation (v1 and v2 alike) renders on HomeScreen's single shared map, whose only tile source is the bundled archive.
const homeScreenForOffline = readFileSync('src/views/screens/HomeScreen.tsx', 'utf8');

assert(!splash.includes('runNetworkDiagnostics'), 'Startup must not block on network diagnostics');
// #140: nothing on the map/navigation render path may reach for the network — the basemap is a local archive.
for (const f of ['OfflineMapCanvas.tsx', 'basemapStyle.ts', 'overlaySpec.ts', 'navigationScene.ts', 'useBundledBasemap.ts', 'maplibreCameraHandle.ts']) {
  const src = readFileSync(`src/views/components/mapgl/${f}`, 'utf8');
  assert(!/\bfetch\(|XMLHttpRequest|WebSocket|downloadFileAsync/.test(src), `${f} must not use the network`);
}
assert(!readFileSync('src/services/BundledBasemap.ts', 'utf8').match(/\bfetch\(|XMLHttpRequest|downloadFileAsync/), 'The basemap installer must copy locally, never download');
assert(!/without internet|work offline|App Offline/i.test(appGuide), 'Offline is the normal contract: the guide must not carry routine offline reassurance');
assert(!directionsScreen.includes('MapView'), 'Directions start-selection flow must not depend on base map preview while offline');
assert(
  homeScreenForOffline.includes('archiveUri={basemapRejected ? null : basemap.uri}') && !homeScreenForOffline.includes('PROVIDER_GOOGLE'),
  'Home map must never request live tiles: its only source is the bundled archive',
);

console.log('Network/offline v2 checks passed.');

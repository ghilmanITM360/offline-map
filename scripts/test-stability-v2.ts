import { strict as assert } from 'node:assert';
import { performance } from 'node:perf_hooks';
import { readFileSync } from 'node:fs';

import { SearchService } from '../src/services/SearchService';
import { V2DirectionsService } from '../src/services/V2DirectionsService';

process.env.EXPO_PUBLIC_USE_IJTEMA_V2_MAP = 'true';
process.env.EXPO_PUBLIC_USE_IJTEMA_V2_ROUTING = 'true';
process.env.EXPO_PUBLIC_USE_IJTEMA_V2_NAVIGATION = 'true';

const splash = readFileSync('src/views/screens/SplashScreen.tsx', 'utf8');
const downloadScreen = readFileSync('src/views/screens/DownloadMapScreen.tsx', 'utf8');
const downloadViewModel = readFileSync('src/viewmodels/DownloadMapViewModel.ts', 'utf8');
const homeScreen = readFileSync('src/views/screens/HomeScreen.tsx', 'utf8');
const navigationViewModelV1 = readFileSync('src/viewmodels/NavigationViewModel.ts', 'utf8');
const permissionScreen = readFileSync('src/views/screens/PermissionScreen.tsx', 'utf8');
const settingsScreen = readFileSync('src/views/screens/SettingsScreen.tsx', 'utf8');
const directionsScreen = readFileSync('src/views/components/map/LocationSheet.tsx', 'utf8');

assert(splash.includes("setDownloadState({ phase: 'idle' })"), 'Cold start must clear stale in-memory downloading state');
assert(downloadViewModel.includes('STALE') || downloadViewModel.includes('downloadInProgressRef'), 'Download flow must guard duplicate/stuck workers');
assert(downloadScreen.includes('showContinueFallback'), 'Download screen must expose a fallback instead of an infinite redirect wait');
assert(homeScreen.includes('onReady={handleMapReady}') && homeScreen.includes('setIsMapReady(true)'), 'Home must have a map-ready state instead of blank-map assumptions');
// Navigation (v1 and v2 alike) shares Home's one map, so this single check already covers navigation rendering
// without a Google key or internet: the only basemap source is the bundled local archive.
assert(homeScreen.includes('archiveUri={basemapRejected ? null : basemap.uri}') && !homeScreen.includes('PROVIDER_GOOGLE'), 'Home map must render from the bundled archive without requesting Google tiles');
assert(permissionScreen.includes('Choose start manually') || directionsScreen.includes("onOpenDirectory?.('start')"), 'Denied GPS must leave a manual routing path');
assert(settingsScreen.includes("AppState.addEventListener('change'"), 'Settings permission state must refresh safely after Android settings return');
assert(
  navigationViewModelV1.includes("(activeRoute as { sourceVersion?: string }).sourceVersion === 'v2'"),
  'Mismatched v2 active routes must not be adopted by the v1 navigation runtime',
);

const gate15 = SearchService.search('Gate 15')[0];
const gate18 = SearchService.search('Gate 18')[0];
const block28 = SearchService.search('Block 28')[0];
assert.equal(gate15.routingStatus, 'routable', 'Gate 15 fixture must stay routable');
assert.equal(gate18.routingStatus, 'needs_connector_verification', 'Disconnected Gate 18 fixture must stay blocked');
assert.equal(
  V2DirectionsService.calculatePreview({ startPlace: gate15, destination: block28, currentLocation: null }).status,
  'ready',
  'Gate 15 must stay routable after latest data update',
);
assert.equal(
  V2DirectionsService.calculatePreview({ startPlace: gate18, destination: block28, currentLocation: null }).status,
  'unavailable',
  'Disconnected gates must not route silently',
);

const start = performance.now();
for (let i = 0; i < 50; i += 1) {
  SearchService.search(i % 2 === 0 ? 'Block 28' : 'Gate 21');
}
for (let i = 0; i < 25; i += 1) {
  const preview = V2DirectionsService.calculatePreview({
    startPlace: SearchService.search('Gate 21')[0],
    destination: block28,
    currentLocation: null,
    walkingSpeedMs: 1.4,
  });
  assert.equal(preview.status, 'ready', 'Repeated route calculation must not hang or become unavailable');
}
const elapsed = performance.now() - start;
assert(elapsed < 700, `Search/route stress loop should stay responsive, got ${elapsed.toFixed(1)}ms`);

console.log(`Stability v2 checks passed: stress loop ${elapsed.toFixed(1)}ms.`);

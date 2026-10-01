import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

const statusService = readFileSync('src/services/OfflineMapStatusService.ts', 'utf8');
const offlineMapService = readFileSync('src/services/OfflineMapService.ts', 'utf8');
const vm = readFileSync('src/viewmodels/DownloadMapViewModel.ts', 'utf8');
const screen = readFileSync('src/views/screens/DownloadMapScreen.tsx', 'utf8');
const settings = readFileSync('src/views/screens/SettingsScreen.tsx', 'utf8');
const splash = readFileSync('src/views/screens/SplashScreen.tsx', 'utf8');
const startupManager = readFileSync('src/services/StartupManager.ts', 'utf8');

for (const status of ['not_downloaded', 'downloading', 'downloaded', 'corrupt', 'needs_update']) {
  assert(
    `${statusService}\n${vm}\n${splash}\n${startupManager}`.includes(`'${status}'`),
    `Missing map status: ${status}`,
  );
}

assert(statusService.includes('tileCountExpected') && statusService.includes('tileCountSaved'));
assert(statusService.includes('completedAt') && statusService.includes('zoomLevels'));
assert(statusService.includes('OFFLINE_MAP_GRAPH_ONLY_MODE_KEY'));
assert(splash.includes('isGraphOnlyModeEnabled'));
assert(startupManager.includes("checks.graphOnlyModeEnabled && checks.offlineMapStatus === 'not_downloaded'"));

assert(offlineMapService.includes("TileSourceMode = 'disabled' | 'mock' | 'bundled' | 'package'"));
assert(offlineMapService.includes("return 'disabled';"), 'Production must default to no bulk tile source');
assert(offlineMapService.includes('isOfflineTileDownloadAvailable'));
assert(offlineMapService.includes("failureType: 'source_unavailable'"));
assert(!offlineMapService.includes('tile.openstreetmap.org'), 'Public OSM standard tiles must not be a production bulk-download target');
assert(offlineMapService.includes("__DEV__ && configured === 'mock'"), 'Mock source must stay dev-only');

assert(vm.includes('if (!OfflineMapService.isOfflineTileDownloadAvailable())'));
assert(vm.indexOf('if (!OfflineMapService.isOfflineTileDownloadAvailable())') < vm.indexOf('ConnectivityService.getSnapshot()'));
assert(vm.includes('No licensed offline background-map source is configured.'));
assert(screen.includes('offlineTileDownloadAvailable && (isIdle || isCorrupt)'));
assert(!screen.includes("isn't available yet"), 'Release screen must not advertise an unavailable download (#208 F3)');
assert(screen.includes("'Map setup'") && screen.includes('Continue to map'), 'Release build shows one honest Map setup step');
assert(settings.includes('Routing stays offline; a licensed background-map package is not configured'));
assert(screen.includes('Use Venue Map Only'));
assert(screen.includes('navigate inside and around the venue without internet'));

console.log('Offline tile policy checks passed.');

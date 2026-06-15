import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

const statusService = readFileSync('src/services/OfflineMapStatusService.ts', 'utf8');
const offlineMapService = readFileSync('src/services/OfflineMapService.ts', 'utf8');
const vm = readFileSync('src/viewmodels/DownloadMapViewModel.ts', 'utf8');
const screen = readFileSync('src/views/screens/DownloadMapScreen.tsx', 'utf8');
const splash = readFileSync('src/views/screens/SplashScreen.tsx', 'utf8');
const mapBoundsSource = readFileSync('src/data/ijtema/mapBounds.ts', 'utf8');

const statuses = ['not_downloaded', 'downloading', 'downloaded', 'corrupt', 'needs_update'];
for (const status of statuses) {
  assert(statusService.includes(`'${status}'`) || vm.includes(`'${status}'`) || splash.includes(`'${status}'`), `Missing map status: ${status}`);
}

assert(statusService.includes('tileCountExpected'), 'Manifest must include tileCountExpected');
assert(statusService.includes('tileCountSaved'), 'Manifest must include tileCountSaved');
assert(statusService.includes('completedAt'), 'Manifest must include completedAt');
assert(statusService.includes('zoomLevels'), 'Manifest must include zoomLevels');
assert(statusService.includes('bounds'), 'Manifest must include bounds');
assert(statusService.includes('markDownloaded'), 'Status service must support downloaded manifest writes');
assert(statusService.includes('OFFLINE_MAP_ZOOM_LEVELS = [14, 15, 16, 17, 18]'), 'Zoom levels must remain 14-18');

assert(vm.includes('await OfflineMapStatusService.markDownloaded'), 'Download completion must await manifest save');
assert(vm.includes('await OfflineMapStatusService.setDownloadedFlag(true)'), 'Download completion must await downloaded flag save');
assert(vm.includes('await OfflineMapStatusService.validateAtStartup()'), 'Download completion must verify manifest before navigation');
assert(vm.includes('completion already processed - idempotent skip'), 'Completion flow should be idempotent');
assert(vm.includes('downloadTileWithDiagnostics'), 'Download flow must use diagnostic tile downloader');
assert(vm.includes('runNetworkDiagnostics('), 'Download flow must run preflight network diagnostics before tile loop');
assert(vm.includes('TILE_DOWNLOAD_MAX_RETRIES'), 'Download flow must define limited tile retries');
assert(
  vm.includes("setOfflineMapStatus('not_downloaded'") || vm.includes("setOfflineMapStatus(\n        'not_downloaded'"),
  'Failure state should remain retryable and not force corrupt state',
);
assert(vm.includes('Map download failed. Check internet connection and try again.'), 'User-facing download failure message should be actionable');
assert(
  vm.includes('No internet connection.') &&
    vm.includes('DNS failed. Try another network or mobile data.') &&
    vm.includes('Map tile server could not be reached.') &&
    vm.includes('Map server rejected download.') &&
    vm.includes('Download timed out. Try again.'),
  'Download flow should provide specific user-facing diagnostics for network/tile failures',
);

assert(screen.includes('Continue to Map'), 'Fallback continue button must be present');
assert(screen.includes('Repair Download'), 'Corrupt manifest repair UI must be present');
assert(screen.includes('Use venue map only'), 'Download screen should allow graph-only fallback when raster tiles fail');
assert(
  screen.includes('Background map unavailable. Ijtema routes still work.'),
  'Graph-only fallback message should be shown to user when tiles are unavailable',
);

assert(splash.includes("setDownloadState({ phase: 'idle' })"), 'Splash should clear stale in-memory downloading state');
assert(statusService.includes('Stale downloading state cleared'), 'Startup validation must clear stale downloading manifest state');
assert(
  statusService.includes('OFFLINE_MAP_GRAPH_ONLY_MODE_KEY'),
  'Offline map status service should persist graph-only fallback mode',
);
assert(
  splash.includes('isGraphOnlyModeEnabled') && splash.includes("startupStatus.status === 'not_downloaded'"),
  'Splash should route to Main when graph-only mode is enabled and raster map is unavailable',
);

assert(offlineMapService.includes('downloadTileWithDiagnostics'), 'OfflineMapService should expose detailed tile download diagnostics');
assert(offlineMapService.includes('getTileUrl(z: number, x: number, y: number)'), 'OfflineMapService should expose tile URL generation');
assert(
  offlineMapService.includes('export type OfflineDownloadFailureType') &&
    offlineMapService.includes("'dns_failed'") &&
    offlineMapService.includes("'tile_server_unreachable'") &&
    offlineMapService.includes("'http_403'") &&
    offlineMapService.includes("'http_404'") &&
    offlineMapService.includes("'timeout'"),
  'OfflineMapService should classify concrete offline download failure types',
);
assert(
  offlineMapService.includes("type TileSourceMode = 'osm' | 'mock' | 'bundled' | 'package'"),
  'Tile source mode must support osm/mock/bundled/package abstraction',
);
assert(
  offlineMapService.includes('EXPO_PUBLIC_TILE_BASE_URL'),
  'Tile base URL should be configurable through environment variable',
);
assert(
  offlineMapService.includes('runNetworkDiagnostics'),
  'OfflineMapService should expose preflight network diagnostics for offline downloads',
);
assert(
  offlineMapService.includes("__DEV__ && configured === 'mock'"),
  'Mock tile source must be dev-only and opt-in via EXPO_PUBLIC_OFFLINE_TILE_SOURCE',
);
assert(
  offlineMapService.includes('MOCK_TILE_1PX_TRANSPARENT_BASE64'),
  'Mock tile source should exercise manifest/DB pipeline without production network dependency',
);
assert(
  offlineMapService.includes("return 'osm';"),
  'Production must fall back to real OSM source when mock is configured outside DEV',
);
assert(
  offlineMapService.includes('persistTileRecord'),
  'Tile metadata writes should be isolated and explicitly handled',
);

const extractNumber = (name: 'minLat' | 'maxLat' | 'minLng' | 'maxLng'): number => {
  const match = mapBoundsSource.match(new RegExp(`${name}:\\s*([0-9]+\\.[0-9]+)`));
  assert(match?.[1], `Missing ${name} in map bounds source`);
  return Number(match[1]);
};

const minLat = extractNumber('minLat');
const maxLat = extractNumber('maxLat');
const minLng = extractNumber('minLng');
const maxLng = extractNumber('maxLng');

const zoomLevels = [14, 15, 16, 17, 18];
const lon2tile = (lon: number, zoom: number) => Math.floor(((lon + 180) / 360) * Math.pow(2, zoom));
const lat2tile = (lat: number, zoom: number) =>
  Math.floor(
    ((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) *
      Math.pow(2, zoom),
  );

const generatedTiles: Array<{ z: number; x: number; y: number }> = [];
for (const z of zoomLevels) {
  const xMin = lon2tile(minLng, z);
  const xMax = lon2tile(maxLng, z);
  const yMin = lat2tile(maxLat, z);
  const yMax = lat2tile(minLat, z);
  for (let x = xMin; x <= xMax; x += 1) {
    for (let y = yMin; y <= yMax; y += 1) {
      generatedTiles.push({ z, x, y });
    }
  }
}

assert.equal(generatedTiles.length, 214, 'Tile list generation must cover the expanded v2 bounds for configured zoom levels');
const first = generatedTiles[0];
const firstUrl = `https://tile.openstreetmap.org/${first.z}/${first.x}/${first.y}.png`;
assert.equal(first.z, 14, 'First tile should start from zoom 14');
assert.ok(firstUrl.startsWith('https://tile.openstreetmap.org/14/'), 'First tile URL should be valid HTTPS OSM tile URL');

console.log('Offline download checks passed.');

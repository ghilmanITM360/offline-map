import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

import { IJTEMA_MAP_BOUNDS } from '../src/data/ijtema/mapBounds';

const offlineMapService = readFileSync('src/services/OfflineMapService.ts', 'utf8');
const offlineDataService = readFileSync('src/services/OfflineDataService.ts', 'utf8');
const downloadViewModel = readFileSync('src/viewmodels/DownloadMapViewModel.ts', 'utf8');
const statusService = readFileSync('src/services/OfflineMapStatusService.ts', 'utf8');
const store = readFileSync('src/store/useAppStore.ts', 'utf8');

const OFFLINE_MAP_ZOOM_LEVELS = [14, 15, 16, 17, 18];
const lon2tile = (lon: number, zoom: number) =>
  Math.floor(((lon + 180) / 360) * Math.pow(2, zoom));
const lat2tile = (lat: number, zoom: number) =>
  Math.floor(
    ((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) *
      Math.pow(2, zoom),
  );
const expectedTiles = OFFLINE_MAP_ZOOM_LEVELS.reduce((sum, z) => {
  const xMin = lon2tile(IJTEMA_MAP_BOUNDS.minLng, z);
  const xMax = lon2tile(IJTEMA_MAP_BOUNDS.maxLng, z);
  const yMin = lat2tile(IJTEMA_MAP_BOUNDS.maxLat, z);
  const yMax = lat2tile(IJTEMA_MAP_BOUNDS.minLat, z);
  return sum + (xMax - xMin + 1) * (yMax - yMin + 1);
}, 0);
const estimatedSizeMb = Number((expectedTiles * 0.08).toFixed(1));

assert(expectedTiles > 0, 'Offline tile plan must be finite and non-empty');
assert(expectedTiles < 5000, `Offline tile plan must stay bounded for low-end devices, got ${expectedTiles}`);
assert(estimatedSizeMb < 400, `Estimated tile storage must stay bounded, got ${estimatedSizeMb}MB`);
assert.deepEqual(OFFLINE_MAP_ZOOM_LEVELS, [14, 15, 16, 17, 18], 'Offline zoom levels must stay explicit and bounded');

assert(!offlineMapService.includes("import { IJTEMA_DATA }"), 'Offline v2 payload must not import legacy v1 IJTEMA_DATA');
assert(offlineMapService.includes("sourceVersion: 'v2'"), 'Offline payload must identify v2 data');
assert(offlineMapService.includes('navigationGraph: IJTEMA_NAVIGATION_GRAPH_V2'), 'Offline payload must include the v2 graph');
assert(offlineMapService.includes('sizeMB = parseFloat((tileCount * 0.08).toFixed(1))'), 'Tile cache size must be reportable from stored tile count');

assert(offlineMapService.includes('DELETE FROM map_data') && offlineMapService.includes('DELETE FROM tiles'), 'Delete map must clear SQLite map and tile rows');
assert(offlineMapService.includes('getTileDir().delete()'), 'Delete map must remove tile files from disk');
assert(offlineMapService.includes('throw new Error(`Offline map delete failed'), 'Delete map cleanup failures must not be swallowed');
assert(offlineDataService.includes('OfflineMapStatusService.clearManifest()'), 'Delete map must clear manifest');
assert(offlineDataService.includes('OfflineMapStatusService.setGraphOnlyMode(false)'), 'Delete map must clear graph-only mode');
assert(store.includes('resetDownloadState'), 'Delete/update flow must be able to clear stale download state');

assert(downloadViewModel.includes('tileExists'), 'Retry/repair must skip already saved tiles instead of duplicating them');
assert(downloadViewModel.includes('markDownloading(downloaded)'), 'Failed downloads must leave a retryable manifest');
assert(downloadViewModel.includes('continueWithVenueMapOnly'), 'Tile download must remain optional for internal navigation');
assert(statusService.includes('STALE_DOWNLOADING_MS'), 'Startup must clear stale downloading state to avoid an infinite download screen');

console.log(`Storage v2 checks passed: ${expectedTiles} bounded tiles, estimated ${estimatedSizeMb}MB.`);

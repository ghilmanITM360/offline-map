import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

// #140: the visual map is bundled with the app and renders with no network. There is no tile download, LocalTile layer,
// satellite imagery or "map not downloaded" state any more — these guards keep that true.
const home = readFileSync('src/views/screens/HomeScreen.tsx', 'utf8');
const layersSheet = readFileSync('src/views/components/map/LayersSheet.tsx', 'utf8');
const basemapStyle = readFileSync('src/views/components/mapgl/basemapStyle.ts', 'utf8');

assert(home.includes('<OfflineMapCanvas') && home.includes('archiveUri={basemap.uri}'), 'Home must render the bundled offline basemap');
assert(!home.includes('LocalTile') && !home.includes('getTilePath'), 'Home must not use downloaded raster tiles');
assert(!home.includes('Background map not downloaded') && !home.includes('Satellite unavailable offline'), 'Home must not show missing-map or satellite copy');
assert(!layersSheet.includes('Satellite'), 'The layers sheet must not offer satellite imagery (it needs the internet)');
assert(!/https?:\/\//.test(basemapStyle.replace(/\/\/.*$/gm, '')), 'The basemap style must contain no remote URL');
assert(basemapStyle.includes('pmtiles://'), 'The basemap style must read the local PMTiles archive');

console.log('Offline rendering checks passed.');

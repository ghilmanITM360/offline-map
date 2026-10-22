import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { buildBasemapStyle } from '../src/views/components/mapgl/basemapStyle';

// #140: the visual map is bundled with the app and renders with no network. There is no tile download, LocalTile layer,
// satellite imagery or "map not downloaded" state any more — these guards keep that true.
const home = readFileSync('src/views/screens/HomeScreen.tsx', 'utf8');
const layersSheet = readFileSync('src/views/components/map/LayersSheet.tsx', 'utf8');
const basemapStyle = readFileSync('src/views/components/mapgl/basemapStyle.ts', 'utf8');

assert(home.includes('<OfflineMapCanvas') && home.includes('archiveUri={basemapRejected ? null : basemap.uri}'), 'Home must render the bundled offline basemap');
assert(!home.includes('LocalTile') && !home.includes('getTilePath'), 'Home must not use downloaded raster tiles');
assert(!home.includes('Background map not downloaded') && !home.includes('Satellite unavailable offline'), 'Home must not show missing-map or satellite copy');
assert(!layersSheet.includes('Satellite'), 'The layers sheet must not offer satellite imagery (it needs the internet)');
for (const platform of ['android', 'ios']) {
  const style = buildBasemapStyle('file:///map.pmtiles', { min: 12, max: 16 }, platform);
  const resources = { ...style, sources: Object.fromEntries(Object.entries(style.sources).map(([id, source]) => [id, { ...source, attribution: undefined }])) };
  assert(!/https?:\/\//.test(JSON.stringify(resources)), 'Basemap resources must be local; attribution links are not fetched');
}
assert(basemapStyle.includes('pmtiles://'), 'The basemap style must read the local PMTiles archive');

console.log('Offline rendering checks passed.');

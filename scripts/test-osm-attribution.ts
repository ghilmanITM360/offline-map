import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const attribution = readFileSync('src/views/components/map/OsmAttribution.tsx', 'utf8');
const home = readFileSync('src/views/screens/HomeScreen.tsx', 'utf8');
const basemapStyle = readFileSync('src/views/components/mapgl/basemapStyle.ts', 'utf8');
const canvas = readFileSync('src/views/components/mapgl/OfflineMapCanvas.tsx', 'utf8');

// The offline-OSM route pill keeps its explicit ODbL credit.
assert(attribution.includes('© OpenStreetMap contributors · ODbL'));
assert(attribution.includes('https://www.openstreetmap.org/copyright'));
assert(home.includes("outsideRouteProvider(activePreviewRoute ?? activeRoute) === 'offline-osm'"));
assert(home.includes('<OsmAttribution'));

// The bundled basemap is OSM-derived data: its attribution rides on the style source and the map's attribution control is on.
assert(basemapStyle.includes("BASEMAP_ATTRIBUTION = '© OpenStreetMap contributors'"));
assert(/attribution: BASEMAP_ATTRIBUTION/.test(basemapStyle));
assert(/\battribution\b\s*\n/.test(canvas) && canvas.includes('attributionPosition='), 'The canvas must show the OSM attribution control');

// Public-tile policy: nothing in the app or the data pipeline references the OSM tile servers.
const scan = (dir: string) => readdirSync(dir).map((f) => `${dir}/${f}`).filter((f) => /\.(ts|tsx|mjs)$/.test(f));
for (const file of [...scan('src/views/components/mapgl'), ...scan('scripts/offline-map'), 'src/services/BundledBasemap.ts']) {
  assert(!/https?:\/\/(tile|vector)\.openstreetmap\.org/.test(readFileSync(file, 'utf8')), `${file} must not reference the OSM tile servers`);
}

console.log('OSM attribution and public-tile policy checks passed.');

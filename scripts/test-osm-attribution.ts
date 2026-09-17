import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const attribution = readFileSync('src/views/components/map/OsmAttribution.tsx', 'utf8');
const home = readFileSync('src/views/screens/HomeScreen.tsx', 'utf8');
const offline = readFileSync('src/services/OfflineMapService.ts', 'utf8');

assert(attribution.includes('© OpenStreetMap contributors · ODbL'));
assert(attribution.includes('https://www.openstreetmap.org/copyright'));
assert(home.includes("baseMapMode === 'LOCAL_TILES'"));
assert(home.includes("outsideRouteProvider(activePreviewRoute ?? activeRoute) === 'offline-osm'"));
assert(home.includes('<OsmAttribution'));
assert(!offline.includes('tile.openstreetmap.org'));

console.log('OSM attribution and public-tile policy checks passed.');

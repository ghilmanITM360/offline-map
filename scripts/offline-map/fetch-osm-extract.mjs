// Fetches the OSM *data* (not map tiles) for the Ijtema basemap bbox from the Overpass API and
// stores it as a PBF snapshot in the repo, so the basemap archive is reproducible offline.
// Run manually when the basemap should be refreshed:  node scripts/offline-map/fetch-osm-extract.mjs
// Requires: osmium (brew install osmium-tool). Data © OpenStreetMap contributors, ODbL.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BBOX, OUT_EXTRACT, EXTRACT_META } from './config.mjs';

const [s, w, n, e] = [BBOX.south, BBOX.west, BBOX.north, BBOX.east];
const query = `[out:xml][timeout:120][bbox:${s},${w},${n},${e}];
(
  way[highway];way[building];way[landuse];way[natural];way[leisure];way[waterway];way[railway];way[amenity];
  rel[landuse];rel[natural=water];rel[leisure];rel[building];
  node[place];node[amenity];node[name][shop];
);
(._;>;);
out meta;`;

const ENDPOINTS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
let xml;
for (let attempt = 0; attempt < 6 && !xml; attempt++) {
  const url = ENDPOINTS[attempt % ENDPOINTS.length];
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'User-Agent': 'ijtema-offline-map-build/1.0 (data extract for bundled basemap)' },
    body: new URLSearchParams({ data: query }),
  }).catch(() => null);
  if (res?.ok) xml = Buffer.from(await res.arrayBuffer());
  else {
    console.error(`Overpass ${url} -> ${res?.status ?? 'network error'}, retrying`);
    await new Promise((r) => setTimeout(r, 15000));
  }
}
if (!xml) throw new Error('Overpass unavailable after retries');
const osmBase = /<meta osm_base="([^"]+)"/.exec(xml.toString('utf8', 0, 2000))?.[1] ?? 'unknown';

const dir = mkdtempSync(join(tmpdir(), 'ijtema-osm-'));
const raw = join(dir, 'raw.osm');
writeFileSync(raw, xml);
execFileSync('osmium', ['cat', raw, '-f', 'pbf', '-o', OUT_EXTRACT, '--overwrite'], { stdio: 'inherit' });

const sha256 = createHash('sha256').update(readFileSync(OUT_EXTRACT)).digest('hex');
writeFileSync(
  EXTRACT_META,
  JSON.stringify(
    { source: 'OpenStreetMap data via Overpass API (overpass-api.de)', osmBase, extractedAt: new Date().toISOString(), bbox: BBOX, query, file: OUT_EXTRACT, sha256 },
    null,
    2,
  ) + '\n',
);
console.log(`extract ${OUT_EXTRACT} sha256=${sha256} osmBase=${osmBase}`);

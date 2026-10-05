// Builds the bundled offline basemap (PMTiles, MVT) from the committed OSM PBF snapshot.
// Fully offline & deterministic given the snapshot:  node scripts/offline-map/build-basemap.mjs
// Requires: osmium, tippecanoe, pmtiles (brew install osmium-tool tippecanoe pmtiles).
// Data © OpenStreetMap contributors, ODbL. Never derived from tile servers or Google data.
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BBOX, ZOOM, OUT_EXTRACT, EXTRACT_META, OUT_ARCHIVE, OUT_PROVENANCE } from './config.mjs';

const sh = (cmd, args, opts = {}) => execFileSync(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], ...opts }).toString();
const sha256 = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');
const dir = mkdtempSync(join(tmpdir(), 'ijtema-basemap-'));

// Why each layer / minzoom exists (kept in provenance so size growth is justified):
//  roads     — walking context around the venue; classes thin out at low zoom (major z12, minor z14, paths z15)
//  landuse   — calm green/area context; z13+
//  water     — orientation; z12+
//  buildings — only a handful mapped here; z15+
//  places    — named POIs/places for optional labels later; z14+
const ROAD_CLASS = {
  motorway: ['major', 12], trunk: ['major', 12], primary: ['major', 12], secondary: ['major', 12],
  motorway_link: ['major', 13], trunk_link: ['major', 13], primary_link: ['major', 13], secondary_link: ['major', 13],
  tertiary: ['minor', 13], tertiary_link: ['minor', 14], residential: ['minor', 14], unclassified: ['minor', 14],
  living_street: ['minor', 14], service: ['minor', 15],
  footway: ['path', 15], path: ['path', 15], pedestrian: ['path', 15], steps: ['path', 15], track: ['path', 15], cycleway: ['path', 15],
};
const out = { roads: [], landuse: [], water: [], buildings: [], places: [] };

const geojsonseq = join(dir, 'all.geojsonseq');
sh('osmium', ['export', OUT_EXTRACT, '-f', 'geojsonseq', '-o', geojsonseq, '--overwrite']);
for (const line of readFileSync(geojsonseq, 'utf8').split('\n')) {
  if (!line.trim()) continue;
  const f = JSON.parse(line.replace(/^\x1e/, ''));
  const p = f.properties ?? {};
  const t = f.geometry.type;
  const isLine = t === 'LineString' || t === 'MultiLineString';
  const isPoly = t === 'Polygon' || t === 'MultiPolygon';
  const feat = (properties, minzoom) => ({ type: 'Feature', geometry: f.geometry, properties, tippecanoe: { minzoom } });
  if (p.highway && isLine && ROAD_CLASS[p.highway]) {
    const [cls, minzoom] = ROAD_CLASS[p.highway];
    out.roads.push(feat({ class: cls, kind: p.highway, ...(p.name && cls !== 'path' ? { name: p.name } : {}) }, minzoom));
  } else if (p.building && isPoly) out.buildings.push(feat({}, 15));
  else if ((p.natural === 'water' || p.waterway || p.water) && (isPoly || isLine)) out.water.push(feat({}, 12));
  else if ((p.landuse || p.leisure || p.natural) && isPoly) out.landuse.push(feat({ class: p.landuse ?? p.leisure ?? p.natural }, 13));
  else if (t === 'Point' && p.name && (p.place || p.amenity || p.shop)) {
    out.places.push(feat({ name: p.name, class: p.place ?? p.amenity ?? p.shop }, 14));
  }
}

const counts = {};
const layerArgs = [];
for (const [name, feats] of Object.entries(out)) {
  const file = join(dir, `${name}.geojsonseq`);
  writeFileSync(file, feats.map((x) => JSON.stringify(x)).join('\n') + '\n');
  counts[name] = feats.length;
  if (feats.length) layerArgs.push('-L', `${name}:${file}`);
}

const mbtiles = join(dir, 'basemap.mbtiles');
const bounds = `${BBOX.west},${BBOX.south},${BBOX.east},${BBOX.north}`;
const tippArgs = ['-o', mbtiles, '-Z', String(ZOOM.min), '-z', String(ZOOM.max), '--force', '--quiet', '--no-tile-size-limit', '--drop-densest-as-needed', '--clip-bounding-box', bounds, ...layerArgs];
sh('tippecanoe', tippArgs);
sh('pmtiles', ['convert', mbtiles, OUT_ARCHIVE]);

const extract = JSON.parse(readFileSync(EXTRACT_META, 'utf8'));
const bytes = statSync(OUT_ARCHIVE).size;
const provenance = {
  schemaVersion: 1,
  purpose: 'Bundled offline basemap for the Ijtema app (#140). Shipped in the APK, copied to app-private storage on first launch. No network download.',
  archive: { file: OUT_ARCHIVE, format: 'PMTiles v3 / MVT, gzip', bytes, sha256: sha256(OUT_ARCHIVE) },
  bounds: BBOX,
  zoom: { min: ZOOM.min, max: ZOOM.max, note: 'Vector tiles; renderer overzooms beyond maxzoom for navigation (zoom ~18).' },
  layers: Object.fromEntries(Object.keys(out).map((k) => [k, counts[k]])),
  source: { ...extract, extractFile: OUT_EXTRACT },
  license: 'Open Database License (ODbL) 1.0 — https://opendatacommons.org/licenses/odbl/1-0/',
  attribution: '© OpenStreetMap contributors',
  notDerivedFrom: ['tile.openstreetmap.org', 'vector.openstreetmap.org', 'Google Maps imagery or data'],
  toolchain: {
    osmium: sh('osmium', ['--version']).split('\n')[0],
    tippecanoe: spawnSync('tippecanoe', ['--version'], { encoding: 'utf8' }).stderr.trim(),
    pmtiles: sh('pmtiles', ['version']).trim(),
    commands: [
      'node scripts/offline-map/fetch-osm-extract.mjs   # refresh snapshot (needs network; only when updating)',
      'node scripts/offline-map/build-basemap.mjs       # offline, from the committed snapshot',
      `osmium export ${OUT_EXTRACT} -f geojsonseq`,
      `tippecanoe -o basemap.mbtiles -Z ${ZOOM.min} -z ${ZOOM.max} --force --no-tile-size-limit --drop-densest-as-needed --clip-bounding-box ${bounds} -L roads:… -L landuse:… -L water:… -L buildings:… -L places:…`,
      `pmtiles convert basemap.mbtiles ${OUT_ARCHIVE}`,
    ],
  },
  builtAt: new Date().toISOString(),
};
writeFileSync(OUT_PROVENANCE, JSON.stringify(provenance, null, 2) + '\n');
console.log(`archive ${OUT_ARCHIVE} ${bytes} bytes sha256=${provenance.archive.sha256}`, counts);

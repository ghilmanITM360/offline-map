import { strict as assert } from 'node:assert';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { IJTEMA_MAP_BOUNDS } from '../src/data/ijtema/mapBounds';

// Guards #140: the bundled offline basemap archive is the one described by its provenance record,
// is legally attributed, covers the venue, and was never sourced from a public tile server.

const prov = JSON.parse(readFileSync('assets/offline-map/BASEMAP_PROVENANCE.json', 'utf8'));
const extractProv = JSON.parse(readFileSync('data/offline-map/EXTRACT_PROVENANCE.json', 'utf8'));
const sha256 = (p: string) => createHash('sha256').update(readFileSync(p)).digest('hex');

// Archive identity.
assert.equal(sha256(prov.archive.file), prov.archive.sha256, 'archive SHA-256 must match BASEMAP_PROVENANCE.json — rebuild or update provenance together.');
assert.equal(statSync(prov.archive.file).size, prov.archive.bytes, 'archive size must match provenance.');
assert.equal(sha256(extractProv.file), extractProv.sha256, 'OSM extract snapshot SHA-256 must match EXTRACT_PROVENANCE.json.');
assert.equal(prov.source.sha256, extractProv.sha256, 'basemap provenance must reference the committed extract snapshot.');

// PMTiles v3 header: magic, version, tile type MVT (1), zoom range.
const header = readFileSync(prov.archive.file).subarray(0, 127);
assert.equal(header.subarray(0, 7).toString('latin1'), 'PMTiles', 'archive must be a PMTiles file.');
assert.equal(header[7], 3, 'archive must be PMTiles spec v3.');
assert.equal(header[99], 1, 'archive tile type must be MVT (vector).');
assert.equal(header[100], prov.zoom.min, 'header min zoom must match provenance.');
assert.equal(header[101], prov.zoom.max, 'header max zoom must match provenance.');

// Legal / provenance fields (ODbL attribution is mandatory for OSM-derived data).
assert.equal(prov.attribution, '© OpenStreetMap contributors');
assert.match(prov.license, /ODbL/);
assert(prov.notDerivedFrom.includes('tile.openstreetmap.org') && prov.notDerivedFrom.includes('Google Maps imagery or data'));
assert(Date.parse(prov.source.extractedAt) > 0 && prov.source.osmBase, 'extraction date and OSM base timestamp must be recorded.');

// Coverage: the venue bounds and the bundled street-graph extent must be inside the archive bbox.
const b = prov.bounds;
assert(b.south <= IJTEMA_MAP_BOUNDS.minLat && b.north >= IJTEMA_MAP_BOUNDS.maxLat, 'basemap must cover the venue latitude range.');
assert(b.west <= IJTEMA_MAP_BOUNDS.minLng && b.east >= IJTEMA_MAP_BOUNDS.maxLng, 'basemap must cover the venue longitude range.');
assert(b.south <= 24.9448 && b.north >= 24.9986 && b.west <= 66.9768 && b.east >= 67.0362, 'basemap must cover the bundled street-graph extent.');

// Size budget guard: growth must be a deliberate decision (bounds/zoom/layers), not an accident.
assert(prov.archive.bytes <= 5 * 1024 * 1024, `basemap archive grew past 5 MiB (${prov.archive.bytes}); justify and raise the budget deliberately.`);

// No public OSM tile-server URLs anywhere in the pipeline (bulk prefetch is prohibited by OSMF).
for (const f of readdirSync('scripts/offline-map')) {
  const text = readFileSync(`scripts/offline-map/${f}`, 'utf8');
  const urls = text.match(/https?:\/\/[^\s'"`]+/g) ?? [];
  for (const u of urls) {
    assert(!/(^|\.)(tile|vector)\.openstreetmap\.org/.test(new URL(u).hostname), `pipeline must not reference OSM tile servers: ${f} -> ${u}`);
  }
}

console.log('Offline basemap provenance checks passed.');

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// C5.3: the Expo consumer's second bundled pack, so the app can show two venues and prove they stay isolated. It is the consumer's SYNTHETIC
// four-node demo venue (not a surveyed place), shipped with the same Karachi archive because a pack needs a map and the demo sits inside it.
//   node --import tsx scripts/sdk-pack/demo.ts <outDir> [--write-pin]
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { describeDemoPlace, demoVenue } from '../../examples/expo-consumer/demoVenue';
import { compilePack, pinFor, type CompiledPack, type PackBuildSpec } from './compile';
import { KARACHI_PMTILES_SHA256 } from './karachi';
import { createHash } from 'node:crypto';
import { createPackOutput } from './output';
import { PACK_CATALOG_SCHEMA_VERSION, PACK_GEOMETRY_SCHEMA_VERSION, toGeoJsonRing } from '../../packages/offline-navigation/src/index';

const REPO = resolve(__dirname, '../..');
const BASEMAP = join(REPO, 'assets/offline-map/ijtema-basemap.pmtiles');
export const DEMO_PIN_FILE = join(__dirname, 'synthetic-demo-venue.pin.json');
/** The external-shareable synthetic preset: the same invented venue plus invented geometry and catalog (needs SDK >= 0.1.1). */
export const DEMO_PRESET_VERSION = '1.1.0';
export const DEMO_PRESET_PIN_FILE = join(__dirname, 'synthetic-demo-venue-1.1.0.pin.json');
const M = 1 / 111_320; // degrees of latitude per metre
const json = (v: unknown): string => `${JSON.stringify(v, null, 1)}\n`;

type DemoNode = { id: string; lat: number; lng: number };
/**
 * Invented geometry and catalog for the synthetic venue: two blocks (their route ends at a corridor node, a legacy boundary point), one gate with
 * no connector, one ilaqa and one tent that have no location yet. Every coordinate is an offset from the invented corridor; none is surveyed.
 */
const syntheticPresetResources = (venueId: string, nodes: DemoNode[], places: Array<{ id: string; kind: string; nodeIds: string[] }>): Record<string, string> => {
  const at = (id: string) => nodes.find((n) => n.id === id)!;
  const lng = (lat: number) => M / Math.cos((lat * Math.PI) / 180);
  const box = (c: { lat: number; lng: number }, northM: number, halfH: number, halfW: number) => {
    const mid = { lat: c.lat + northM * M, lng: c.lng };
    return [{ lat: mid.lat - halfH * M, lng: mid.lng - halfW * lng(mid.lat) }, { lat: mid.lat - halfH * M, lng: mid.lng + halfW * lng(mid.lat) }, { lat: mid.lat + halfH * M, lng: mid.lng + halfW * lng(mid.lat) }, { lat: mid.lat + halfH * M, lng: mid.lng - halfW * lng(mid.lat) }];
  };
  const names: Record<string, [string, string, string]> = {
    entrance: ['Entrance', 'داخلہ', 'Dakhla'], courtyard: ['Courtyard', 'صحن', 'Sehan'], hall: ['Hall', 'ہال', 'Hall'], annex: ['Annex', 'ملحقہ عمارت', 'Mulhiqa Imarat'],
    closed_gate: ['Closed Gate', 'بند گیٹ', 'Band Gate'], demo_ilaqa: ['Demo Ilaqa', 'ڈیمو علاقہ', 'Demo Ilaqa'], demo_tent: ['Demo Tent', 'ڈیمو خیمہ', 'Demo Khaima'],
  };
  const nm = (id: string) => ({ en: names[id][0], ur: names[id][1], 'ur-Latn': names[id][2] });
  const point = (id: string, kind: string, c: { lat: number; lng: number }, props: object = {}) => ({ type: 'Feature', id, geometry: { type: 'Point', coordinates: [c.lng, c.lat] }, properties: { kind, ...props } });
  const features: unknown[] = [];
  const blockIds = ['hall', 'annex'];
  for (const id of blockIds) {
    const node = at(places.find((p) => p.id === id)!.nodeIds[0]);
    const ring = box(node, 25, 15, 30);
    features.push({ type: 'Feature', id, geometry: { type: 'Polygon', coordinates: [toGeoJsonRing(ring)] }, properties: { kind: 'block', placeId: id } });
    features.push(point(`${id}#center`, 'block-center', { lat: node.lat + 25 * M, lng: node.lng }, { placeId: id }));
    features.push(point(`${id}#access`, 'access-point', node, { blockId: id, verification: 'LEGACY_UNVERIFIED', nodeId: node.id }));
  }
  const gate = at('a');
  features.push(point('entrance#point', 'gate', gate, { placeId: 'entrance', status: 'routable' }));
  const closed = { lat: gate.lat - 30 * M, lng: gate.lng + 40 * lng(gate.lat) };
  features.push(point('closed_gate#point', 'gate', closed, { placeId: 'closed_gate', status: 'unreachable' }));
  features.push({ type: 'Feature', id: 'corridor', geometry: { type: 'MultiLineString', coordinates: [nodes.map((n) => [n.lng, n.lat])] }, properties: { kind: 'special-route', label: 'Synthetic corridor' } });
  const src = { source: 'synthetic: invented for the sample app, not surveyed' };
  const base = { provenance: src, flags: ['DRAFT_TRANSLATION'] };
  const catalogPlaces = [
    { id: 'entrance', category: 'gate', names: nm('entrance'), aliases: [], location: 'verified', routing: 'routable', coordinate: { lat: gate.lat, lng: gate.lng }, nodeIds: ['a'], ...base },
    { id: 'courtyard', category: 'facility', names: nm('courtyard'), aliases: [], location: 'verified', routing: 'routable', coordinate: { lat: at('b').lat, lng: at('b').lng }, nodeIds: ['b'], ...base },
    ...blockIds.map((id) => {
      const node = at(places.find((p) => p.id === id)!.nodeIds[0]);
      return { id, category: 'block', names: nm(id), aliases: [], location: 'verified', routing: 'provisional', routingReason: 'LEGACY_BOUNDARY_ACCESS', coordinate: { lat: node.lat + 25 * M, lng: node.lng }, nodeIds: [node.id], ...base };
    }),
    { id: 'closed_gate', category: 'gate', names: nm('closed_gate'), aliases: [], location: 'verified', routing: 'unreachable', routingReason: 'NO_VERIFIED_CONNECTOR', coordinate: { lat: closed.lat, lng: closed.lng }, nodeIds: [], ...base },
    { id: 'demo_ilaqa', category: 'ilaqa', names: nm('demo_ilaqa'), aliases: [], marhala: 1, location: 'pending', routing: 'not-located', routingReason: 'LOCATION_PENDING', nodeIds: [], provenance: src, flags: ['DRAFT_TRANSLATION', 'NEEDS_REVIEW'] },
    { id: 'demo_tent', category: 'tent', names: nm('demo_tent'), aliases: [], parentId: 'demo_ilaqa', location: 'pending', routing: 'not-located', routingReason: 'LOCATION_PENDING', nodeIds: [], provenance: src, flags: ['DRAFT_TRANSLATION'] },
  ];
  return {
    'data/venue-geometry.json': json({ schemaVersion: PACK_GEOMETRY_SCHEMA_VERSION, venueId, type: 'FeatureCollection', features }),
    'data/place-catalog.json': json({ schemaVersion: PACK_CATALOG_SCHEMA_VERSION, venueId, places: catalogPlaces }),
    'data/localization.json': json({
      schemaVersion: 1, venueId, languages: ['en', 'ur', 'ur-Latn'], entries: places.map((p) => ({ id: p.id, names: nm(p.id) })),
      note: 'Synthetic names. The Urdu and Roman Urdu are unreviewed drafts.',
    }),
  };
};

export const buildDemoPack = async (outDir: string, options: { write?: boolean; preset?: boolean } = { write: true }): Promise<CompiledPack> => {
  outDir = createPackOutput(outDir);
  const preset = options.preset === true;
  const archive = readFileSync(BASEMAP);
  if (createHash('sha256').update(archive).digest('hex') !== KARACHI_PMTILES_SHA256) throw new Error('the tracked PMTiles archive no longer matches its recorded digest');
  const basemap = JSON.parse(readFileSync(join(REPO, 'assets/offline-map/BASEMAP_PROVENANCE.json'), 'utf8'));
  const venueId = demoVenue.venueId;
  const nodes = demoVenue.graph.nodeIds().map((id) => ({ id, lat: demoVenue.graph.getNode(id)!.coordinate.lat, lng: demoVenue.graph.getNode(id)!.coordinate.lng }));
  const edges = demoVenue.graph.nodeIds().flatMap((from) => demoVenue.graph.edgesFrom(from).map((e) => ({ from, to: e.to, distanceM: e.distanceM })));
  const places = demoVenue.placeIds().map((id) => ({ id, kind: demoVenue.getPlace(id)!.kind, nodeIds: [...demoVenue.getPlace(id)!.nodeIds] }));
  const files: Record<string, string> = {
    'data/routing-graph.json': json({ schemaVersion: 1, venueId, dataVersion: demoVenue.dataVersion, nodes, edges }),
    'data/place-directory.json': json({ schemaVersion: 1, venueId, places }),
    'data/gate-metadata.json': json({ schemaVersion: 1, venueId, gates: [] }),
    'data/localization.json': json({
      schemaVersion: 1, venueId, languages: ['en'],
      entries: places.map((p) => ({ id: p.id, names: { en: describeDemoPlace(p).title } })),
    }),
    'PROVENANCE.json': json({
      schemaVersion: 1, venueId, synthetic: true,
      note: 'Four corridor nodes invented for the sample app. Not a surveyed place and follows no real path.',
      basemap: { archive: basemap.archive, attribution: basemap.attribution, license: basemap.license },
    }),
  };
  if (preset) Object.assign(files, syntheticPresetResources(venueId, nodes, places));
  mkdirSync(join(outDir, 'map'), { recursive: true });
  copyFileSync(BASEMAP, join(outDir, 'map/ijtema-basemap.pmtiles'));
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(outDir, path)), { recursive: true });
    writeFileSync(join(outDir, path), content);
  }
  const spec: PackBuildSpec = {
    packId: `${venueId}@${preset ? DEMO_PRESET_VERSION : '1.0.0'}`, venueId, packVersion: preset ? DEMO_PRESET_VERSION : '1.0.0', sdkCompatibility: preset ? '>=0.1.1 <0.2.0' : '>=0.1.0 <0.2.0', routingPolicyVersion: 'demo-1',
    createdAt: String(basemap.builtAt).replace(/\.\d+Z$/, 'Z'), minimumPlatformCapabilities: ['pmtiles-local-read'],
    bounds: { west: basemap.bounds.west, south: basemap.bounds.south, east: basemap.bounds.east, north: basemap.bounds.north },
    languages: preset ? ['en', 'ur', 'ur-Latn'] : ['en'],
    resources: [
      { path: 'map/ijtema-basemap.pmtiles', kind: 'map-archive' },
      { path: 'data/routing-graph.json', kind: 'routing-graph' },
      { path: 'data/place-directory.json', kind: 'place-directory' },
      { path: 'data/gate-metadata.json', kind: 'gate-metadata' },
      { path: 'data/localization.json', kind: 'localization' },
      { path: 'PROVENANCE.json', kind: 'provenance' },
      ...(preset ? [{ path: 'data/venue-geometry.json', kind: 'venue-geometry' as const }, { path: 'data/place-catalog.json', kind: 'place-catalog' as const }] : []),
    ],
    attributions: [{ name: '© OpenStreetMap contributors', license: 'ODbL-1.0', url: 'https://www.openstreetmap.org/copyright' }],
    provenance: { source: 'Synthetic demo venue over the OpenStreetMap basemap', licence: 'ODbL-1.0 (basemap)', generatedBy: 'scripts/sdk-pack/demo.ts' },
  };
  return compilePack(outDir, spec, { write: options.write ?? true });
};

if (require.main === module) {
  const [out, ...flags] = process.argv.slice(2);
  if (!out) { console.error('usage: demo.ts <outDir> [--preset] [--write-pin]'); process.exit(2); }
  const preset = flags.includes('--preset');
  buildDemoPack(out, { write: true, preset }).then((pack) => {
    const pin = pinFor(pack);
    if (flags.includes('--write-pin')) writeFileSync(preset ? DEMO_PRESET_PIN_FILE : DEMO_PIN_FILE, json(pin));
    console.log(JSON.stringify(pin));
  }, (e) => { console.error(e); process.exit(1); });
}

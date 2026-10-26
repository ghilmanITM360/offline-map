/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// C5.3: the Expo consumer's second bundled pack, so the app can show two venues and prove they stay isolated. It is the consumer's SYNTHETIC
// four-node demo venue (not a surveyed place), shipped with the same Karachi archive because a pack needs a map and the demo sits inside it.
//   node --import tsx scripts/sdk-pack/demo.ts <outDir> [--write-pin]
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { describeDemoPlace, demoVenue } from '../../examples/expo-consumer/demoVenue';
import { compilePack, pinFor, type CompiledPack, type PackBuildSpec } from './compile';
import { KARACHI_PMTILES_SHA256 } from './karachi';
import { createHash } from 'node:crypto';

const REPO = resolve(__dirname, '../..');
const BASEMAP = join(REPO, 'assets/offline-map/ijtema-basemap.pmtiles');
export const DEMO_PIN_FILE = join(__dirname, 'synthetic-demo-venue.pin.json');
const json = (v: unknown): string => `${JSON.stringify(v, null, 1)}\n`;

export const buildDemoPack = async (outDir: string, options: { write?: boolean } = { write: true }): Promise<CompiledPack> => {
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
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(join(outDir, 'map'), { recursive: true });
  copyFileSync(BASEMAP, join(outDir, 'map/ijtema-basemap.pmtiles'));
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(outDir, path)), { recursive: true });
    writeFileSync(join(outDir, path), content);
  }
  const spec: PackBuildSpec = {
    packId: `${venueId}@1.0.0`, venueId, packVersion: '1.0.0', sdkCompatibility: '>=0.1.0 <0.2.0', routingPolicyVersion: 'demo-1',
    createdAt: String(basemap.builtAt).replace(/\.\d+Z$/, 'Z'), minimumPlatformCapabilities: ['pmtiles-local-read'],
    bounds: { west: basemap.bounds.west, south: basemap.bounds.south, east: basemap.bounds.east, north: basemap.bounds.north },
    languages: ['en'],
    resources: [
      { path: 'map/ijtema-basemap.pmtiles', kind: 'map-archive' },
      { path: 'data/routing-graph.json', kind: 'routing-graph' },
      { path: 'data/place-directory.json', kind: 'place-directory' },
      { path: 'data/gate-metadata.json', kind: 'gate-metadata' },
      { path: 'data/localization.json', kind: 'localization' },
      { path: 'PROVENANCE.json', kind: 'provenance' },
    ],
    attributions: [{ name: '© OpenStreetMap contributors', license: 'ODbL-1.0', url: 'https://www.openstreetmap.org/copyright' }],
    provenance: { source: 'Synthetic demo venue over the OpenStreetMap basemap', licence: 'ODbL-1.0 (basemap)', generatedBy: 'scripts/sdk-pack/demo.ts' },
  };
  return compilePack(outDir, spec, { write: options.write ?? true });
};

if (require.main === module) {
  const [out, flag] = process.argv.slice(2);
  if (!out) { console.error('usage: demo.ts <outDir> [--write-pin]'); process.exit(2); }
  buildDemoPack(resolve(out)).then((pack) => {
    const pin = pinFor(pack);
    if (flag === '--write-pin') writeFileSync(DEMO_PIN_FILE, json(pin));
    console.log(JSON.stringify(pin));
  }, (e) => { console.error(e); process.exit(1); });
}

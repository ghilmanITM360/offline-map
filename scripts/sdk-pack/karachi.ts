/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// C5.2: builds the bundled Karachi (Ijtema) pack from tracked assets and data, deterministically.
//   node --import tsx scripts/sdk-pack/karachi.ts <outDir> [--write-pin]
// The pack is a pure export of what the repository already contains: the PMTiles archive, the V2 navigation graph, the gate records
// and place names. Nothing is added; Gates 18/19 keep the (absence of) connectivity they have today. The manifest is unsigned: the app
// pins its digest (karachi-ijtema.pin.json) and that, plus being inside the signed app binary, is what authenticates it.
import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { IJTEMA_BLOCKS } from '../../src/data/ijtema/blocks';
import { IJTEMA_GATES } from '../../src/data/ijtema/gates';
import { MAJOR_GATE_IDS } from '../../src/data/ijtema/gateMeta';
import { IJTEMA_VENUE_SOURCE } from '../../src/data/ijtema/venueAdapter';
import type { LocalizedLabel } from '../../src/data/ijtema/types';
import { compilePack, type CompiledPack, type PackBuildSpec } from './compile';

const REPO = resolve(__dirname, '../..');
const BASEMAP = join(REPO, 'assets/offline-map/ijtema-basemap.pmtiles');
const BASEMAP_PROVENANCE = join(REPO, 'assets/offline-map/BASEMAP_PROVENANCE.json');
const DATA_MANIFEST = join(REPO, 'src/data/ijtema/DATA_MANIFEST.json');
export const KARACHI_PIN_FILE = join(__dirname, 'karachi-ijtema.pin.json');
/** The tracked archive's digest: the build refuses to ship a different one under this pack id. */
export const KARACHI_PMTILES_SHA256 = 'd5e6883d55d55b0fa9e3230ab92585fb25a8949551528ef4d176192384a28cc0';

const VENUE_ID = IJTEMA_VENUE_SOURCE.venueId;
const PACK_VERSION = '1.0.0';
const LANGUAGES = ['en', 'ur', 'ur-Latn'];
const sha = (b: Uint8Array): string => createHash('sha256').update(b).digest('hex');
const json = (v: unknown): string => `${JSON.stringify(v, null, 1)}\n`;

const names = (n: LocalizedLabel): Record<string, string> => ({ en: n.en, ur: n.ur ?? n.en, 'ur-Latn': n.romanUrdu ?? n.en });

export const buildKarachiPack = async (outDir: string, options: { write?: boolean } = { write: true }): Promise<CompiledPack> => {
  const archive = readFileSync(BASEMAP);
  if (sha(archive) !== KARACHI_PMTILES_SHA256) throw new Error('the tracked PMTiles archive no longer matches its recorded digest');
  const basemap = JSON.parse(readFileSync(BASEMAP_PROVENANCE, 'utf8'));
  if (basemap.archive.sha256 !== KARACHI_PMTILES_SHA256) throw new Error('BASEMAP_PROVENANCE.json disagrees with the archive digest');
  const dataManifest = JSON.parse(readFileSync(DATA_MANIFEST, 'utf8'));

  // Same iteration as the host's adapter, so node/edge/place order (which breaks routing ties) is preserved exactly.
  const source = IJTEMA_VENUE_SOURCE;
  const nodes = source.graph.nodeIds().map((id) => {
    const n = source.graph.getNode(id)!;
    return { id, lat: n.coordinate.lat, lng: n.coordinate.lng };
  });
  const edges = source.graph.nodeIds().flatMap((from) => source.graph.edgesFrom(from).map((e) => ({
    from, to: e.to, distanceM: e.distanceM, ...(e.weightMultiplier === undefined ? {} : { weightMultiplier: e.weightMultiplier }),
  })));
  const places = source.placeIds().map((id) => source.getPlace(id)!).map((p) => ({ id: p.id, kind: p.kind, nodeIds: [...p.nodeIds] }));

  const label = new Map<string, LocalizedLabel>([...IJTEMA_GATES.map((g) => [g.id, g.name] as const), ...IJTEMA_BLOCKS.map((b) => [b.id, b.name] as const)]);
  const entries = places.map((p) => ({ id: p.id, names: names(label.get(p.id) ?? { en: p.id }) }));
  const gates = IJTEMA_GATES.map((g) => ({
    id: g.id, number: g.number, lat: g.coordinate?.lat, lng: g.coordinate?.lng, status: g.status, routingStatus: g.routingStatus,
    entryRole: g.entryRole, canStartRouteFromOutside: g.canStartRouteFromOutside, connectorStatus: g.connectorStatus,
    major: MAJOR_GATE_IDS.has(g.id), userFacingBehavior: g.userFacingBehavior, sourceNotes: g.sourceNotes ?? [],
  }));

  const files: Record<string, string | Buffer> = {
    'data/routing-graph.json': json({ schemaVersion: 1, venueId: VENUE_ID, dataVersion: source.dataVersion, nodes, edges }),
    'data/place-directory.json': json({ schemaVersion: 1, venueId: VENUE_ID, places }),
    'data/gate-metadata.json': json({ schemaVersion: 1, venueId: VENUE_ID, gates }),
    'data/localization.json': json({
      schemaVersion: 1, venueId: VENUE_ID, languages: LANGUAGES, entries,
      note: 'Names are the strings the host app already ships. They have not had an independent language review.',
    }),
    'PROVENANCE.json': json({
      schemaVersion: 1, venueId: VENUE_ID,
      basemap: { ...basemap, builtAt: basemap.builtAt },
      venueData: { ...dataManifest.provenance, counts: dataManifest.counts, graphVersion: source.dataVersion },
      knownLimitations: [
        'GATE_18 has no valid graph connector within 320 m of any internal path; blocked pending physical field survey (docs/KNOWN_LIMITATIONS_AND_OWNER_ACTIONS.md).',
        'GATE_19 field connectivity is deferred pending physical ground truth.',
        'Outside-venue routing is not part of this pack.',
      ],
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
    packId: `${VENUE_ID}@${PACK_VERSION}`, venueId: VENUE_ID, packVersion: PACK_VERSION,
    sdkCompatibility: '>=0.1.0 <0.2.0', routingPolicyVersion: '2026-06-ijtema-v2',
    createdAt: String(basemap.builtAt).replace(/\.\d+Z$/, 'Z'),
    minimumPlatformCapabilities: ['pmtiles-local-read'],
    bounds: { west: basemap.bounds.west, south: basemap.bounds.south, east: basemap.bounds.east, north: basemap.bounds.north },
    languages: LANGUAGES,
    resources: [
      { path: 'map/ijtema-basemap.pmtiles', kind: 'map-archive' },
      { path: 'data/routing-graph.json', kind: 'routing-graph' },
      { path: 'data/place-directory.json', kind: 'place-directory' },
      { path: 'data/gate-metadata.json', kind: 'gate-metadata' },
      { path: 'data/localization.json', kind: 'localization' },
      { path: 'PROVENANCE.json', kind: 'provenance' },
    ],
    attributions: [
      { name: '© OpenStreetMap contributors', license: 'ODbL-1.0', url: 'https://www.openstreetmap.org/copyright' },
      { name: 'Ijtema venue survey data (project owner)', license: 'Owner-supplied; redistribution terms are not recorded in this repository' },
    ],
    provenance: {
      source: 'OpenStreetMap data via Overpass API (basemap); project-owner venue survey (routing graph, gates, blocks)',
      licence: 'ODbL-1.0 (basemap); owner terms (venue data)',
      sourceRevision: `osm ${basemap.source.osmBase}; venue data ${dataManifest.provenance.dataVersion}; graph ${source.dataVersion}`,
      generatedBy: 'scripts/sdk-pack/karachi.ts',
    },
  };
  return compilePack(outDir, spec, { write: options.write ?? true });
};

if (require.main === module) {
  const [out, flag] = process.argv.slice(2);
  if (!out) { console.error('usage: karachi.ts <outDir> [--write-pin]'); process.exit(2); }
  buildKarachiPack(resolve(out)).then((pack) => {
    const pin = {
      packId: pack.manifest.packId, manifestSha256: pack.manifestSha256, manifestBytes: Buffer.byteLength(pack.manifestText),
      resources: pack.manifest.resources.map((r) => ({ path: r.path, kind: r.kind, bytes: r.bytes, sha256: r.sha256 })),
    };
    if (flag === '--write-pin') writeFileSync(KARACHI_PIN_FILE, json(pin));
    console.log(JSON.stringify(pin));
  }, (e) => { console.error(e); process.exit(1); });
}

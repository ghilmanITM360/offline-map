import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { PACK_MANIFEST_FILE, sha256Hex, type PackManifest } from '@muslim-ummah/offline-navigation';
import type { PackAssetCopier } from './bundledPacks';
import { textSha256 } from './packRuntime';

// Builds small but complete packs on disk, laid out the way the SDK repository's compiler lays them out, for tests that need real files.
export const ARCHIVE = Buffer.from(Array.from({ length: 5000 }, (_, i) => (i * 13) % 256));
const json = (v: unknown): string => `${JSON.stringify(v)}\n`;

export interface BuiltPack { id: string; sha: string; files: string[] }

export const buildPack = async (app: string, venueId: string, version = '1.0.0', over: { graph?: unknown; catalog?: unknown; geometry?: unknown } = {}): Promise<BuiltPack> => {
  const dir = join(app, `${venueId}@${version}`);
  mkdirSync(join(dir, 'data'), { recursive: true });
  mkdirSync(join(dir, 'map'), { recursive: true });
  const files: Record<string, Buffer | string> = {
    'map/ijtema-basemap.pmtiles': ARCHIVE,
    'data/routing-graph.json': json(over.graph ?? {
      schemaVersion: 1, venueId, dataVersion: 'd', nodes: [{ id: 'a', lat: 24.97, lng: 67.0 }, { id: 'b', lat: 24.971, lng: 67.0 }],
      edges: [{ from: 'a', to: 'b', distanceM: 111 }, { from: 'b', to: 'a', distanceM: 111 }],
    }),
    'data/place-directory.json': json({ schemaVersion: 1, venueId, places: [{ id: 'p1', kind: 'room', nodeIds: ['a'] }, { id: 'p2', kind: 'room', nodeIds: ['b'] }] }),
    'data/gate-metadata.json': json({ schemaVersion: 1, venueId, gates: [] }),
    'data/localization.json': json({ schemaVersion: 1, venueId, languages: ['en'], entries: [{ id: 'p1', names: { en: `${venueId} one` } }, { id: 'p2', names: { en: `${venueId} two` } }] }),
    'PROVENANCE.json': json({ schemaVersion: 1, venueId }),
    ...(over.catalog === undefined ? {} : { 'data/place-catalog.json': json(over.catalog) }),
    ...(over.geometry === undefined ? {} : { 'data/venue-geometry.json': json(over.geometry) }),
  };
  const kinds: Record<string, PackManifest['resources'][number]['kind']> = {
    'map/ijtema-basemap.pmtiles': 'map-archive', 'data/routing-graph.json': 'routing-graph', 'data/place-directory.json': 'place-directory',
    'data/gate-metadata.json': 'gate-metadata', 'data/localization.json': 'localization', 'PROVENANCE.json': 'provenance',
    'data/place-catalog.json': 'place-catalog', 'data/venue-geometry.json': 'venue-geometry',
  };
  const resources = Object.entries(files).map(([path, content]) => {
    writeFileSync(join(dir, path), content);
    const b = Buffer.from(content);
    return { path, kind: kinds[path], bytes: b.length, sha256: sha256Hex(b) };
  }).sort((x, y) => (x.path < y.path ? -1 : 1));
  const manifest: PackManifest = {
    schemaVersion: 1, packId: `${venueId}@${version}`, venueId, packVersion: version, sdkCompatibility: over.catalog !== undefined || over.geometry !== undefined ? '>=0.1.1 <0.2.0' : '>=0.1.0 <0.2.0', routingPolicyVersion: '1',
    createdAt: '2026-10-05T09:02:46Z', minimumPlatformCapabilities: ['pmtiles-local-read'], bounds: { west: 66.9, south: 24.9, east: 67.1, north: 25.1 }, languages: ['en'],
    totalBytes: resources.reduce((n, r) => n + r.bytes, 0), fileCount: resources.length, resources,
    attributions: [{ name: '© OpenStreetMap contributors', license: 'ODbL-1.0' }], provenance: { source: 'test', licence: 'ODbL-1.0' },
  };
  const text = `${JSON.stringify(manifest, null, 2)}\n`;
  writeFileSync(join(dir, PACK_MANIFEST_FILE), text);
  return { id: manifest.packId, sha: await textSha256(text), files: [PACK_MANIFEST_FILE, ...Object.keys(files)] };
};

/** Stands in for the packaged assets: reads from `app/<id>/<path>`; can be made to fail partway through a copy. */
export const directoryCopier = (app: string, device: string, failAfter = Infinity): PackAssetCopier & { copies(): number } => {
  let copies = 0;
  return {
    copies: () => copies,
    readText: async (id, path) => readFileSync(join(app, id, path), 'utf8'),
    copy: async (id, path, destination) => {
      if (copies++ >= failAfter) throw new Error('storage failed');
      mkdirSync(dirname(join(device, destination)), { recursive: true });
      cpSync(join(app, id, path), join(device, destination));
    },
  };
};

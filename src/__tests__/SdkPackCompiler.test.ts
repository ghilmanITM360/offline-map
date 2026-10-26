/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// C5.2: the deterministic pack compiler, on real directories. Every refusal the compiler promises is exercised, and the
// output is checked against the SDK's own parser/verifier and a PackManager install, so the compiler cannot drift from them.
import { createHash } from 'node:crypto';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createFileSystemPackStore, createPackManager, PACK_MANIFEST_FILE, parsePackManifest, verifyPack, type PackFileSystem,
} from '@muslim-ummah/offline-navigation';
import { compilePack, PackCompileError, type PackBuildSpec } from '../../scripts/sdk-pack/compile';
import { createNodePackFileSystem } from '../../scripts/sdk-pack/nodePackFileSystem';

const nodeSha = (b: Uint8Array | string): string => createHash('sha256').update(b).digest('hex');
let work: string;
beforeEach(() => { work = mkdtempSync(join(tmpdir(), 'sdk-compile-')); });
afterEach(() => { rmSync(work, { recursive: true, force: true }); });

const KINDS = ['map-archive', 'routing-graph', 'place-directory', 'gate-metadata', 'localization', 'provenance'] as const;
const FILE: Record<typeof KINDS[number], string> = {
  'map-archive': 'map/basemap.pmtiles', 'routing-graph': 'data/routing-graph.json', 'place-directory': 'data/place-directory.json',
  'gate-metadata': 'data/gate-metadata.json', localization: 'data/localization.json', provenance: 'PROVENANCE.json',
};

const makeDir = (name: string, venueId = 'venue-a'): string => {
  const dir = join(work, name);
  mkdirSync(join(dir, 'map'), { recursive: true });
  mkdirSync(join(dir, 'data'), { recursive: true });
  writeFileSync(join(dir, FILE['map-archive']), Buffer.from(Array.from({ length: 3000 }, (_, i) => (i * 31) % 251)));
  for (const kind of KINDS.filter((k) => k !== 'map-archive')) writeFileSync(join(dir, FILE[kind]), JSON.stringify({ venueId, kind }));
  return dir;
};
const specFor = (venueId = 'venue-a', patch: Partial<PackBuildSpec> = {}): PackBuildSpec => ({
  packId: `${venueId}@1.0.0`, venueId, packVersion: '1.0.0', sdkCompatibility: '>=0.1.0 <0.2.0', routingPolicyVersion: '1',
  createdAt: '2026-10-05T09:02:46Z', minimumPlatformCapabilities: ['pmtiles-local-read'],
  bounds: { west: 66.97, south: 24.94, east: 67.04, north: 25.0 }, languages: ['en'],
  resources: KINDS.map((kind) => ({ path: FILE[kind], kind })),
  attributions: [{ name: '© OpenStreetMap contributors', license: 'ODbL-1.0', url: 'https://www.openstreetmap.org/copyright' }],
  provenance: { source: 'OpenStreetMap via Overpass', licence: 'ODbL-1.0', generatedBy: 'scripts/sdk-pack/compile.ts' },
  ...patch,
});

describe('compilePack output', () => {
  it('lists every resource sorted by path with real sizes and SHA-256, correct totals, and no signature', async () => {
    const dir = makeDir('a');
    const { manifest, manifestText, manifestSha256 } = await compilePack(dir, specFor());
    expect(manifest.resources.map((r) => r.path)).toEqual([...Object.values(FILE)].sort());
    for (const r of manifest.resources) {
      const bytes = readFileSync(join(dir, r.path));
      expect(r).toMatchObject({ bytes: bytes.length, sha256: nodeSha(bytes) });
    }
    expect(manifest.fileCount).toBe(6);
    expect(manifest.totalBytes).toBe(manifest.resources.reduce((n, r) => n + r.bytes, 0));
    expect(manifest.keyId).toBeUndefined();
    expect(manifest.signatureAlgorithm).toBeUndefined();
    expect(manifestSha256).toBe(nodeSha(manifestText));
    expect(parsePackManifest(manifestText)).toMatchObject({ ok: true });
    expect(manifestText.endsWith('\n')).toBe(true);
  });

  it('writes pack.manifest.json beside the resources and the result verifies as an unsigned (trust none) or pinned pack', async () => {
    const dir = makeDir('a');
    const { manifestText, manifestSha256 } = await compilePack(dir, specFor(), { write: true });
    expect(readFileSync(join(dir, PACK_MANIFEST_FILE), 'utf8')).toBe(manifestText);
    const fs = createNodePackFileSystem(dir);
    const reader = {
      stat: async (p: string) => { const b = readFileSync(join(dir, p)); return { bytes: b.length, sha256: nodeSha(b) }; },
      list: async () => (await fs.listFilesRecursive('.')).filter((p) => p !== PACK_MANIFEST_FILE),
    };
    expect(await verifyPack(manifestText, { reader })).toMatchObject({ ok: true, trust: 'none' });
    expect(await verifyPack(manifestText, { reader, manifestSha256: async (t) => nodeSha(t) }, { pinnedManifestSha256: manifestSha256 })).toMatchObject({ ok: true, trust: 'pinned' });
  });

  it('recompiling a directory that already holds a manifest gives the same bytes', async () => {
    const dir = makeDir('a');
    const first = await compilePack(dir, specFor(), { write: true });
    const second = await compilePack(dir, specFor(), { write: true });
    expect(second.manifestText).toBe(first.manifestText);
  });
});

describe('determinism', () => {
  it('is byte-identical across repeated runs, a copy at another path with other mtimes, and another declaration order', async () => {
    const dir = makeDir('a');
    const first = (await compilePack(dir, specFor())).manifestText;
    expect((await compilePack(dir, specFor())).manifestText).toBe(first);

    const copy = join(work, 'elsewhere', 'deeply', 'nested');
    mkdirSync(copy, { recursive: true });
    cpSync(dir, copy, { recursive: true });
    for (const p of Object.values(FILE)) utimesSync(join(copy, p), new Date('2001-01-01'), new Date('2002-02-02'));
    const reordered = specFor('venue-a', { resources: [...specFor().resources].reverse() });
    const other = (await compilePack(copy, reordered)).manifestText;
    expect(other).toBe(first);
    expect(first).not.toContain(work);
    expect(first).not.toContain(tmpdir());
    expect(first.match(/\d{4}-\d\d-\d\dT[\d:.]+Z/g)).toEqual(['2026-10-05T09:02:46Z']);
  });

  it('createdAt comes only from the spec: the wall clock never enters the output', async () => {
    const dir = makeDir('a');
    const spy = jest.spyOn(Date, 'now').mockReturnValue(Date.parse('2031-03-03T00:00:00Z'));
    try {
      expect((await compilePack(dir, specFor())).manifest.createdAt).toBe('2026-10-05T09:02:46Z');
    } finally { spy.mockRestore(); }
  });
});

describe('compilePack refuses', () => {
  const refused = async (dir: string, spec: PackBuildSpec, code: string, needle?: string): Promise<void> => {
    const e = await compilePack(dir, spec).then(() => null, (x: unknown) => x);
    expect(e).toBeInstanceOf(PackCompileError);
    expect((e as PackCompileError).code).toBe(code);
    if (needle) expect((e as PackCompileError).message).toContain(needle);
  };

  it('a declared resource that is missing from the directory', async () => {
    const dir = makeDir('a');
    rmSync(join(dir, FILE['place-directory']));
    await refused(dir, specFor(), 'resource-missing', FILE['place-directory']);
  });

  it('a file in the directory that the spec does not declare (nothing ships by accident)', async () => {
    const dir = makeDir('a');
    writeFileSync(join(dir, 'data/stray.json'), '{}');
    await refused(dir, specFor(), 'resource-undeclared', 'data/stray.json');
  });

  it('a missing mandatory resource kind', async () => {
    const dir = makeDir('a');
    const spec = specFor('venue-a', { resources: specFor().resources.filter((r) => r.kind !== 'gate-metadata') });
    rmSync(join(dir, FILE['gate-metadata']));
    await refused(dir, spec, 'required-resource-missing', 'gate-metadata');
  });

  it('an unsupported resource kind', async () => {
    const dir = makeDir('a');
    const spec = specFor('venue-a', { resources: [...specFor().resources, { path: 'data/extra.json', kind: 'turn-by-turn' as never }] });
    writeFileSync(join(dir, 'data/extra.json'), '{}');
    await refused(dir, spec, 'kind-unsupported', 'turn-by-turn');
  });

  it('duplicate paths, including paths that differ only in case or Unicode form', async () => {
    const dir = makeDir('a');
    const twice = specFor('venue-a', { resources: [...specFor().resources, { path: FILE['provenance'], kind: 'provenance' }] });
    await refused(dir, twice, 'resource-duplicate');
    const folded = specFor('venue-a', { resources: [...specFor().resources, { path: 'DATA/Routing-Graph.json', kind: 'map-style' }] });
    await refused(dir, folded, 'resource-duplicate');
  });

  it('a second resource of the same kind', async () => {
    const dir = makeDir('a');
    writeFileSync(join(dir, 'data/graph2.json'), JSON.stringify({ venueId: 'venue-a' }));
    const spec = specFor('venue-a', { resources: [...specFor().resources, { path: 'data/graph2.json', kind: 'routing-graph' }] });
    await refused(dir, spec, 'resource-duplicate');
  });

  it.each(['../outside.json', '/etc/passwd', 'data/../../x.json', 'data\\x.json', 'C:/x.json', 'data//x.json', 'data/./x.json', 'run.js', 'data/CON.json', 'data/x.json '])(
    'the unsafe path %j', async (path) => {
      const dir = makeDir('a');
      const spec = specFor('venue-a', { resources: [...specFor().resources, { path, kind: 'map-style' }] });
      await refused(dir, spec, 'resource-path-unsafe');
    },
  );

  it('a symlink to a file outside the directory, to a file inside it, and a symlinked directory', async () => {
    const outside = join(work, 'secret.json');
    writeFileSync(outside, JSON.stringify({ venueId: 'venue-a', secret: true }));
    const escape = makeDir('escape');
    rmSync(join(escape, FILE['gate-metadata']));
    symlinkSync(outside, join(escape, FILE['gate-metadata']));
    await refused(escape, specFor(), 'symlink-refused', FILE['gate-metadata']);

    const inside = makeDir('inside');
    rmSync(join(inside, FILE['localization']));
    symlinkSync(join(inside, FILE['provenance']), join(inside, FILE['localization']));
    await refused(inside, specFor(), 'symlink-refused', FILE['localization']);

    const dirLink = makeDir('dirlink');
    mkdirSync(join(work, 'real-dir'));
    writeFileSync(join(work, 'real-dir/x.json'), '{}');
    symlinkSync(join(work, 'real-dir'), join(dirLink, 'linked'));
    await refused(dirLink, specFor(), 'symlink-refused', 'linked');

    const dangling = makeDir('dangling');
    symlinkSync(join(work, 'nowhere'), join(dangling, 'data/dangling.json'));
    await refused(dangling, specFor(), 'symlink-refused', 'dangling.json');
  });

  it('a pack directory that is itself a symlink or does not exist', async () => {
    const real = makeDir('real');
    symlinkSync(real, join(work, 'link'));
    await refused(join(work, 'link'), specFor(), 'directory-invalid');
    await refused(join(work, 'absent'), specFor(), 'directory-invalid');
  });

  it('invalid version metadata', async () => {
    const dir = makeDir('a');
    await refused(dir, specFor('venue-a', { packVersion: '1.0' }), 'field-invalid', 'packVersion');
    await refused(dir, specFor('venue-a', { packVersion: 'v1.0.0' }), 'field-invalid', 'packVersion');
    await refused(dir, specFor('venue-a', { sdkCompatibility: 'latest' }), 'field-invalid', 'sdkCompatibility');
    await refused(dir, specFor('venue-a', { sdkCompatibility: '>=0.2.0 <0.1.0' }), 'sdk-incompatible'); // empty range: no SDK could ever load it
    await refused(dir, specFor('venue-a', { sdkCompatibility: '>=0.2.0 <0.3.0' }), 'sdk-incompatible'); // not this SDK
    await refused(dir, specFor('venue-a', { createdAt: 'yesterday' }), 'field-invalid', 'createdAt');
  });

  it('missing attribution or provenance', async () => {
    const dir = makeDir('a');
    await refused(dir, specFor('venue-a', { attributions: [] }), 'field-invalid', 'attributions');
    await refused(dir, specFor('venue-a', { provenance: { source: '', licence: 'ODbL-1.0' } }), 'field-invalid', 'provenance');
    await refused(dir, specFor('venue-a', { attributions: [{ name: 'OSM', license: 'ODbL', url: 'http://insecure.example' }] }), 'field-invalid');
  });

  it('a venue id that conflicts with the venue id inside a data resource, or is absent from one', async () => {
    const dir = makeDir('a', 'venue-b'); // data says venue-b
    await refused(dir, specFor('venue-a'), 'venue-conflict', 'venue-b'); // reported at the first data file in path order
    const missing = makeDir('m');
    writeFileSync(join(missing, FILE['place-directory']), JSON.stringify({ places: [] }));
    await refused(missing, specFor(), 'venue-conflict', FILE['place-directory']);
    const notJson = makeDir('n');
    writeFileSync(join(notJson, FILE['gate-metadata']), '{ nope');
    await refused(notJson, specFor(), 'resource-invalid', FILE['gate-metadata']);
    await refused(makeDir('p'), specFor('Not A Venue', { packId: 'venue-a@1.0.0' }), 'field-invalid', 'venueId');
  });

  it('a pack id that does not name this venue and version (ids must never be reusable across venues)', async () => {
    const dir = makeDir('a');
    await refused(dir, specFor('venue-a', { packId: 'venue-b@1.0.0' }), 'pack-id-mismatch');
    await refused(dir, specFor('venue-a', { packId: 'venue-a@1.0.1' }), 'pack-id-mismatch');
  });

  it('a file that changes while it is being hashed', async () => {
    const dir = makeDir('a');
    const file = join(dir, FILE['map-archive']);
    const original = readFileSync(file);
    let calls = 0;
    const fs = createNodePackFileSystem(dir);
    const racing: PackFileSystem = {
      ...fs,
      async size(p) { const s = await fs.size(p); if (p === FILE['map-archive'] && ++calls === 1) writeFileSync(file, Buffer.concat([original, Buffer.from('tail')])); return s; },
    };
    const e = await compilePack(dir, specFor(), { fs: racing }).then(() => null, (x: unknown) => x);
    expect(e).toMatchObject({ code: 'resource-changed' });
    expect((e as Error).message).toContain(FILE['map-archive']);
  });
});

describe('compiled packs through the PackManager', () => {
  it('two venues with identical file names compile to isolated packs that install and resolve independently', async () => {
    const root = join(work, 'device');
    mkdirSync(root);
    const fs = createNodePackFileSystem(root);
    const manager = createPackManager({
      store: createFileSystemPackStore({ fs, chunkBytes: 1024 }), sdkVersion: '0.1.0', platformCapabilities: ['pmtiles-local-read'],
      reserveBytes: 0, requireSignature: false, ports: { manifestSha256: async (t) => nodeSha(t) },
    });
    await manager.recover();
    for (const venue of ['venue-a', 'venue-b']) {
      const staged = join(root, 'packs/staging', venue);
      cpSync(makeDir(venue, venue), staged, { recursive: true });
      await compilePack(staged, specFor(venue), { write: true });
      expect(await manager.installStaged(venue, { venueId: venue })).toMatchObject({ ok: true });
    }
    const a = await manager.resolveActive('venue-a');
    const b = await manager.resolveActive('venue-b');
    expect(a?.manifest.venueId).toBe('venue-a');
    expect(b?.manifest.venueId).toBe('venue-b');
    expect(a?.ref.id).not.toBe(b?.ref.id);
    expect(a?.manifest.resources.find((r) => r.kind === 'routing-graph')?.sha256)
      .not.toBe(b?.manifest.resources.find((r) => r.kind === 'routing-graph')?.sha256);
    // a pack compiled for one venue cannot be installed under the other's name
    const staged = join(root, 'packs/staging', 'swap');
    cpSync(makeDir('swap-src', 'venue-b'), staged, { recursive: true });
    await compilePack(staged, specFor('venue-b'), { write: true });
    expect(await manager.installStaged('swap', { venueId: 'venue-a' })).toMatchObject({ ok: false });
  });
});

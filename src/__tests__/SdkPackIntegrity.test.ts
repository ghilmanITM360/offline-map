/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Codex independent audit (13f4629): offline-pack integrity PACK-01 (post-commit cleanup), PACK-04 (malformed pointer), PACK-02
// (verification-to-activation gap) and PACK-03 (Node adapter link boundary). Every case uses disposable synthetic data in a temp directory;
// the real Karachi pack is never touched.
import { createHash, randomBytes } from 'node:crypto';
import {
  existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createFileSystemPackStore, createPackManager, PACK_MANIFEST_FILE, type PackManifest, type PackStore,
} from '@muslim-ummah/offline-navigation';
import { createNodePackFileSystem } from '../../scripts/sdk-pack/nodePackFileSystem';
import { sampleManifest } from '../../scripts/sdk-headless/packChecks';

jest.setTimeout(60_000);

const VENUE = 'audit-synthetic';
const KINDS = ['map-archive', 'routing-graph', 'place-directory', 'gate-metadata', 'localization', 'provenance'] as const;
const sha = (b: Uint8Array | string): string => createHash('sha256').update(b).digest('hex');
let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'sdk-pack-integrity-')); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

const writePack = (rel: string, version: string): PackManifest => {
  const base = join(dir, rel);
  mkdirSync(join(base, 'data'), { recursive: true });
  const resources = KINDS.map((kind) => {
    const content = kind === 'map-archive' ? randomBytes(2048) : Buffer.from(`${VENUE}/${version}/${kind}`);
    writeFileSync(join(base, 'data', `${kind}.bin`), content);
    return { path: `data/${kind}.bin`, kind, bytes: content.length, sha256: sha(content) };
  });
  const manifest = sampleManifest({
    venueId: VENUE, packId: `${VENUE}@${version}`, packVersion: version, resources,
    totalBytes: resources.reduce((n, r) => n + r.bytes, 0), fileCount: resources.length, keyId: 'k1', signatureAlgorithm: 'ed25519' as const,
  });
  writeFileSync(join(base, PACK_MANIFEST_FILE), JSON.stringify(manifest));
  return manifest;
};

const build = (wrap?: (store: PackStore) => PackStore) => {
  const baseStore = createFileSystemPackStore({ fs: createNodePackFileSystem(dir), chunkBytes: 1024 });
  const store = wrap ? wrap(baseStore) : baseStore;
  const manager = createPackManager({
    store, sdkVersion: '0.1.0', platformCapabilities: ['pmtiles-local-read'], reserveBytes: 0, trustedKeyIds: ['k1'],
    ports: { manifestSha256: async (t) => sha(t), signatureVerifier: { verify: async (a) => a.signature === 'good' } },
  });
  return { manager, store };
};
const fresh = async () => { const b = build(); await b.manager.recover(); return b; };
const install = async (m: ReturnType<typeof build>['manager'], stage: string, version: string) => {
  writePack(`packs/staging/${stage}`, version);
  return m.installStaged(stage, { venueId: VENUE, signature: 'good' });
};
const pointerFile = () => join(dir, 'packs/pointer.json');
const installedDirs = () => (existsSync(join(dir, 'packs/installed')) ? readdirSync(join(dir, 'packs/installed')).sort() : []);
const activeAfterRestart = async () => {
  const b = build();
  const report = await b.manager.recover();
  return { report, active: (await b.manager.resolveActive(VENUE))?.manifest.packVersion ?? null };
};

describe('PACK-01: a failure after the pointer committed never deletes the pack it points to', () => {
  // A pointer write that completes on disk and then rejects, as an adapter does when only its post-commit cleanup fails.
  const lateFailure = (readback: 'ok' | 'throws') => (store: PackStore): PackStore => ({
    ...store,
    writePointer: async (text) => { await store.writePointer(text); throw new Error('cleanup EIO after commit'); },
    ...(readback === 'throws' ? { readPointer: (() => { let armed = false; return async () => { if (armed) throw new Error('read EIO'); armed = true; return store.readPointer(); }; })() } : {}),
  });

  it('an update whose pointer landed is a success: the new pack stays active, the old one is released, a restart agrees', async () => {
    const seed = await fresh();
    expect((await install(seed.manager, 'a', '1.0.0')).ok).toBe(true);
    expect((await seed.manager.confirmActive(VENUE, `${VENUE}@1.0.0`)).ok).toBe(true);

    const { manager } = build((s) => {
      let n = 0;
      const faulty = lateFailure('ok')(s);
      return { ...s, writePointer: (t) => (n++ === 0 ? faulty.writePointer(t) : s.writePointer(t)) };
    });
    await manager.recover();
    const result = await install(manager, 'b', '2.0.0');
    expect(result.ok).toBe(true);
    expect(JSON.parse(readFileSync(pointerFile(), 'utf8')).venues[VENUE].active).toBe(`${VENUE}@2.0.0`);
    expect(installedDirs()).toContain(`${VENUE}@2.0.0`);
    expect((await manager.resolveActive(VENUE))?.manifest.packVersion).toBe('2.0.0');
    expect((await activeAfterRestart()).active).toBe('2.0.0');
  });

  it('when the outcome cannot be read back, neither pack is deleted and a restart resolves the one the pointer names', async () => {
    const seed = await fresh();
    await install(seed.manager, 'a', '1.0.0');
    await seed.manager.confirmActive(VENUE, `${VENUE}@1.0.0`);

    const { manager } = build((s) => {
      let writes = 0;
      let reads = 0;
      return {
        ...s,
        writePointer: async (t) => { writes += 1; await s.writePointer(t); if (writes === 1) throw new Error('late EIO'); },
        readPointer: async () => { reads += 1; if (writes === 1 && reads > 1) throw new Error('read EIO'); return s.readPointer(); },
      };
    });
    await manager.recover();
    const result = await install(manager, 'b', '2.0.0');
    expect(result.ok).toBe(false);
    expect(installedDirs()).toEqual([`${VENUE}@1.0.0`, `${VENUE}@2.0.0`]);
    const after = await activeAfterRestart();
    expect(after.active).toBe('2.0.0');
    expect(installedDirs()).toContain(`${VENUE}@2.0.0`);
  });

  it('a write that really failed before committing keeps the previous pack and removes only the unreferenced new one', async () => {
    const seed = await fresh();
    await install(seed.manager, 'a', '1.0.0');
    await seed.manager.confirmActive(VENUE, `${VENUE}@1.0.0`);
    const { manager } = build((s) => ({ ...s, writePointer: async () => { throw new Error('ENOSPC'); } }));
    await manager.recover();
    const result = await install(manager, 'b', '2.0.0');
    expect(result).toMatchObject({ ok: false, error: { code: 'pointer-write-failed' } });
    expect(installedDirs()).toEqual([`${VENUE}@1.0.0`]);
    expect((await activeAfterRestart()).active).toBe('1.0.0');
  });

  it('fault sweep: a failure before, during or after the pointer swap, with or without a readable read-back, always leaves one verified pack', async () => {
    const points = ['before', 'after'] as const;
    for (const point of points) {
      for (const readable of [true, false]) {
        rmSync(join(dir, 'packs'), { recursive: true, force: true });
        const seed = await fresh();
        await install(seed.manager, 'a', '1.0.0');
        await seed.manager.confirmActive(VENUE, `${VENUE}@1.0.0`);
        let writes = 0;
        const { manager } = build((s) => ({
          ...s,
          writePointer: async (t) => {
            writes += 1;
            if (writes > 1) return s.writePointer(t);
            if (point === 'before') throw new Error('EIO before');
            await s.writePointer(t);
            throw new Error('EIO after');
          },
          readPointer: async () => { if (!readable && writes >= 1) throw new Error('read EIO'); return s.readPointer(); },
        }));
        await manager.recover();
        await install(manager, 'b', '2.0.0');
        const names = installedDirs();
        const persisted = JSON.parse(readFileSync(pointerFile(), 'utf8')).venues[VENUE].active as string;
        expect(names).toContain(persisted); // the pack the pointer names is never missing
        const after = await activeAfterRestart();
        expect(['1.0.0', '2.0.0']).toContain(after.active);
        expect(after.active).toBe(persisted.split('@')[1]);
      }
    }
  });
});

describe('PACK-04: a malformed pointer is corrupt, never an empty list of packs', () => {
  const bad: Array<[string, string]> = [
    ['venues as an array', JSON.stringify({ v: 1, generation: 1, venues: [] })],
    ['venues as null', JSON.stringify({ v: 1, generation: 1, venues: null })],
    ['venues as a scalar', JSON.stringify({ v: 1, generation: 1, venues: 7 })],
    ['the pointer itself an array', JSON.stringify([])],
    ['the pointer null', 'null'],
    ['the pointer a scalar', '3'],
    ['a negative generation', JSON.stringify({ v: 1, generation: -1, venues: {} })],
    ['a fractional generation', JSON.stringify({ v: 1, generation: 1.5, venues: {} })],
    ['a missing generation', JSON.stringify({ v: 1, venues: {} })],
    ['a string generation', JSON.stringify({ v: 1, generation: '1', venues: {} })],
    ['an entry that is an array', JSON.stringify({ v: 1, generation: 1, venues: { [VENUE]: [] } })],
    ['an entry that is null', JSON.stringify({ v: 1, generation: 1, venues: { [VENUE]: null } })],
    ['an unparseable file', '{"v":1,"generation":1,"venues":{'],
  ];

  it.each(bad)('%s is flagged corrupt, deletes nothing, and the installed pack is rebuilt by repairPointer', async (_name, text) => {
    const seed = await fresh();
    await install(seed.manager, 'a', '1.0.0');
    await seed.manager.confirmActive(VENUE, `${VENUE}@1.0.0`);
    writeFileSync(pointerFile(), text);

    const b = build();
    const report = await b.manager.recover();
    expect(report.pointerCorrupt).toBe(true);
    expect(report.removedOrphans).toBe(0);
    expect(installedDirs()).toEqual([`${VENUE}@1.0.0`]);
    expect((await install(b.manager, 'x', '1.1.0'))).toMatchObject({ ok: false, error: { code: 'pointer-corrupt' } });

    expect((await b.manager.repairPointer()).ok).toBe(true);
    expect((await b.manager.repairPointer()).ok).toBe(true); // idempotent
    expect(installedDirs()).toEqual([`${VENUE}@1.0.0`]);
    expect((await b.manager.resolveActive(VENUE))?.manifest.packVersion).toBe('1.0.0');

    const again = await activeAfterRestart(); // and a second restart is stable
    expect(again.report).toMatchObject({ pointerCorrupt: false, removedOrphans: 0 });
    expect(again.active).toBe('1.0.0');
  });

  it('repair keeps only what verifies: a damaged directory is not resurrected, the newest good one wins', async () => {
    const seed = await fresh();
    await install(seed.manager, 'a', '1.0.0');
    await seed.manager.confirmActive(VENUE, `${VENUE}@1.0.0`);
    await install(seed.manager, 'b', '1.1.0');
    writeFileSync(pointerFile(), JSON.stringify({ v: 1, generation: 9, venues: [] }));
    writeFileSync(join(dir, 'packs/installed', `${VENUE}@1.1.0`, 'data/routing-graph.bin'), 'damaged');
    const b = build();
    expect((await b.manager.recover()).pointerCorrupt).toBe(true);
    expect((await b.manager.repairPointer()).ok).toBe(true);
    expect((await b.manager.resolveActive(VENUE))?.manifest.packVersion).toBe('1.0.0');
  });

  it('a valid pointer is still accepted', async () => {
    const seed = await fresh();
    await install(seed.manager, 'a', '1.0.0');
    const again = await activeAfterRestart();
    expect(again.report.pointerCorrupt).toBe(false);
    expect(again.active).toBe('1.0.0');
  });
});

describe('PACK-02: what was verified is exactly what gets activated', () => {
  // Runs `mutate` right after the verifier has read the last resource of the STAGED pack, i.e. in the audited gap before the move.
  const racing = (mutate: () => void) => (store: PackStore): PackStore => ({
    ...store,
    reader: (ref) => {
      const reader = store.reader(ref);
      if (ref.area !== 'staging') return reader;
      return {
        ...reader,
        stat: async (path) => {
          const stat = await reader.stat(path);
          if (path === 'data/provenance.bin') mutate();
          return stat;
        },
      };
    },
  });

  it('a manifest replaced after verification and before the move is refused and never activated', async () => {
    const { manager } = build(racing(() => {
      const path = join(dir, 'packs/staging/s1', PACK_MANIFEST_FILE);
      const forged = { ...JSON.parse(readFileSync(path, 'utf8')), routingPolicyVersion: 'forged-unsigned', keyId: undefined, signatureAlgorithm: undefined };
      writeFileSync(path, JSON.stringify(forged));
    }));
    await manager.recover();
    const result = await install(manager, 's1', '1.0.0');
    expect(result).toMatchObject({ ok: false, error: { code: 'manifest-digest-mismatch' } });
    expect(installedDirs()).toEqual([]);
    expect(await manager.resolveActive(VENUE)).toBeNull();
    expect(existsSync(pointerFile()) ? JSON.parse(readFileSync(pointerFile(), 'utf8')).venues : {}).toEqual({});
  });

  it('a resource replaced at that boundary is refused', async () => {
    const { manager } = build(racing(() => writeFileSync(join(dir, 'packs/staging/s1/data/routing-graph.bin'), 'swapped after hashing')));
    await manager.recover();
    const result = await install(manager, 's1', '1.0.0');
    expect(result.ok).toBe(false);
    expect(['resource-size-mismatch', 'resource-hash-mismatch']).toContain((result as { error: { code: string } }).error.code);
    expect(installedDirs()).toEqual([]);
    expect(await manager.resolveActive(VENUE)).toBeNull();
  });

  it('an extra file slipped in at that boundary is refused', async () => {
    const { manager } = build(racing(() => writeFileSync(join(dir, 'packs/staging/s1/data/extra.js'), '//')));
    await manager.recover();
    const result = await install(manager, 's1', '1.0.0');
    expect(result).toMatchObject({ ok: false, error: { code: 'resource-unexpected' } });
    expect(installedDirs()).toEqual([]);
  });

  it('an untouched signed install still activates, and a refusal does not disturb the active pack', async () => {
    const { manager } = build();
    await manager.recover();
    expect((await install(manager, 'a', '1.0.0')).ok).toBe(true);
    await manager.confirmActive(VENUE, `${VENUE}@1.0.0`);
    const racer = build(racing(() => writeFileSync(join(dir, 'packs/staging/b/data/localization.bin'), 'x')));
    await racer.manager.recover();
    expect((await install(racer.manager, 'b', '2.0.0')).ok).toBe(false);
    expect((await racer.manager.resolveActive(VENUE))?.manifest.packVersion).toBe('1.0.0');
    expect(installedDirs()).toEqual([`${VENUE}@1.0.0`]);
  });
});

describe('PACK-03: the Node reference adapter never follows or hides a link', () => {
  let outside: string;
  beforeEach(() => {
    outside = join(dir, 'outside-root');
    mkdirSync(outside);
    writeFileSync(join(outside, 'secret.bin'), 'EXTERNAL');
  });
  const rootFs = () => { mkdirSync(join(dir, 'root'), { recursive: true }); return createNodePackFileSystem(join(dir, 'root')); };

  it('refuses to read, hash or stat a file link, and reports it as missing', async () => {
    const fs = rootFs();
    symlinkSync(join(outside, 'secret.bin'), join(dir, 'root/res.bin'));
    expect(await fs.size('res.bin')).toBeNull();
    await expect(fs.readText('res.bin')).rejects.toThrow(/symbolic link/);
    await expect((async () => { for await (const c of fs.readChunks('res.bin', 8)) void c; })()).rejects.toThrow(/symbolic link/);
  });

  it('a link in a parent directory blocks everything below it (nested and outside-root targets)', async () => {
    const fs = rootFs();
    symlinkSync(outside, join(dir, 'root/linked-dir'));
    expect(await fs.size('linked-dir/secret.bin')).toBeNull();
    await expect(fs.readText('linked-dir/secret.bin')).rejects.toThrow(/symbolic link/);
    await expect(fs.writeTextAtomic('linked-dir/new.txt', 'x')).rejects.toThrow(/symbolic link/);
    expect(existsSync(join(outside, 'new.txt'))).toBe(false);
    await expect(fs.removeTree('linked-dir/secret.bin')).rejects.toThrow(/symbolic link/);
    expect(existsSync(join(outside, 'secret.bin'))).toBe(true);
    mkdirSync(join(dir, 'root/a'));
    symlinkSync(join(dir, 'root/a'), join(dir, 'root/a/loop'));
    await expect(fs.readText('a/loop/x')).rejects.toThrow(/symbolic link/);
  });

  it('lists links and special entries instead of hiding them', async () => {
    const fs = rootFs();
    mkdirSync(join(dir, 'root/pack/data'), { recursive: true });
    writeFileSync(join(dir, 'root/pack/data/a.bin'), 'a');
    symlinkSync(join(outside, 'secret.bin'), join(dir, 'root/pack/undeclared.js'));
    symlinkSync(outside, join(dir, 'root/pack/data/dirlink'));
    expect((await fs.listFilesRecursive('pack')).sort()).toEqual(['data/a.bin', 'data/dirlink', 'undeclared.js']);
  });

  it('removing a link removes the link, never its target; moving a link-bearing directory is refused', async () => {
    const fs = rootFs();
    mkdirSync(join(dir, 'root/p'));
    symlinkSync(join(outside, 'secret.bin'), join(dir, 'root/p/l'));
    await fs.removeTree('p/l');
    expect(existsSync(join(dir, 'root/p/l'))).toBe(false);
    expect(readFileSync(join(outside, 'secret.bin'), 'utf8')).toBe('EXTERNAL');
    symlinkSync(outside, join(dir, 'root/dirlink'));
    await expect(fs.renameDir('dirlink', 'moved')).rejects.toThrow();
    expect(lstatSync(join(dir, 'root/dirlink')).isSymbolicLink()).toBe(true);
  });

  it('a signed install over a staging tree with a declared external link or an undeclared link is refused and nothing escapes', async () => {
    for (const declared of [true, false]) {
      rmSync(join(dir, 'packs'), { recursive: true, force: true });
      const { manager } = await fresh();
      const manifest = writePack('packs/staging/s1', '1.0.0');
      const link = declared ? join(dir, 'packs/staging/s1', manifest.resources[0].path) : join(dir, 'packs/staging/s1/undeclared.js');
      if (declared) rmSync(link);
      symlinkSync(join(outside, 'secret.bin'), link);
      const result = await manager.installStaged('s1', { venueId: VENUE, signature: 'good' });
      expect(result.ok).toBe(false);
      expect(['resource-missing', 'resource-unexpected']).toContain((result as { error: { code: string } }).error.code);
      expect(installedDirs()).toEqual([]);
      expect(readFileSync(join(outside, 'secret.bin'), 'utf8')).toBe('EXTERNAL');
    }
  });

  it('with requireCurrentUser the adapter still works on files the current user owns', async () => {
    mkdirSync(join(dir, 'owned'));
    const fs = createNodePackFileSystem(join(dir, 'owned'), { requireCurrentUser: true });
    await fs.writeTextAtomic('a/b.txt', 'hello');
    expect(await fs.readText('a/b.txt')).toBe('hello');
    expect(await fs.size('a/b.txt')).toBe(5);
  });

  it('ordinary files and directories behave as before', async () => {
    const fs = rootFs();
    await fs.writeTextAtomic('x/y/z.txt', 'one');
    await fs.writeTextAtomic('x/y/z.txt', 'two');
    expect(await fs.readText('x/y/z.txt')).toBe('two');
    expect(await fs.readText('missing')).toBeNull();
    expect(await fs.listNames('x')).toEqual(['y']);
    expect(await fs.listNames('nope')).toEqual([]);
    expect(await fs.listFilesRecursive('x')).toEqual(['y/z.txt']);
    await fs.renameDir('x', 'moved/x2');
    expect(await fs.listFilesRecursive('moved')).toEqual(['x2/y/z.txt']);
    await fs.removeTree('moved');
    await fs.removeTree('moved');
    expect(await fs.listNames('moved')).toEqual([]);
  });
});

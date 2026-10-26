/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// C5.1: incremental SHA-256, the filesystem-backed PackStore and crash/interruption recovery against a REAL filesystem
// (Node fs through the same PackFileSystem port a device adapter implements).
import { createHash, randomBytes } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createFileSystemPackStore, createPackManager, createSha256, PACK_MANIFEST_FILE, sha256Hex,
  type PackFileSystem, type PackManager, type PackManifest,
} from '@muslim-ummah/offline-navigation';
import { createNodePackFileSystem } from '../../scripts/sdk-pack/nodePackFileSystem';
import { sampleManifest } from '../../scripts/sdk-headless/packChecks';

const nodeSha = (b: Uint8Array | string): string => createHash('sha256').update(b).digest('hex');

describe('createSha256 / sha256Hex', () => {
  it('matches the published test vectors', () => {
    expect(sha256Hex(new Uint8Array())).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(sha256Hex(new TextEncoder().encode('abc'))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(sha256Hex(new TextEncoder().encode('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq')))
      .toBe('248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1');
    const hasher = createSha256();
    const million = new Uint8Array(1000).fill(0x61);
    for (let i = 0; i < 1000; i++) hasher.update(million);
    expect(hasher.digestHex()).toBe('cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0');
  });

  it('agrees with Node crypto for every length around the block and padding boundaries, however the input is split', () => {
    const data = new Uint8Array(randomBytes(400));
    for (let length = 0; length <= 200; length++) {
      const slice = data.subarray(0, length);
      const expected = nodeSha(slice);
      expect(sha256Hex(slice)).toBe(expected);
      for (const split of [1, 7, 55, 56, 63, 64, 65]) {
        const hasher = createSha256();
        for (let i = 0; i < length; i += split) hasher.update(slice.subarray(i, Math.min(length, i + split)));
        expect(hasher.digestHex()).toBe(expected);
      }
    }
  });

  it('hashes a view into a larger buffer (non-zero byteOffset) and tolerates the caller reusing its buffer', () => {
    const backing = new Uint8Array(randomBytes(300));
    const view = backing.subarray(13, 250);
    const expected = nodeSha(view);
    const hasher = createSha256();
    const reused = new Uint8Array(64);
    for (let i = 0; i < view.length; i += 64) {
      const part = view.subarray(i, Math.min(view.length, i + 64));
      reused.set(part);
      hasher.update(reused.subarray(0, part.length));
    }
    expect(hasher.digestHex()).toBe(expected);
  });

  it('is single use', () => {
    const hasher = createSha256();
    hasher.digestHex();
    expect(() => hasher.update(new Uint8Array(1))).toThrow();
    expect(() => hasher.digestHex()).toThrow();
  });
});

// ---- the store, on a real directory ----

const VENUE = 'karachi-ijtema';
const KINDS = ['map-archive', 'routing-graph', 'place-directory', 'gate-metadata', 'localization', 'provenance'] as const;
let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'sdk-pack-')); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

/** Writes a pack directory with real files and a manifest whose hashes are real. `bytes` sizes the map archive. */
const writePack = (relDir: string, version: string, opts: { mapBytes?: number; venueId?: string; signed?: boolean } = {}): PackManifest => {
  const venueId = opts.venueId ?? VENUE;
  const base = join(dir, relDir);
  mkdirSync(join(base, 'data'), { recursive: true });
  const resources = KINDS.map((kind) => {
    const content = kind === 'map-archive' ? randomBytes(opts.mapBytes ?? 4096) : Buffer.from(`${venueId}/${version}/${kind}`);
    writeFileSync(join(base, 'data', `${kind}.bin`), content);
    return { path: `data/${kind}.bin`, kind, bytes: content.length, sha256: nodeSha(content) };
  });
  const manifest = sampleManifest({
    venueId, packId: `${venueId}@${version}`, packVersion: version, resources,
    totalBytes: resources.reduce((n, r) => n + r.bytes, 0), fileCount: resources.length,
    ...(opts.signed === false ? {} : { keyId: 'k1', signatureAlgorithm: 'ed25519' as const }),
  });
  writeFileSync(join(base, PACK_MANIFEST_FILE), JSON.stringify(manifest));
  return manifest;
};

const makeManager = (fs: PackFileSystem, extra: { bundledId?: string; bundledText?: string } = {}): { manager: PackManager; store: ReturnType<typeof createFileSystemPackStore> } => {
  const store = createFileSystemPackStore({ fs, chunkBytes: 1024 });
  const manager = createPackManager({
    store, sdkVersion: '0.1.0', platformCapabilities: ['pmtiles-local-read'], reserveBytes: 0, trustedKeyIds: ['k1'],
    bundled: extra.bundledId && extra.bundledText ? [{ id: extra.bundledId, manifestText: extra.bundledText, pinnedManifestSha256: nodeSha(extra.bundledText) }] : [],
    ports: { manifestSha256: async (t) => nodeSha(t), signatureVerifier: { verify: async (a) => a.signature === 'good' } },
  });
  return { manager, store };
};

describe('createFileSystemPackStore over the Node filesystem', () => {
  it('installs a staged pack: verified by streaming hash, activated, and the staging directory is gone', async () => {
    const { manager, store } = makeManager(createNodePackFileSystem(dir));
    await manager.recover();
    writePack('packs/staging/s1', '1.0.0'); // an importer fills staging after startup recovery, which sweeps leftovers
    const r = await manager.installStaged('s1', { venueId: VENUE, signature: 'good' });
    expect(r).toEqual(expect.objectContaining({ ok: true, trust: 'signed' }));
    expect(readdirSync(join(dir, 'packs/installed'))).toEqual([`${VENUE}@1.0.0`]);
    expect(existsSync(join(dir, 'packs/staging/s1'))).toBe(false);
    expect(JSON.parse(readFileSync(join(dir, 'packs/pointer.json'), 'utf8')).venues[VENUE].active).toBe(`${VENUE}@1.0.0`);
    expect((await manager.resolveActive(VENUE))?.manifest.packVersion).toBe('1.0.0');
    expect(store.stagingDir('s1')).toBe('packs/staging/s1');
  });

  it('hashes in bounded chunks: an 8 MiB archive is read in pieces no larger than the chunk size', async () => {
    const fs = createNodePackFileSystem(dir);
    const sizes: number[] = [];
    const counting: PackFileSystem = { ...fs, readChunks: async function* (p, n) { for await (const c of fs.readChunks(p, n)) { sizes.push(c.length); yield c; } } };
    const { manager } = makeManager(counting);
    await manager.recover();
    writePack('packs/staging/big', '1.0.0', { mapBytes: 8 * 1024 * 1024 });
    expect(await manager.installStaged('big', { venueId: VENUE, signature: 'good' })).toMatchObject({ ok: true });
    expect(Math.max(...sizes)).toBeLessThanOrEqual(1024);
    expect(sizes.length).toBeGreaterThan(8 * 1024);
  });

  it('refuses a corrupted file, a truncated file and an extra file, and removes the bad staging directory', async () => {
    for (const [name, damage, code] of [
      ['flip', (p: string) => { const b = readFileSync(p); b[10] ^= 0xff; writeFileSync(p, b); }, 'resource-hash-mismatch'],
      ['truncate', (p: string) => writeFileSync(p, readFileSync(p).subarray(0, 100)), 'resource-size-mismatch'],
    ] as const) {
      const { manager } = makeManager(createNodePackFileSystem(dir));
      await manager.recover();
      writePack(`packs/staging/${name}`, '1.0.0');
      damage(join(dir, `packs/staging/${name}/data/map-archive.bin`));
      expect(await manager.installStaged(name, { venueId: VENUE, signature: 'good' })).toMatchObject({ ok: false, error: { code } });
      expect(existsSync(join(dir, `packs/staging/${name}`))).toBe(false);
    }
    const { manager } = makeManager(createNodePackFileSystem(dir));
    await manager.recover();
    writePack('packs/staging/extra', '1.0.0');
    writeFileSync(join(dir, 'packs/staging/extra/data/evil.js'), 'alert(1)');
    expect(await manager.installStaged('extra', { venueId: VENUE, signature: 'good' })).toMatchObject({ ok: false, error: { code: 'resource-unexpected' } });
    expect(existsSync(join(dir, 'packs/installed'))).toBe(false);
  });

  it('refuses unsigned imports and a bad signature before activating anything', async () => {
    const { manager } = makeManager(createNodePackFileSystem(dir));
    await manager.recover();
    writePack('packs/staging/s1', '1.0.0');
    expect(await manager.installStaged('s1', { venueId: VENUE })).toMatchObject({ ok: false });
    writePack('packs/staging/s1', '1.0.0'); // a refused import discards its staging directory
    expect(await manager.installStaged('s1', { venueId: VENUE, signature: 'forged' })).toMatchObject({ ok: false, error: { code: 'signature-invalid' } });
    expect(await manager.resolveActive(VENUE)).toBeNull();
  });

  it('never lets a hostile pointer id leave the pack directory', async () => {
    writeFileSync(join(dir, 'secret.txt'), 'x');
    mkdirSync(join(dir, 'packs'), { recursive: true });
    writeFileSync(join(dir, 'packs/pointer.json'), JSON.stringify({ v: 1, generation: 1, venues: { [VENUE]: { active: '../../..', previous: null, confirmed: true } } }));
    const { manager } = makeManager(createNodePackFileSystem(dir));
    const report = await manager.recover();
    expect(report.repaired.length + report.unavailable.length + (report.pointerCorrupt ? 1 : 0)).toBeGreaterThan(0);
    expect(existsSync(join(dir, 'secret.txt'))).toBe(true);
    expect(await manager.resolveActive(VENUE)).toBeNull();
  });

  it('serves a bundled pack read-only from its own directory and keeps serving it when the installed pack is damaged', async () => {
    const bundled = writePack('bundled/karachi-1.0.0', '1.0.0', { signed: false });
    const text = readFileSync(join(dir, 'bundled/karachi-1.0.0', PACK_MANIFEST_FILE), 'utf8');
    const a = makeManager(createNodePackFileSystem(dir), { bundledId: 'karachi-1.0.0', bundledText: text });
    await a.manager.recover();
    writePack('packs/staging/s2', '1.1.0');
    expect((await a.manager.resolveActive(VENUE))?.source).toBe('bundled');
    expect(bundled.packVersion).toBe('1.0.0');
    expect(await a.manager.installStaged('s2', { venueId: VENUE, signature: 'good' })).toMatchObject({ ok: true });
    expect((await a.manager.resolveActive(VENUE))?.manifest.packVersion).toBe('1.1.0');
    // Damage the installed archive, then "restart": recovery falls back to the bundled pack.
    const archive = join(dir, `packs/installed/${VENUE}@1.1.0/data/map-archive.bin`);
    writeFileSync(archive, randomBytes(4096));
    const b = makeManager(createNodePackFileSystem(dir), { bundledId: 'karachi-1.0.0', bundledText: text });
    const report = await b.manager.recover();
    expect(report.repaired).toEqual([expect.objectContaining({ venueId: VENUE, to: 'bundled' })]);
    expect((await b.manager.resolveActive(VENUE))?.source).toBe('bundled');
  });
});

// ---- crash / interruption: stop the install at every filesystem mutation, restart, and check what is active ----

class Crash extends Error {}
/** Throws on the Nth mutating call, either before it touches the disk or right after it completed (the process died in between). */
const crashingFs = (inner: PackFileSystem, crashAt: number, when: 'before' | 'after'): PackFileSystem & { mutations: () => number } => {
  let n = 0;
  const gate = async <T>(op: () => Promise<T>): Promise<T> => {
    n += 1;
    if (n === crashAt && when === 'before') throw new Crash();
    const result = await op();
    if (n === crashAt && when === 'after') throw new Crash();
    return result;
  };
  return {
    ...inner,
    writeTextAtomic: (p, t) => gate(() => inner.writeTextAtomic(p, t)),
    renameDir: (a, b) => gate(() => inner.renameDir(a, b)),
    removeTree: (p) => gate(() => inner.removeTree(p)),
    mutations: () => n,
  };
};

describe('crash and interruption while installing an update', () => {
  // v1.0.0 and v1.1.0 are both installed and confirmed (1.1.0 active, 1.0.0 the rollback target); the update to 1.2.0 then has to
  // stage-commit, move the pointer AND remove the old rollback target: three kinds of mutation to interrupt.
  const setupInstalledV1 = async () => {
    const { manager } = makeManager(createNodePackFileSystem(dir));
    await manager.recover();
    for (const [stage, version] of [['s0', '1.0.0'], ['s1', '1.1.0']] as const) {
      writePack(`packs/staging/${stage}`, version);
      expect(await manager.installStaged(stage, { venueId: VENUE, signature: 'good' })).toMatchObject({ ok: true });
      await manager.confirmActive(VENUE, `${VENUE}@${version}`);
    }
  };

  it('whichever step dies, a restart leaves exactly one fully verified pack active and a retry succeeds', async () => {
    await setupInstalledV1();
    // Count the mutations of an uninterrupted update so the sweep covers every one of them.
    const probe = crashingFs(createNodePackFileSystem(dir), Infinity, 'before');
    const pm = makeManager(probe);
    await pm.manager.recover();
    writePack('packs/staging/s2', '1.2.0');
    expect(await pm.manager.installStaged('s2', { venueId: VENUE, signature: 'good' })).toMatchObject({ ok: true });
    const total = probe.mutations();
    expect(total).toBeGreaterThanOrEqual(3); // commit, pointer, removal of the old rollback target

    const outcomes = new Set<string>();
    for (const when of ['before', 'after'] as const) {
      for (let at = 1; at <= total; at++) {
        rmSync(dir, { recursive: true, force: true });
        mkdirSync(dir, { recursive: true });
        await setupInstalledV1();
        const crashing = makeManager(crashingFs(createNodePackFileSystem(dir), at, when));
        await crashing.manager.recover();
        writePack('packs/staging/s2', '1.2.0');
        try { await crashing.manager.installStaged('s2', { venueId: VENUE, signature: 'good' }); } catch { /* the process "died" */ }

        // Restart on whatever is on disk.
        const restarted = makeManager(createNodePackFileSystem(dir));
        await restarted.manager.recover();
        const active = await restarted.manager.resolveActive(VENUE);
        expect(active).not.toBeNull();
        const version = active!.manifest.packVersion;
        expect(['1.1.0', '1.2.0']).toContain(version);
        outcomes.add(`${when}:${version}`);
        // The active pack's files verify end to end (nothing half-written is active).
        const verified = await restarted.manager.pin(VENUE);
        expect(verified?.manifest.packVersion).toBe(version);
        verified?.release();
        // No staging leftovers survive recovery; at most the single active (+ previous) directories remain installed.
        expect(readdirSync(join(dir, 'packs/staging'))).toEqual([]);
        expect(readdirSync(join(dir, 'packs/installed')).length).toBeLessThanOrEqual(3);
        // After a crash that left v1 active, installing v2 again works.
        if (version === '1.1.0') {
          writePack('packs/staging/s3', '1.2.0'); // after recovery, like any import
          expect(await restarted.manager.installStaged('s3', { venueId: VENUE, signature: 'good' })).toMatchObject({ ok: true });
          expect((await restarted.manager.resolveActive(VENUE))?.manifest.packVersion).toBe('1.2.0');
        }
      }
    }
    expect([...outcomes].some((o) => o.endsWith(':1.1.0'))).toBe(true); // some crashes keep the old pack...
    expect([...outcomes].some((o) => o.endsWith(':1.2.0'))).toBe(true); // ...and those after the pointer write have the new one
  });

  it('a temp file left by a pointer write that never finished is ignored', async () => {
    await setupInstalledV1();
    writeFileSync(join(dir, 'packs/pointer.json.tmp-deadbeef'), '{"v":1,"gener');
    const { manager } = makeManager(createNodePackFileSystem(dir));
    await manager.recover();
    expect((await manager.resolveActive(VENUE))?.manifest.packVersion).toBe('1.1.0');
  });

  it('a full disk is refused before anything is staged into place', async () => {
    const fs = createNodePackFileSystem(dir);
    const { manager } = makeManager({ ...fs, freeBytes: async () => 10 });
    await manager.recover();
    writePack('packs/staging/s1', '1.0.0');
    const text = readFileSync(join(dir, 'packs/staging/s1', PACK_MANIFEST_FILE), 'utf8');
    expect(await manager.checkRoom(text)).toMatchObject({ ok: false, error: { code: 'storage-insufficient' } });
  });
});

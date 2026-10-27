import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createFileSystemPackStore, createPackManager, sha256Hex, PACK_MANIFEST_FILE, type PackFileSystem, type PackManager, type PackManifest,
} from '@muslim-ummah/offline-navigation';
import { createExpoPackFileSystem } from './expoPackFileSystem';
import { createFakeExpoFs, type FakeExpoFs } from './fakeExpoFs';

// The adapter runs here against a test double that is strict where the native modules are (see fakeExpoFs.ts). This proves the
// adapter's logic and its crash behaviour; that the real iOS and Android modules behave as the double does is checked by the
// on-device self-test (packSelfTest.ts), which runs the same scenarios on the platform filesystem.
const bytes = (s: string): Uint8Array => new TextEncoder().encode(s);
let root: string;
let uri: string;
beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'expo-pack-')); uri = `file://${root}`; });
afterEach(() => { rmSync(root, { recursive: true, force: true }); });

const open = (): { fake: FakeExpoFs; fs: PackFileSystem } => {
  const fake = createFakeExpoFs();
  return { fake, fs: createExpoPackFileSystem(uri, fake.api) };
};

describe('PackFileSystem contract on the Expo adapter', () => {
  it('reads and replaces text, answers missing as null, and lists names, trees and sizes', async () => {
    const { fs } = open();
    expect(await fs.readText('a/b.txt')).toBeNull();
    await fs.writeTextAtomic('a/b.txt', 'one');
    await fs.writeTextAtomic('a/b.txt', 'two ✓');
    expect(await fs.readText('a/b.txt')).toBe('two ✓');
    expect(await fs.size('a/b.txt')).toBe(Buffer.byteLength('two ✓'));
    expect(await fs.size('a')).toBeNull(); // a directory is not a file
    expect(await fs.size('missing')).toBeNull();
    mkdirSync(join(root, 'tree/x/y'), { recursive: true });
    writeFileSync(join(root, 'tree/x/y/f.bin'), 'f');
    writeFileSync(join(root, 'tree/g.bin'), 'g');
    expect((await fs.listFilesRecursive('tree')).sort()).toEqual(['g.bin', 'x/y/f.bin']);
    expect((await fs.listNames('tree')).sort()).toEqual(['g.bin', 'x']);
    expect(await fs.listNames('nope')).toEqual([]);
    expect(await fs.listFilesRecursive('nope')).toEqual([]);
    expect(await fs.freeBytes()).toBeGreaterThan(0);
  });

  it('leaves no temp or swap files behind after a normal replacement', async () => {
    const { fs } = open();
    await fs.writeTextAtomic('p/pointer.json', 'v1');
    await fs.writeTextAtomic('p/pointer.json', 'v2');
    await fs.writeTextAtomic('p/pointer.json', 'v3');
    expect(readdirSync(join(root, 'p'))).toEqual(['pointer.json']);
    expect(readFileSync(join(root, 'p/pointer.json'), 'utf8')).toBe('v3');
  });

  it('streams a file in bounded chunks that add up to the file, and closes the handle on completion, early exit and failure', async () => {
    const { fake, fs } = open();
    const data = Buffer.from(Array.from({ length: 10_000 }, (_, i) => i % 251));
    writeFileSync(join(root, 'big.bin'), data);
    const seen: number[] = [];
    const parts: Buffer[] = [];
    for await (const chunk of fs.readChunks('big.bin', 4096)) { seen.push(chunk.length); parts.push(Buffer.from(chunk)); }
    expect(Math.max(...seen)).toBeLessThanOrEqual(4096);
    expect(Buffer.concat(parts).equals(data)).toBe(true);
    expect(fake.openHandles()).toBe(0);
    for await (const chunk of fs.readChunks('big.bin', 1024)) { void chunk; break; }
    expect(fake.openHandles()).toBe(0);
    const it = fs.readChunks('big.bin', 1024)[Symbol.asyncIterator]();
    await it.next();
    await it.throw?.(new Error('consumer failed')).catch(() => undefined);
    expect(fake.openHandles()).toBe(0);
    await expect((async () => { for await (const c of fs.readChunks('missing.bin', 1024)) void c; })()).rejects.toThrow();
    writeFileSync(join(root, 'empty.bin'), '');
    const empty: number[] = [];
    for await (const c of fs.readChunks('empty.bin', 1024)) empty.push(c.length);
    expect(empty).toEqual([]);
  });

  it('renames a directory whole, creates the destination parent, and refuses an existing destination instead of moving inside it', async () => {
    const { fs } = open();
    mkdirSync(join(root, 'staging/s1/data'), { recursive: true });
    writeFileSync(join(root, 'staging/s1/data/f'), 'x');
    await fs.renameDir('staging/s1', 'installed/deep/id1');
    expect(readFileSync(join(root, 'installed/deep/id1/data/f'), 'utf8')).toBe('x');
    expect(existsSync(join(root, 'staging/s1'))).toBe(false);
    mkdirSync(join(root, 'staging/s2'), { recursive: true });
    await expect(fs.renameDir('staging/s2', 'installed/deep/id1')).rejects.toThrow(/destination exists/);
    expect(existsSync(join(root, 'installed/deep/id1/s2'))).toBe(false); // not moved inside
    expect(existsSync(join(root, 'staging/s2'))).toBe(true);
  });

  it('removes files and trees, and a missing path is not an error', async () => {
    const { fs } = open();
    mkdirSync(join(root, 'd/e'), { recursive: true });
    writeFileSync(join(root, 'd/e/f'), 'x');
    await fs.removeTree('d');
    await fs.removeTree('d');
    writeFileSync(join(root, 'lone'), 'x');
    await fs.removeTree('lone');
    expect(readdirSync(root)).toEqual([]);
  });
});

describe('replacing a file survives the process being killed at every step', () => {
  it('leaves exactly the old or the new complete text, never a partial one, and the next write succeeds', async () => {
    const probe = open();
    await probe.fs.writeTextAtomic('p/pointer.json', 'OLD-OLD-OLD');
    const before = probe.fake.mutations();
    await probe.fs.writeTextAtomic('p/pointer.json', 'NEW-NEW-NEW');
    const steps = probe.fake.mutations() - before;
    expect(steps).toBeGreaterThanOrEqual(5);
    rmSync(root, { recursive: true, force: true });
    mkdirSync(root);
    for (let k = 1; k <= steps; k++) {
      rmSync(root, { recursive: true, force: true });
      mkdirSync(root);
      const first = open();
      await first.fs.writeTextAtomic('p/pointer.json', 'OLD-OLD-OLD');
      first.fake.killAt(k);
      await first.fs.writeTextAtomic('p/pointer.json', 'NEW-NEW-NEW').then(() => 'finished', () => 'killed');
      const restarted = open();
      const read = await restarted.fs.readText('p/pointer.json');
      expect([`OLD-OLD-OLD`, `NEW-NEW-NEW`]).toContain(read);
      await restarted.fs.writeTextAtomic('p/pointer.json', 'AGAIN');
      expect(await restarted.fs.readText('p/pointer.json')).toBe('AGAIN');
      expect(readdirSync(join(root, 'p'))).toEqual(['pointer.json']);
    }
  });

  it('a first-ever write killed at any step leaves nothing or the complete text', async () => {
    const probe = open();
    await probe.fs.writeTextAtomic('q/pointer.json', 'FIRST-FIRST');
    const steps = probe.fake.mutations();
    for (let k = 1; k <= steps; k++) {
      rmSync(root, { recursive: true, force: true });
      mkdirSync(root);
      const first = open();
      first.fake.killAt(k);
      await first.fs.writeTextAtomic('q/pointer.json', 'FIRST-FIRST').then(() => 0, () => 0);
      const read = await open().fs.readText('q/pointer.json');
      expect([null, 'FIRST-FIRST']).toContain(read);
    }
  });
});

// ---- PackManager over the adapter ----

const KINDS = ['map-archive', 'routing-graph', 'place-directory', 'gate-metadata', 'localization', 'provenance'] as const;
const writePack = (area: string, id: string, version: string, mapBytes = 3000): PackManifest => {
  const base = join(root, 'packs', area, id);
  mkdirSync(join(base, 'data'), { recursive: true });
  const resources = KINDS.map((kind) => {
    const content = kind === 'map-archive' ? Buffer.from(Array.from({ length: mapBytes }, (_, i) => (i * 7 + Number(version.split('.')[0])) % 256)) : Buffer.from(`${version}/${kind}`);
    writeFileSync(join(base, 'data', `${kind}.bin`), content);
    return { path: `data/${kind}.bin`, kind, bytes: content.length, sha256: sha256Hex(content) };
  });
  const manifest: PackManifest = {
    schemaVersion: 1, packId: `venue-a@${version}`, venueId: 'venue-a', packVersion: version, sdkCompatibility: '>=0.1.0 <0.2.0', routingPolicyVersion: '1',
    createdAt: '2026-10-05T09:02:46Z', minimumPlatformCapabilities: ['pmtiles-local-read'], bounds: { west: 1, south: 1, east: 2, north: 2 }, languages: ['en'],
    totalBytes: resources.reduce((n, r) => n + r.bytes, 0), fileCount: resources.length, resources,
    attributions: [{ name: '© OpenStreetMap contributors', license: 'ODbL-1.0' }], provenance: { source: 'test', licence: 'ODbL-1.0' },
  };
  writeFileSync(join(base, PACK_MANIFEST_FILE), JSON.stringify(manifest));
  return manifest;
};

const manager = (fs: PackFileSystem): PackManager => createPackManager({
  store: createFileSystemPackStore({ fs, chunkBytes: 1024 }), sdkVersion: '0.1.0', platformCapabilities: ['pmtiles-local-read'], reserveBytes: 0,
  requireSignature: false, ports: { manifestSha256: async (t) => sha256Hex(bytes(t)) },
});

describe('PackManager on the Expo adapter', () => {
  it('installs, activates, rolls back, and keeps every file handle closed', async () => {
    const { fake, fs } = open();
    const m = manager(fs);
    await m.recover();
    writePack('staging', 's1', '1.0.0');
    expect(await m.installStaged('s1', { venueId: 'venue-a' })).toMatchObject({ ok: true });
    expect(await m.confirmActive('venue-a', 'venue-a@1.0.0')).toMatchObject({ ok: true });
    writePack('staging', 's2', '2.0.0');
    expect(await m.installStaged('s2', { venueId: 'venue-a' })).toMatchObject({ ok: true });
    expect((await m.resolveActive('venue-a'))?.manifest.packVersion).toBe('2.0.0');
    expect(await m.rollback('venue-a')).toMatchObject({ ok: true, to: 'previous' });
    expect((await m.resolveActive('venue-a'))?.manifest.packVersion).toBe('1.0.0');
    expect(fake.openHandles()).toBe(0);
  });

  it('a damaged or missing resource in the active pack is caught at startup and the previous pack serves', async () => {
    const first = open();
    const m1 = manager(first.fs);
    await m1.recover();
    writePack('staging', 's1', '1.0.0');
    await m1.installStaged('s1', { venueId: 'venue-a' });
    await m1.confirmActive('venue-a', 'venue-a@1.0.0');
    writePack('staging', 's2', '2.0.0');
    await m1.installStaged('s2', { venueId: 'venue-a' });
    for (const damage of [
      () => { const p = join(root, 'packs/installed/venue-a@2.0.0/data/routing-graph.bin'); const b = readFileSync(p); b[0] ^= 0xff; writeFileSync(p, b); },
      () => rmSync(join(root, 'packs/installed/venue-a@2.0.0/data/map-archive.bin')),
    ]) {
      damage();
      const restarted = open();
      const m2 = manager(restarted.fs);
      const report = await m2.recover();
      expect(report.repaired).toEqual([expect.objectContaining({ venueId: 'venue-a', to: 'previous' })]);
      expect((await m2.resolveActive('venue-a'))?.manifest.packVersion).toBe('1.0.0');
      expect(restarted.fake.openHandles()).toBe(0);
      // put 2.0.0 back for the next damage case
      writePack('staging', 's2', '2.0.0');
      expect(await m2.installStaged('s2', { venueId: 'venue-a' })).toMatchObject({ ok: true });
    }
  });

  it('an update killed at any filesystem step leaves one verified pack active, and retrying completes it', async () => {
    const probe = open();
    const pm = manager(probe.fs);
    await pm.recover();
    writePack('staging', 's1', '1.0.0');
    await pm.installStaged('s1', { venueId: 'venue-a' });
    await pm.confirmActive('venue-a', 'venue-a@1.0.0');
    writePack('staging', 's2', '2.0.0');
    const before = probe.fake.mutations();
    await pm.installStaged('s2', { venueId: 'venue-a' });
    const steps = probe.fake.mutations() - before;
    expect(steps).toBeGreaterThanOrEqual(8);

    for (let k = 1; k <= steps; k++) {
      rmSync(root, { recursive: true, force: true });
      mkdirSync(root);
      const a = open();
      const ma = manager(a.fs);
      await ma.recover();
      writePack('staging', 's1', '1.0.0');
      await ma.installStaged('s1', { venueId: 'venue-a' });
      await ma.confirmActive('venue-a', 'venue-a@1.0.0');
      writePack('staging', 's2', '2.0.0');
      a.fake.killAt(k);
      await ma.installStaged('s2', { venueId: 'venue-a' }).catch(() => undefined);

      const b = open();
      const mb = manager(b.fs);
      await mb.recover();
      const active = await mb.resolveActive('venue-a');
      expect(['1.0.0', '2.0.0']).toContain(active?.manifest.packVersion);
      if (active?.manifest.packVersion === '1.0.0') {
        writePack('staging', 's2b', '2.0.0');
        expect(await mb.installStaged('s2b', { venueId: 'venue-a' })).toMatchObject({ ok: true });
      }
      expect((await mb.resolveActive('venue-a'))?.manifest.packVersion).toBe('2.0.0');
      expect(b.fake.openHandles()).toBe(0);
    }
  });

  it('refuses an install that does not fit before touching the active pack', async () => {
    const { fake, fs } = open();
    const m = manager(fs);
    await m.recover();
    writePack('staging', 's1', '1.0.0');
    await m.installStaged('s1', { venueId: 'venue-a' });
    const next = writePack('staging', 's2', '2.0.0', 50_000);
    fake.setFreeBytes(next.totalBytes - 1);
    expect(await m.checkRoom(JSON.stringify(next))).toMatchObject({ ok: false, error: { code: 'storage-insufficient' } });
    expect((await m.resolveActive('venue-a'))?.manifest.packVersion).toBe('1.0.0');
  });

  it('pins the journey pack: activating another version while pinned keeps the pinned files', async () => {
    const { fs } = open();
    const m = manager(fs);
    await m.recover();
    writePack('staging', 's1', '1.0.0');
    await m.installStaged('s1', { venueId: 'venue-a' });
    await m.confirmActive('venue-a', 'venue-a@1.0.0');
    const pin = await m.pin('venue-a');
    expect(pin?.manifest.packVersion).toBe('1.0.0');
    writePack('staging', 's2', '2.0.0');
    await m.installStaged('s2', { venueId: 'venue-a' });
    await m.confirmActive('venue-a', 'venue-a@2.0.0');
    writePack('staging', 's3', '3.0.0');
    await m.installStaged('s3', { venueId: 'venue-a' }); // would normally retire 1.0.0
    expect(existsSync(join(root, 'packs/installed/venue-a@1.0.0/data/map-archive.bin'))).toBe(true);
    pin?.release();
    pin?.release(); // idempotent
    await m.recover();
    await new Promise((r) => setTimeout(r, 0));
    expect(existsSync(join(root, 'packs/installed/venue-a@1.0.0'))).toBe(false);
  });
});

// Codex PACK-01: a failure while removing the REPLACED copy happens after the new text is already in place. The write has committed, so it must
// not be reported as failed; if it were, the manager would think the update did not happen and delete the pack the pointer now names.
describe('a failure after the pointer committed (audit PACK-01)', () => {
  const faulty = (failOn: string) => {
    const fake = createFakeExpoFs();
    const Base = fake.api.File;
    let injected = 0;
    class FaultFile extends Base {
      delete(): void {
        if (this.uri.endsWith(failOn)) { injected += 1; throw new Error('audit transient cleanup EIO'); }
        super.delete();
      }
    }
    return { fake, api: { ...fake.api, File: FaultFile } as typeof fake.api, injected: () => injected };
  };

  it('writeTextAtomic still resolves when only the final .swap-old cleanup fails, and the new text is what is read', async () => {
    const { api, injected } = faulty('pointer.json.swap-old');
    const fs = createExpoPackFileSystem(uri, api);
    await fs.writeTextAtomic('packs/pointer.json', 'one');
    await expect(fs.writeTextAtomic('packs/pointer.json', 'two')).resolves.toBeUndefined();
    expect(injected()).toBe(1);
    expect(await fs.readText('packs/pointer.json')).toBe('two');
    await expect(fs.writeTextAtomic('packs/pointer.json', 'three')).rejects.toThrow(); // the stale copy still blocks a LATER write, before it commits anything
    expect(await fs.readText('packs/pointer.json')).toBe('two');
  });

  it('an update whose old-pointer cleanup fails is installed: the new pack is active and survives a restart', async () => {
    const { api } = faulty('pointer.json.swap-old');
    const m = manager(createExpoPackFileSystem(uri, api));
    await m.recover();
    writePack('staging', 'a', '1.0.0');
    expect((await m.installStaged('a', { venueId: 'venue-a' })).ok).toBe(true);
    writePack('staging', 'b', '2.0.0');
    const result = await m.installStaged('b', { venueId: 'venue-a' });
    expect(result.ok).toBe(true);
    expect(existsSync(join(root, 'packs/installed/venue-a@2.0.0'))).toBe(true);
    expect((await m.resolveActive('venue-a'))?.manifest.packVersion).toBe('2.0.0');
  });
});

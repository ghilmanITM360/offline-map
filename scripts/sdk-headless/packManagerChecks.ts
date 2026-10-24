// B9.2 headless checks for the pack lifecycle: staged install, atomic activation, rollback, crash recovery, pinning and
// multi-venue isolation, against an in-memory PackStore with failure injection. No real filesystem, clock or network.
import { strict as assert } from 'node:assert';
import { createHash } from 'node:crypto';
import {
  createPackManager, type PackManager, type PackManifest, type PackRef, type PackStore,
} from '../../packages/offline-navigation/src/domain/pack';
import { sampleManifest } from './packChecks';

type Dir = { manifestText: string; files: Map<string, { bytes: number; sha256: string }> };
const sha = (s: string): string => createHash('sha256').update(s, 'utf8').digest('hex');
const text = (m: unknown): string => JSON.stringify(m);

const makePack = (version: string, venueId = 'karachi-ijtema', signed = true): { manifest: PackManifest; dir: Dir } => {
  const base = sampleManifest({ venueId, packId: `${venueId}@${version}`, packVersion: version, ...(signed ? { keyId: 'k1', signatureAlgorithm: 'ed25519' as const } : {}) });
  // Distinct content per version/venue so a hash mix-up between packs is detectable.
  const resources = base.resources.map((r) => ({ ...r, sha256: sha(`${venueId}/${version}/${r.path}`) }));
  const manifest = { ...base, resources };
  return { manifest, dir: { manifestText: text(manifest), files: new Map(resources.map((r) => [r.path, { bytes: r.bytes, sha256: r.sha256 }])) } };
};

class FakeStore implements PackStore {
  pointer: string | null = null;
  staging = new Map<string, Dir>();
  installed = new Map<string, Dir>();
  bundled = new Map<string, Dir>();
  free = 1_000_000;
  failCommit = false;
  failPointer = false;
  failRemove = false;
  async readPointer() { return this.pointer; }
  async writePointer(t: string) { if (this.failPointer) throw new Error('disk full'); this.pointer = t; }
  async freeBytes() { return this.free; }
  async list(area: 'staging' | 'installed') { return [...(area === 'staging' ? this.staging : this.installed).keys()]; }
  private dirs(a: PackRef['area']) { return a === 'staging' ? this.staging : a === 'installed' ? this.installed : this.bundled; }
  async readManifest(ref: PackRef) { return this.dirs(ref.area).get(ref.id)?.manifestText ?? null; }
  reader(ref: PackRef) {
    return { stat: async (p: string) => this.dirs(ref.area).get(ref.id)?.files.get(p) ?? null, list: async () => [...(this.dirs(ref.area).get(ref.id)?.files.keys() ?? [])] };
  }
  async commit(s: string, id: string) {
    if (this.failCommit) throw new Error('rename failed');
    if (this.installed.has(id)) throw new Error('exists');
    const d = this.staging.get(s); if (!d) throw new Error('no staging');
    this.staging.delete(s); this.installed.set(id, d);
  }
  async remove(ref: { area: 'staging' | 'installed'; id: string }) { if (this.failRemove) throw new Error('busy'); this.dirs(ref.area).delete(ref.id); }
}

const setup = (store = new FakeStore(), over: { bundled?: boolean; requireSignature?: boolean; bundledVersion?: string; sdkVersion?: string } = {}) => {
  const bundledVersion = over.bundledVersion ?? '1.0.0';
  const bundledPack = makePack(bundledVersion, 'karachi-ijtema', false);
  if (over.bundled !== false) store.bundled.set(`karachi-${bundledVersion}`, bundledPack.dir);
  const manager = createPackManager({
    store, sdkVersion: over.sdkVersion ?? '0.1.0', platformCapabilities: ['pmtiles-local-read'], reserveBytes: 1000,
    trustedKeyIds: ['k1'], requireSignature: over.requireSignature,
    bundled: over.bundled === false ? [] : [{ id: `karachi-${bundledVersion}`, manifestText: bundledPack.dir.manifestText, pinnedManifestSha256: sha(bundledPack.dir.manifestText) }],
    ports: { manifestSha256: async (t) => sha(t), signatureVerifier: { verify: async (a) => a.signature === 'good' } },
  });
  return { store, manager, bundledPack };
};
const stage = (store: FakeStore, id: string, pack: { dir: Dir }) => { store.staging.set(id, { manifestText: pack.dir.manifestText, files: new Map(pack.dir.files) }); };
/** Installs and, by default, confirms the pack (it has run well), so it becomes the rollback target for the next install. */
const install = async (m: PackManager, store: FakeStore, version: string, venueId = 'karachi-ijtema', opts: { allowDowngrade?: boolean; signature?: string; confirm?: boolean } = {}) => {
  stage(store, `s-${venueId}-${version}`, makePack(version, venueId));
  const r = await m.installStaged(`s-${venueId}-${version}`, { venueId, signature: opts.signature ?? 'good', allowDowngrade: opts.allowDowngrade });
  if (r.ok && opts.confirm !== false) await m.confirmActive(venueId, `${venueId}@${version}`);
  return r;
};
const code = (r: { ok: boolean; error?: { code: string } }) => (r.ok ? 'ok' : (r as { error: { code: string } }).error.code);
const activeVersion = async (m: PackManager, venueId = 'karachi-ijtema') => (await m.resolveActive(venueId))?.manifest.packVersion ?? null;

export const packManagerChecks = (check: (name: string, fn: () => void | Promise<void>) => Promise<void>): Promise<void> => (async () => {
  await check('pack manager: with nothing installed the bundled pack is used, offline, and no install is required to open a venue', async () => {
    const { manager } = setup();
    assert.equal((await manager.recover()).pointerCorrupt, false);
    const a = await manager.resolveActive('karachi-ijtema');
    assert.equal(a?.source, 'bundled');
    assert.equal(a?.manifest.packVersion, '1.0.0');
    assert.equal(await manager.resolveActive('unknown-venue'), null);
    assert.deepEqual(manager.venueIds(), ['karachi-ijtema']);
  });

  await check('pack manager: a signed newer pack installs, activates atomically and becomes the active pack; staging is consumed', async () => {
    const { manager, store } = setup();
    await manager.recover();
    const r = await install(manager, store, '1.1.0');
    assert.equal(r.ok && r.trust, 'signed');
    assert.equal(await activeVersion(manager), '1.1.0');
    assert.equal((await manager.resolveActive('karachi-ijtema'))?.source, 'installed');
    assert.deepEqual([...store.staging.keys()], []);
    assert.deepEqual([...store.installed.keys()], ['karachi-ijtema@1.1.0']);
    assert.equal(JSON.parse(store.pointer as string).venues['karachi-ijtema'].previous, null);
  });

  await check('pack manager: unsigned and wrong-signature installs are refused and never touch the active pack', async () => {
    const { manager, store } = setup();
    await manager.recover();
    assert.equal(code(await install(manager, store, '1.1.0', 'karachi-ijtema', { signature: 'forged' })), 'signature-invalid');
    stage(store, 'unsigned', (() => { const p = makePack('1.2.0', 'karachi-ijtema', false); return p; })());
    assert.equal(code(await manager.installStaged('unsigned', { venueId: 'karachi-ijtema' })), 'signature-required');
    assert.equal(await activeVersion(manager), '1.0.0');
    assert.deepEqual([...store.installed.keys()], []);
    assert.deepEqual([...store.staging.keys()], []); // rejected staging is discarded
    assert.equal(store.pointer, null);
  });

  await check('pack manager: corrupt, truncated, extra-file and wrong-venue packs are rejected before activation', async () => {
    const { manager, store } = setup();
    await manager.recover();
    const corrupt = makePack('1.1.0'); corrupt.dir.files.set('data/map-archive.bin', { bytes: 100, sha256: sha('tampered') });
    stage(store, 'c', corrupt);
    assert.equal(code(await manager.installStaged('c', { venueId: 'karachi-ijtema', signature: 'good' })), 'resource-hash-mismatch');
    const truncated = makePack('1.1.0'); truncated.dir.files.set('data/map-archive.bin', { bytes: 7, sha256: sha('x') });
    stage(store, 't', truncated);
    assert.equal(code(await manager.installStaged('t', { venueId: 'karachi-ijtema', signature: 'good' })), 'resource-size-mismatch');
    const extra = makePack('1.1.0'); extra.dir.files.set('data/extra.bin', { bytes: 1, sha256: sha('e') });
    stage(store, 'x', extra);
    assert.equal(code(await manager.installStaged('x', { venueId: 'karachi-ijtema', signature: 'good' })), 'resource-unexpected');
    stage(store, 'w', makePack('1.1.0', 'other-venue'));
    assert.equal(code(await manager.installStaged('w', { venueId: 'karachi-ijtema', signature: 'good' })), 'venue-mismatch');
    assert.equal(code(await manager.installStaged('missing', { venueId: 'karachi-ijtema' })), 'staging-missing');
    assert.equal(await activeVersion(manager), '1.0.0');
    assert.equal(store.pointer, null);
  });

  await check('pack manager: incompatible SDK or platform packs are rejected', async () => {
    const { manager, store } = setup();
    await manager.recover();
    const old = sampleManifest({ venueId: 'karachi-ijtema', packVersion: '1.1.0', sdkCompatibility: '>=0.5.0 <0.6.0', keyId: 'k1', signatureAlgorithm: 'ed25519' });
    const dir: Dir = { manifestText: text(old), files: new Map(old.resources.map((r) => [r.path, { bytes: r.bytes, sha256: r.sha256 }])) };
    store.staging.set('i', dir);
    assert.equal(code(await manager.installStaged('i', { venueId: 'karachi-ijtema', signature: 'good' })), 'sdk-incompatible');
  });

  await check('pack manager: same version is idempotent or a conflict; older needs an explicit authorized downgrade', async () => {
    const { manager, store } = setup();
    await manager.recover();
    assert.equal(code(await install(manager, store, '1.2.0')), 'ok');
    assert.equal(code(await install(manager, store, '1.2.0')), 'already-installed');
    const different = makePack('1.2.0'); different.dir.manifestText = different.dir.manifestText.replace('"routingPolicyVersion":"1"', '"routingPolicyVersion":"2"');
    stage(store, 'd', different);
    assert.equal(code(await manager.installStaged('d', { venueId: 'karachi-ijtema', signature: 'good' })), 'version-conflict');
    assert.equal(code(await install(manager, store, '1.1.0')), 'version-not-newer');
    assert.equal(await activeVersion(manager), '1.2.0');
    assert.equal(code(await install(manager, store, '1.1.0', 'karachi-ijtema', { allowDowngrade: true })), 'ok');
    assert.equal(await activeVersion(manager), '1.1.0');
    assert.deepEqual([...store.staging.keys()], []);
  });

  await check('pack manager: rollback restores the previous pack, removes the failed one, then falls back to the bundled pack', async () => {
    const { manager, store } = setup();
    await manager.recover();
    await install(manager, store, '1.1.0');
    await install(manager, store, '1.2.0');
    assert.deepEqual([...store.installed.keys()].sort(), ['karachi-ijtema@1.1.0', 'karachi-ijtema@1.2.0']);
    const rb = await manager.rollback('karachi-ijtema');
    assert.deepEqual(rb.ok && rb.to, 'previous');
    assert.equal(await activeVersion(manager), '1.1.0');
    assert.deepEqual([...store.installed.keys()], ['karachi-ijtema@1.1.0']);
    const rb2 = await manager.rollback('karachi-ijtema');
    assert.deepEqual(rb2.ok && rb2.to, 'bundled');
    assert.equal((await manager.resolveActive('karachi-ijtema'))?.source, 'bundled');
    assert.deepEqual([...store.installed.keys()], []);
    assert.equal(code(await manager.rollback('karachi-ijtema')), 'not-installed');
  });

  await check('pack manager: only active + previous are retained; older versions are garbage collected after activation', async () => {
    const { manager, store } = setup();
    await manager.recover();
    for (const v of ['1.1.0', '1.2.0', '1.3.0']) await install(manager, store, v);
    assert.deepEqual([...store.installed.keys()].sort(), ['karachi-ijtema@1.2.0', 'karachi-ijtema@1.3.0']);
  });

  await check('pack manager: only a CONFIRMED pack becomes the rollback target; an unconfirmed one is replaced, never kept in its place', async () => {
    const { manager, store } = setup();
    await manager.recover();
    await install(manager, store, '1.1.0'); // confirmed (ran well)
    await install(manager, store, '1.2.0', 'karachi-ijtema', { confirm: false }); // never confirmed
    await install(manager, store, '1.3.0', 'karachi-ijtema', { confirm: false });
    assert.deepEqual([...store.installed.keys()].sort(), ['karachi-ijtema@1.1.0', 'karachi-ijtema@1.3.0']); // 1.2.0 was unproven and is gone
    const rb = await manager.rollback('karachi-ijtema');
    assert.deepEqual(rb.ok && rb.to, 'previous');
    assert.equal(await activeVersion(manager), '1.1.0');
    assert.equal(code(await manager.confirmActive('nope', 'nope@1.0.0')), 'not-installed');
    assert.equal(code(await manager.confirmActive('karachi-ijtema', 'karachi-ijtema@1.2.0')), 'version-conflict'); // ran on an older pack, not this one
  });

  await check('pack manager: interrupted installs - commit failure, pointer-write failure and a crash after commit never change or lose the active pack', async () => {
    const { manager, store } = setup();
    await manager.recover();
    await install(manager, store, '1.1.0');
    const pointerBefore = store.pointer;
    store.failCommit = true;
    assert.equal(code(await install(manager, store, '1.2.0')), 'commit-failed');
    store.failCommit = false;
    store.failPointer = true;
    assert.equal(code(await install(manager, store, '1.2.0')), 'pointer-write-failed');
    assert.equal(store.pointer, pointerBefore);
    assert.equal(await activeVersion(manager), '1.1.0');
    assert.deepEqual([...store.installed.keys()], ['karachi-ijtema@1.1.0']); // the committed-but-unactivated copy was removed

    // Crash after commit: pointer write fails AND cleanup fails (process dies). A fresh process must recover cleanly.
    store.failRemove = true;
    assert.equal(code(await install(manager, store, '1.2.0')), 'pointer-write-failed');
    assert.deepEqual([...store.installed.keys()].sort(), ['karachi-ijtema@1.1.0', 'karachi-ijtema@1.2.0']);
    store.failPointer = false; store.failRemove = false;
    stage(store, 'half-copied', makePack('1.3.0')); // an interrupted download left in staging
    const fresh = setup(store).manager;
    const report = await fresh.recover();
    assert.deepEqual([report.removedStaging, report.removedOrphans], [1, 1]);
    assert.equal(await activeVersion(fresh), '1.1.0');
    assert.deepEqual([...store.installed.keys()], ['karachi-ijtema@1.1.0']);
  });

  await check('pack manager: recovery repairs a corrupted active pack by rolling back, or returns to the bundled pack; it never activates a broken pack', async () => {
    const { manager, store } = setup();
    await manager.recover();
    await install(manager, store, '1.1.0');
    await install(manager, store, '1.2.0');
    store.installed.get('karachi-ijtema@1.2.0')!.files.delete('data/routing-graph.bin'); // disk corruption after install
    let m = setup(store).manager;
    let report = await m.recover();
    assert.deepEqual(report.repaired.map((r) => [r.venueId, r.to, r.reason.code]), [['karachi-ijtema', 'previous', 'resource-missing']]);
    assert.equal(await activeVersion(m), '1.1.0');
    store.installed.get('karachi-ijtema@1.1.0')!.files.set('data/map-archive.bin', { bytes: 100, sha256: sha('bitrot') });
    m = setup(store).manager;
    report = await m.recover();
    assert.deepEqual(report.repaired.map((r) => r.to), ['bundled']);
    assert.equal((await m.resolveActive('karachi-ijtema'))?.source, 'bundled');
    assert.equal(JSON.parse(store.pointer as string).venues['karachi-ijtema'], undefined);
  });

  await check('pack manager: a corrupt pointer file serves the bundled pack, blocks installs and deletes nothing', async () => {
    const { manager, store } = setup();
    await manager.recover();
    await install(manager, store, '1.1.0');
    store.pointer = '{"v":1,"generation":2,"venues":{"karachi-ijtema":{"active":"x"';
    const m = setup(store).manager;
    const report = await m.recover();
    assert.equal(report.pointerCorrupt, true);
    assert.equal((await m.resolveActive('karachi-ijtema'))?.source, 'bundled');
    assert.deepEqual([...store.installed.keys()], ['karachi-ijtema@1.1.0']); // evidence kept for repair
    assert.equal(code(await install(m, store, '1.2.0')), 'pointer-corrupt');
    assert.equal(code(await m.repairPointer()), 'ok');
    assert.equal(code(await install(m, store, '1.2.0')), 'ok');
    assert.equal(await activeVersion(m), '1.2.0');
  });

  await check('pack manager: a journey pin keeps its pack (and graph) while a newer pack activates; files go only after release', async () => {
    const { manager, store } = setup();
    await manager.recover();
    await install(manager, store, '1.1.0');
    const pin = await manager.pin('karachi-ijtema');
    assert.equal(pin?.manifest.packVersion, '1.1.0');
    await install(manager, store, '1.2.0');
    await install(manager, store, '1.3.0'); // 1.1.0 is now neither active nor previous, but still pinned
    assert.equal(await activeVersion(manager), '1.3.0');
    assert.ok(store.installed.has('karachi-ijtema@1.1.0'));
    assert.equal(pin?.manifest.packVersion, '1.1.0');
    pin?.release(); pin?.release(); // idempotent
    await manager.resolveActive('karachi-ijtema'); // drains the serialized sweep queued by release
    assert.deepEqual([...store.installed.keys()].sort(), ['karachi-ijtema@1.2.0', 'karachi-ijtema@1.3.0']);
  });

  await check('pack manager: venues are isolated - installing or rolling back one never changes another', async () => {
    const store = new FakeStore();
    const { manager } = setup(store);
    const second = makePack('2.0.0', 'second-venue', false);
    store.bundled.set('second-2.0.0', second.dir);
    const both = createPackManager({
      store, sdkVersion: '0.1.0', platformCapabilities: ['pmtiles-local-read'], trustedKeyIds: ['k1'],
      bundled: [{ id: 'karachi-1.0.0', manifestText: makePack('1.0.0', 'karachi-ijtema', false).dir.manifestText, pinnedManifestSha256: sha(makePack('1.0.0', 'karachi-ijtema', false).dir.manifestText) },
        { id: 'second-2.0.0', manifestText: second.dir.manifestText, pinnedManifestSha256: sha(second.dir.manifestText) }],
      ports: { manifestSha256: async (t) => sha(t), signatureVerifier: { verify: async (a) => a.signature === 'good' } },
    });
    void manager;
    await both.recover();
    assert.deepEqual(both.venueIds(), ['karachi-ijtema', 'second-venue']);
    await install(both, store, '1.1.0');
    await install(both, store, '2.1.0', 'second-venue');
    assert.deepEqual([await activeVersion(both), await activeVersion(both, 'second-venue')], ['1.1.0', '2.1.0']);
    await both.rollback('second-venue');
    assert.deepEqual([await activeVersion(both), await activeVersion(both, 'second-venue')], ['1.1.0', '2.0.0']);
    // A route id that exists in both venues resolves only inside the venue's own pack: manifests carry their own venueId.
    assert.equal((await both.resolveActive('second-venue'))?.manifest.venueId, 'second-venue');
    assert.notEqual((await both.resolveActive('karachi-ijtema'))?.manifest.resources[0].sha256, (await both.resolveActive('second-venue'))?.manifest.resources[0].sha256);
  });

  await check('pack manager: storage is checked before staging, without touching the active pack; concurrent installs serialize', async () => {
    const { manager, store } = setup();
    await manager.recover();
    const m = makePack('1.1.0');
    store.free = 1599; // 600 bytes of pack + 1000 reserve
    assert.equal(code(await manager.checkRoom(m.dir.manifestText)), 'storage-insufficient');
    store.free = 1600;
    assert.equal(code(await manager.checkRoom(m.dir.manifestText)), 'ok');
    assert.equal(code(await manager.checkRoom('{}')), 'field-invalid');
    assert.equal(await activeVersion(manager), '1.0.0');

    stage(store, 'a', makePack('1.2.0')); stage(store, 'b', makePack('1.3.0'));
    const results = await Promise.all([
      manager.installStaged('a', { venueId: 'karachi-ijtema', signature: 'good' }),
      manager.installStaged('b', { venueId: 'karachi-ijtema', signature: 'good' }),
    ]);
    assert.deepEqual(results.map(code), ['ok', 'ok']);
    assert.equal(await activeVersion(manager), '1.3.0');
    assert.equal(JSON.parse(store.pointer as string).generation, 2);
  });

  await check('pack manager: installs before recover() are refused (a stale in-memory view must never overwrite the pointer)', async () => {
    const { manager, store } = setup();
    stage(store, 'a', makePack('1.2.0'));
    await assert.rejects(() => manager.installStaged('a', { venueId: 'karachi-ijtema', signature: 'good' }), /recover\(\)/);
  });
  await check('pack manager: if the repair cannot be persisted the broken pack is still not served', async () => {
    const { manager, store } = setup();
    await manager.recover();
    await install(manager, store, '1.1.0');
    store.installed.get('karachi-ijtema@1.1.0')!.files.delete('data/routing-graph.bin');
    store.failPointer = true;
    const m = setup(store).manager;
    const report = await m.recover();
    assert.deepEqual(report.repaired.map((r) => r.to), ['bundled']);
    assert.equal((await m.resolveActive('karachi-ijtema'))?.source, 'bundled');
  });

  await check('pack manager: a newer bundled pack (app update) outranks a stale installed one, and also sets the install version floor', async () => {
    const store = new FakeStore();
    const first = setup(store);
    await first.manager.recover();
    await install(first.manager, store, '1.1.0');
    const updated = setup(store, { bundledVersion: '1.5.0' }).manager;
    await updated.recover();
    assert.equal(await activeVersion(updated), '1.5.0');
    assert.equal((await updated.resolveActive('karachi-ijtema'))?.source, 'bundled');
    assert.equal(code(await install(updated, store, '1.3.0')), 'version-not-newer');
    assert.equal(code(await install(updated, store, '1.6.0')), 'ok');
    assert.equal(await activeVersion(updated), '1.6.0');
  });

  await check('pack manager: transient or environmental failures (SDK range after an app update) keep the files and the pointer', async () => {
    const store = new FakeStore();
    const first = setup(store);
    await first.manager.recover();
    await install(first.manager, store, '1.1.0');
    const pointer = store.pointer;
    const newerSdk = setup(store, { sdkVersion: '0.2.0' }).manager;
    const report = await newerSdk.recover();
    assert.deepEqual(report.unavailable.map((u) => [u.venueId, u.reason.code]), [['karachi-ijtema', 'sdk-incompatible']]);
    assert.deepEqual([report.repaired.length, report.removedOrphans], [0, 0]);
    assert.equal(store.pointer, pointer);
    assert.ok(store.installed.has('karachi-ijtema@1.1.0'));
    assert.equal(await newerSdk.resolveActive('karachi-ijtema'), null); // nothing compatible this launch; nothing deleted either
    const back = setup(store).manager; // e.g. the previous app build restored
    await back.recover();
    assert.equal(await activeVersion(back), '1.1.0');
    // An unreadable disk is not corruption either.
    const flaky = setup(store).manager;
    store.reader = () => ({ stat: async () => { throw new Error('io'); }, list: async () => [] });
    const r2 = await flaky.recover();
    assert.deepEqual(r2.unavailable.map((u) => u.reason.code), ['resource-unreadable']);
    assert.ok(store.installed.has('karachi-ijtema@1.1.0'));
  });

  await check('pack manager: recover() is idempotent and must complete before use; a second call never wipes a host staging directory', async () => {
    const { manager, store } = setup();
    await assert.rejects(() => manager.resolveActive('karachi-ijtema'), /recover\(\)/);
    const a = manager.recover();
    const b = manager.recover();
    assert.equal(await a, await b);
    stage(store, 'in-flight-download', makePack('1.1.0'));
    await manager.recover();
    assert.deepEqual([...store.staging.keys()], ['in-flight-download']);
  });

  await check('pack manager: rolling back to the bundled pack removes both the failed and the broken previous pack', async () => {
    const { manager, store } = setup();
    await manager.recover();
    await install(manager, store, '1.1.0');
    await install(manager, store, '1.2.0');
    store.installed.get('karachi-ijtema@1.1.0')!.files.delete('data/provenance.bin'); // previous rotted
    const rb = await manager.rollback('karachi-ijtema');
    assert.deepEqual(rb.ok && rb.to, 'bundled');
    assert.deepEqual([...store.installed.keys()], []);
  });

  await check('pack manager: requireSignature=false is explicit and reports trust none; the default refuses unsigned installs', async () => {
    const store = new FakeStore();
    const { manager } = setup(store, { requireSignature: false });
    await manager.recover();
    stage(store, 'u', makePack('1.1.0', 'karachi-ijtema', false));
    const r = await manager.installStaged('u', { venueId: 'karachi-ijtema' });
    assert.equal(r.ok && r.trust, 'none');
  });

  await check('pack manager: pin keeps serving the pinned pack through rollback, and a pin on a bundled pack needs no file protection', async () => {
    const { manager, store } = setup();
    await manager.recover();
    await install(manager, store, '1.1.0');
    await install(manager, store, '1.2.0');
    const pin = (await manager.pin('karachi-ijtema'))!;
    assert.equal(pin.ref.id, 'karachi-ijtema@1.2.0');
    await manager.rollback('karachi-ijtema'); // the pinned pack is the failed one; its files must stay until release
    assert.ok(store.installed.has('karachi-ijtema@1.2.0'));
    assert.equal(await activeVersion(manager), '1.1.0');
    pin.release();
    await manager.resolveActive('karachi-ijtema');
    await manager.confirmActive('karachi-ijtema', 'karachi-ijtema@1.1.0'); // drains the serialized sweep
    assert.deepEqual([...store.installed.keys()], ['karachi-ijtema@1.1.0']);
    await manager.rollback('karachi-ijtema');
    const bundledPin = (await manager.pin('karachi-ijtema'))!;
    assert.equal(bundledPin.source, 'bundled');
    bundledPin.release();
  });
  await check('pack manager: a throwing store never leaks a pin, aborts recovery, or deletes the previous pack on a transient error', async () => {
    const { manager, store } = setup();
    await manager.recover();
    await install(manager, store, '1.1.0');
    await install(manager, store, '1.2.0');
    // pin must not leak when resolving throws
    const realRead = store.readManifest.bind(store);
    store.readManifest = async () => { throw new Error('EIO'); };
    const pinned = await manager.pin('karachi-ijtema'); // unreadable installed manifest => bundled is served, nothing pinned
    assert.equal(pinned?.source, 'bundled');
    store.readManifest = realRead;
    // recovery survives a throwing manifest read and keeps files
    store.readManifest = async (r) => { if (r.area === 'installed') throw new Error('EIO'); return realRead(r); };
    const fresh = setup(store).manager;
    const report = await fresh.recover();
    assert.deepEqual(report.unavailable.map((u) => u.reason.code), ['resource-unreadable']);
    assert.deepEqual([...store.installed.keys()].sort(), ['karachi-ijtema@1.1.0', 'karachi-ijtema@1.2.0']);
    store.readManifest = realRead;
    // active definitively broken but the previous cannot be read right now: change nothing
    store.installed.get('karachi-ijtema@1.2.0')!.files.delete('data/routing-graph.bin');
    store.readManifest = async (r) => { if (r.id === 'karachi-ijtema@1.1.0') throw new Error('EIO'); return realRead(r); };
    const again = setup(store).manager;
    const r2 = await again.recover();
    assert.deepEqual([r2.repaired.length, r2.unavailable.length], [0, 1]);
    assert.ok(store.installed.has('karachi-ijtema@1.1.0'));
    store.readManifest = realRead;
  });

  await check('pack manager: rollback with an unreadable previous pack changes nothing instead of guessing', async () => {
    const { manager, store } = setup();
    await manager.recover();
    await install(manager, store, '1.1.0');
    await install(manager, store, '1.2.0');
    const pointer = store.pointer;
    const realRead = store.readManifest.bind(store);
    store.readManifest = async (r) => { if (r.id === 'karachi-ijtema@1.1.0') throw new Error('EIO'); return realRead(r); };
    assert.equal(code(await manager.rollback('karachi-ijtema')), 'resource-unreadable');
    store.readManifest = realRead;
    assert.equal(store.pointer, pointer);
    assert.deepEqual([...store.installed.keys()].sort(), ['karachi-ijtema@1.1.0', 'karachi-ijtema@1.2.0']);
    assert.equal(await activeVersion(manager), '1.2.0');
  });

  await check('pack manager: a directory that is still pinned keeps a same-version reinstall staged instead of discarding the download', async () => {
    const { manager, store } = setup();
    await manager.recover();
    await install(manager, store, '1.1.0');
    await install(manager, store, '1.2.0');
    const pin = (await manager.pin('karachi-ijtema'))!;
    await manager.rollback('karachi-ijtema'); // 1.2.0 failed but a journey still holds it
    stage(store, 'again', makePack('1.2.0'));
    assert.equal(code(await manager.installStaged('again', { venueId: 'karachi-ijtema', signature: 'good' })), 'version-conflict');
    assert.ok(store.staging.has('again'));
    pin.release();
  });

  await check('pack manager: a hand-edited pointer with a path-like id is treated as corrupt', async () => {
    const { manager, store } = setup();
    store.pointer = JSON.stringify({ v: 1, generation: 1, venues: { 'karachi-ijtema': { active: 'karachi-ijtema@../x', previous: null, confirmed: true } } });
    assert.equal((await manager.recover()).pointerCorrupt, true);
  });
})();

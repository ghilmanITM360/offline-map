import {
  createFileSystemPackStore, createPackManager, parsePackManifest, PACK_MANIFEST_FILE, type PackFileSystem, type PackManager,
} from '@muslim-ummah/offline-navigation';
import type { BundledPackSource, PackAssetCopier } from './bundledPacks';
import { textSha256 } from './packRuntime';

// Runs the pack lifecycle on the REAL platform filesystem (or the Jest double), in a directory of its own that the app never reads.
// It answers questions only a device can: does move() refuse an existing destination, does an interrupted swap heal, does a
// resource flipped on disk get caught at the next start. It uses a lab manager with requireSignature:false so a locally built newer
// pack can be installed; that exercises storage, recovery and rollback, NOT the trust policy (which fails closed in the real runtime).

export interface SelfTestDeps {
  /** Rooted in a directory used only by this test. */
  fs: PackFileSystem;
  reset(): Promise<void>;
  copier: PackAssetCopier;
  primary: SelfTestPack;
  secondary: SelfTestPack;
  sdkVersion: string;
  platformCapabilities: readonly string[];
  /** Renames one file inside the test root without any swap logic, to reproduce a process killed mid-replacement. */
  moveFile(from: string, to: string): void;
}

/** A packaged pack and the venue it is for (the directory id is not `<venue>@<version>`). */
export type SelfTestPack = BundledPackSource & { venueId: string };

export interface SelfTestResult { name: string; ok: boolean; detail: string }

class Failed extends Error {}
const check = (condition: unknown, message: string): void => { if (!condition) throw new Failed(message); };
const venueOf = (source: SelfTestPack): string => source.venueId;

export const runPackSelfTest = async (deps: SelfTestDeps): Promise<SelfTestResult[]> => {
  const { fs, copier } = deps;
  const results: SelfTestResult[] = [];
  const scenario = async (name: string, body: () => Promise<string | void>): Promise<void> => {
    try {
      await deps.reset();
      results.push({ name, ok: true, detail: (await body()) ?? 'ok' });
    } catch (e) {
      results.push({ name, ok: false, detail: e instanceof Error ? e.message : String(e) });
    }
  };

  const restart = async (): Promise<PackManager> => {
    const manager = createPackManager({
      store: createFileSystemPackStore({ fs }), sdkVersion: deps.sdkVersion, platformCapabilities: deps.platformCapabilities,
      reserveBytes: 0, requireSignature: false, ports: { manifestSha256: textSha256 },
    });
    await manager.recover();
    return manager;
  };

  /** Fills `packs/staging/<id>` with a packaged pack, optionally relabelled as another version of the same venue and optionally missing a file. */
  const stage = async (source: SelfTestPack, stagingId: string, options: { version?: string; omit?: string } = {}): Promise<void> => {
    for (const path of source.files) if (path !== options.omit) await copier.copy(source.id, path, `packs/staging/${stagingId}/${path}`);
    if (options.version) {
      const file = `packs/staging/${stagingId}/${PACK_MANIFEST_FILE}`;
      const manifest = JSON.parse((await fs.readText(file)) as string);
      manifest.packVersion = options.version;
      manifest.packId = `${venueOf(source)}@${options.version}`;
      await fs.writeTextAtomic(file, `${JSON.stringify(manifest, null, 2)}\n`);
    }
  };
  const installVersion = async (manager: PackManager, source: SelfTestPack, version: string): Promise<void> => {
    await stage(source, `s-${version}`, { version });
    const result = await manager.installStaged(`s-${version}`, { venueId: venueOf(source) });
    check(result.ok, `install ${version} failed: ${result.ok ? '' : result.error.code}`);
    const confirmed = await manager.confirmActive(venueOf(source), `${venueOf(source)}@${version}`);
    check(confirmed.ok, `confirm ${version} failed`);
  };
  const activeVersion = async (manager: PackManager, venue = venueOf(deps.primary)): Promise<string | undefined> => (await manager.resolveActive(venue))?.manifest.packVersion;
  const venue = venueOf(deps.primary);

  await scenario('file system: replace, list, size, chunked read, rename onto an existing directory is refused', async () => {
    await fs.writeTextAtomic('t/a.txt', 'one');
    await fs.writeTextAtomic('t/a.txt', 'two ✓');
    check((await fs.readText('t/a.txt')) === 'two ✓', 'replaced text not read back');
    check((await fs.size('t/a.txt')) === 7, 'size is not the UTF-8 byte length');
    check((await fs.readText('t/none.txt')) === null, 'a missing file is not null');
    check((await fs.listNames('t')).join() === 'a.txt', `unexpected names ${(await fs.listNames('t')).join()}`);
    await copier.copy(deps.primary.id, 'map/ijtema-basemap.pmtiles', 't/big/map.bin');
    const total = (await fs.size('t/big/map.bin')) as number;
    let sum = 0;
    let biggest = 0;
    for await (const chunk of fs.readChunks('t/big/map.bin', 4096)) { sum += chunk.length; biggest = Math.max(biggest, chunk.length); }
    check(sum === total && biggest <= 4096, `chunks add up to ${sum} of ${total}, largest ${biggest}`);
    await fs.writeTextAtomic('t/d1/x', 'x');
    await fs.writeTextAtomic('t/d2/y', 'y');
    let refused = false;
    await fs.renameDir('t/d1', 't/d2').catch(() => { refused = true; });
    check(refused, 'renameDir accepted an existing destination');
    check((await fs.size('t/d2/d1/x')) === null && (await fs.size('t/d1/x')) === 1, 'the directory was moved inside the destination');
    await fs.renameDir('t/d1', 't/moved/deeper');
    check((await fs.size('t/moved/deeper/x')) === 1, 'rename into a new parent failed');
    await fs.removeTree('t/nothing-here');
    check((await fs.freeBytes()) > total, 'free space is not reported');
    return `${total} bytes streamed in chunks of at most ${biggest}`;
  });

  await scenario('replacing a file interrupted before the new text is moved in: the previous complete text comes back', async () => {
    await fs.writeTextAtomic('p/pointer.json', 'GOOD');
    deps.moveFile('p/pointer.json', 'p/pointer.json.swap-old'); // the target was moved aside, the process died
    await fs.writeTextAtomic('p/pointer.json.swap-tmp', 'PART').catch(() => undefined);
    check((await fs.readText('p/pointer.json')) === 'GOOD', 'previous text not restored');
    await fs.writeTextAtomic('p/pointer.json', 'NEXT');
    check((await fs.readText('p/pointer.json')) === 'NEXT', 'next write failed');
    check((await fs.listNames('p')).join() === 'pointer.json', `leftovers: ${(await fs.listNames('p')).join()}`);
  });

  await scenario('install, update, confirm and roll back across restarts', async () => {
    let manager = await restart();
    await installVersion(manager, deps.primary, '1.0.0');
    await installVersion(manager, deps.primary, '1.1.0');
    check((await activeVersion(manager)) === '1.1.0', 'update did not activate');
    manager = await restart();
    check((await activeVersion(manager)) === '1.1.0', 'update did not survive a restart');
    const back = await manager.rollback(venue);
    check(back.ok && (await activeVersion(manager)) === '1.0.0', 'rollback failed');
    manager = await restart();
    return `active ${await activeVersion(manager)} after rollback and restart`;
  });

  for (const [label, damage] of [
    ['a resource changed on disk', async () => { await fs.writeTextAtomic(`packs/installed/${venue}@1.1.0/data/routing-graph.json`, '{"tampered":true}\n'); }],
    ['a resource deleted from disk', async () => { await fs.removeTree(`packs/installed/${venue}@1.1.0/map/ijtema-basemap.pmtiles`); }],
  ] as const) {
    await scenario(`${label}: caught at the next start, the previous pack serves`, async () => {
      let manager = await restart();
      await installVersion(manager, deps.primary, '1.0.0');
      await installVersion(manager, deps.primary, '1.1.0');
      await damage();
      manager = await restart();
      check((await activeVersion(manager)) === '1.0.0', `active is ${await activeVersion(manager)}`);
    });
  }

  await scenario('an update with a missing file is refused, its staging is removed, and the active pack is untouched', async () => {
    const manager = await restart();
    await installVersion(manager, deps.primary, '1.0.0');
    await stage(deps.primary, 's-bad', { version: '1.1.0', omit: 'data/gate-metadata.json' });
    const result = await manager.installStaged('s-bad', { venueId: venue });
    check(!result.ok && result.error.code === 'resource-missing', `unexpected result ${JSON.stringify(result)}`);
    check((await fs.listNames('packs/staging')).length === 0, 'staging was not cleaned');
    check((await activeVersion(manager)) === '1.0.0', 'active pack changed');
  });

  await scenario('an update interrupted before it is installed leaves staging that startup sweeps away', async () => {
    let manager = await restart();
    await installVersion(manager, deps.primary, '1.0.0');
    await stage(deps.primary, 's-half', { version: '1.1.0', omit: 'map/ijtema-basemap.pmtiles' }); // never installed: the process died while copying
    manager = await restart();
    check((await fs.listNames('packs/staging')).length === 0, 'interrupted staging survived startup');
    check((await activeVersion(manager)) === '1.0.0', 'active pack changed');
  });

  await scenario('a pinned journey keeps its pack files through an update; releasing lets them go', async () => {
    const manager = await restart();
    await installVersion(manager, deps.primary, '1.0.0');
    const pin = await manager.pin(venue);
    check(pin?.manifest.packVersion === '1.0.0' && pin.ref.area === 'installed', 'pin did not hold the installed pack');
    await installVersion(manager, deps.primary, '1.1.0');
    await installVersion(manager, deps.primary, '1.2.0');
    check((await fs.size(`packs/installed/${venue}@1.0.0/${PACK_MANIFEST_FILE}`)) !== null, 'pinned files were removed');
    pin?.release();
    const after = await restart();
    check((await fs.size(`packs/installed/${venue}@1.0.0/${PACK_MANIFEST_FILE}`)) === null, 'released pack was not cleaned up');
    check((await activeVersion(after)) === '1.2.0', 'active pack changed');
  });

  await scenario('storage pressure: an update that does not fit is refused before staging, the real free space admits one that does', async () => {
    const manager = await restart();
    await installVersion(manager, deps.primary, '1.0.0');
    const text = (await fs.readText(`packs/installed/${venue}@1.0.0/${PACK_MANIFEST_FILE}`)) as string;
    const parsed = parsePackManifest(text);
    check(parsed.ok, 'installed manifest unreadable');
    const free = await fs.freeBytes();
    check((await manager.checkRoom(text)).ok, `real free space ${free} should admit ${parsed.ok ? parsed.manifest.totalBytes : 0} bytes`);
    const tight = createPackManager({
      store: createFileSystemPackStore({ fs: { ...fs, freeBytes: async () => 1000 } }), sdkVersion: deps.sdkVersion,
      platformCapabilities: deps.platformCapabilities, requireSignature: false, ports: { manifestSha256: textSha256 },
    });
    await tight.recover();
    const refused = await tight.checkRoom(text);
    check(!refused.ok && refused.error.code === 'storage-insufficient', 'a full disk was not refused');
    return `free ${Math.round(free / 1e6)} MB`;
  });

  await scenario('two venues stay separate: each resolves its own pack, and updating one leaves the other alone', async () => {
    const manager = await restart();
    await installVersion(manager, deps.primary, '1.0.0');
    await installVersion(manager, deps.secondary, '1.0.0');
    await installVersion(manager, deps.primary, '1.1.0');
    const a = await manager.resolveActive(venue);
    const b = await manager.resolveActive(venueOf(deps.secondary));
    check(a?.manifest.venueId === venue && b?.manifest.venueId === venueOf(deps.secondary), 'venues crossed');
    check(a?.manifest.packVersion === '1.1.0' && b?.manifest.packVersion === '1.0.0', 'one venue update moved the other');
  });

  await deps.reset();
  return results;
};

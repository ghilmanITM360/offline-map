import {
  createFileSystemPackStore, PACK_MANIFEST_FILE, parsePackManifest, verifyPack, type BundledPack, type PackError, type PackFileSystem,
} from '@muslim-ummah/offline-navigation';

// The host owns getting packs that ship inside the app onto the device. Each pack is copied once into app-private storage and is
// trusted only while every byte still hashes to a manifest whose own SHA-256 is pinned in this build. A failed or interrupted copy
// is never used: it is built in a staging area and renamed into place whole.

export const BUNDLED_DIR = 'bundled';
export const BUNDLED_STAGING_DIR = 'bundled-staging';

export interface BundledPackSource {
  id: string;
  /** SHA-256 of the exact manifest text, shipped with the build (the pin). */
  manifestSha256: string;
  /** Pack-relative paths of every file in the pack, including the manifest. */
  files: readonly string[];
}

/** Where the bundled bytes come from. On a device it resolves the app's packaged assets; tests supply a directory. */
export interface PackAssetCopier {
  readText(packId: string, path: string): Promise<string>;
  /** Copies one packaged file to `destination` (relative to the pack file system's root), creating parent directories. */
  copy(packId: string, path: string, destination: string): Promise<void>;
}

export type BundledPackStatus =
  | { id: string; status: 'present' }
  | { id: string; status: 'installed'; repaired: boolean }
  | { id: string; status: 'failed'; error: PackError | { code: 'asset-digest-mismatch' | 'asset-unreadable' | 'copy-failed'; message: string } };

export interface BundledPackInstall {
  /** For `createPackManager({ bundled })`: only packs whose directory verified. A failed pack is absent, never half-present. */
  bundled: BundledPack[];
  report: BundledPackStatus[];
}

export interface BundledPackDeps {
  fs: PackFileSystem;
  sources: readonly BundledPackSource[];
  copier: PackAssetCopier;
  sha256Text(text: string): Promise<string>;
  sdkVersion: string;
  platformCapabilities: readonly string[];
}

export const installBundledPacks = async (deps: BundledPackDeps): Promise<BundledPackInstall> => {
  const { fs, copier } = deps;
  const live = createFileSystemPackStore({ fs, bundledRoot: BUNDLED_DIR });
  const staged = createFileSystemPackStore({ fs, bundledRoot: BUNDLED_STAGING_DIR });
  await fs.removeTree(BUNDLED_STAGING_DIR); // anything left here is an interrupted copy
  const bundled: BundledPack[] = [];
  const report: BundledPackStatus[] = [];

  for (const source of deps.sources) {
    const fail = (error: Extract<BundledPackStatus, { status: 'failed' }>['error']): void => { report.push({ id: source.id, status: 'failed', error }); };
    let manifestText: string;
    try {
      manifestText = await copier.readText(source.id, PACK_MANIFEST_FILE);
    } catch {
      fail({ code: 'asset-unreadable', message: 'the packaged manifest could not be read' });
      continue;
    }
    if ((await deps.sha256Text(manifestText)).toLowerCase() !== source.manifestSha256.toLowerCase()) {
      fail({ code: 'asset-digest-mismatch', message: 'the packaged manifest does not match the digest pinned in this build' });
      continue;
    }
    const parsed = parsePackManifest(manifestText);
    if (!parsed.ok) { fail(parsed.error); continue; }
    const check = (store: typeof live) => verifyPack(manifestText, { reader: store.reader({ area: 'bundled', id: source.id }), manifestSha256: deps.sha256Text }, {
      pinnedManifestSha256: source.manifestSha256,
      compatibility: { sdkVersion: deps.sdkVersion, platformCapabilities: deps.platformCapabilities, expectedVenueId: parsed.manifest.venueId },
    });
    const accept = (): void => { bundled.push({ id: source.id, manifestText, pinnedManifestSha256: source.manifestSha256 }); };

    const existing = await check(live).catch(() => null);
    if (existing?.ok) { accept(); report.push({ id: source.id, status: 'present' }); continue; }
    const repaired = (await fs.size(`${BUNDLED_DIR}/${source.id}/${PACK_MANIFEST_FILE}`)) !== null || (await fs.listNames(`${BUNDLED_DIR}/${source.id}`)).length > 0;

    try {
      for (const path of source.files) {
        await copier.copy(source.id, path, `${BUNDLED_STAGING_DIR}/${source.id}/${path}`);
      }
      const result = await check(staged);
      if (!result.ok) { await fs.removeTree(`${BUNDLED_STAGING_DIR}/${source.id}`); fail(result.error); continue; }
      await fs.removeTree(`${BUNDLED_DIR}/${source.id}`);
      await fs.renameDir(`${BUNDLED_STAGING_DIR}/${source.id}`, `${BUNDLED_DIR}/${source.id}`);
    } catch (e) {
      await fs.removeTree(`${BUNDLED_STAGING_DIR}/${source.id}`).catch(() => undefined);
      fail({ code: 'copy-failed', message: e instanceof Error ? e.message : 'copy failed' });
      continue;
    }
    const final = await check(live).catch(() => null);
    if (final?.ok) { accept(); report.push({ id: source.id, status: 'installed', repaired }); } else fail(final ? final.error : { code: 'copy-failed', message: 'the installed copy could not be read back' });
  }

  // An app update that no longer ships a pack must not leave its bytes behind.
  const wanted = new Set(deps.sources.map((s) => s.id));
  for (const name of await fs.listNames(BUNDLED_DIR)) if (!wanted.has(name)) await fs.removeTree(`${BUNDLED_DIR}/${name}`);
  await fs.removeTree(BUNDLED_STAGING_DIR);
  return { bundled, report };
};

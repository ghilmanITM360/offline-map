import { Asset } from 'expo-asset';
import { Directory, File, Paths } from 'expo-file-system';
import { BUNDLED_PACK_TABLE } from './bundledPackTable';
import type { PackAssetCopier } from './bundledPacks';
import { createExpoPackFileSystem } from './expoPackFileSystem';
import { startPacks, type PackRuntime } from './packRuntime';
import { runPackSelfTest, type SelfTestResult } from './packSelfTest';

// The device side of the pack runtime: packaged assets in, app-private storage out. Everything else is in packRuntime.ts.
const { version: SDK_VERSION } = require('@muslim-ummah/offline-navigation/package.json') as { version: string };
export const PLATFORM_CAPABILITIES = ['pmtiles-local-read'] as const;

/** Where this app keeps packs. Not under the cache directory: the system may purge that, and a pack must survive until the app removes it. */
export const packRootUri = (name = 'ummah-packs'): string => new Directory(Paths.document, name).uri.replace(/\/$/, '');

const localUriOf = async (packId: string, path: string): Promise<string> => {
  const pack = BUNDLED_PACK_TABLE.find((p) => p.id === packId);
  const module = pack?.assets[path];
  if (module === undefined) throw new Error(`no packaged file ${path} for ${packId}`);
  const asset = await Asset.fromModule(module).downloadAsync();
  if (!asset.localUri) throw new Error(`packaged file ${path} has no local URI`);
  return asset.localUri;
};

export const createAssetCopier = (rootUri: string): PackAssetCopier => ({
  readText: async (packId, path) => new File(await localUriOf(packId, path)).text(),
  copy: async (packId, path, destination) => {
    const from = new File(await localUriOf(packId, path));
    const target = new File(rootUri, destination);
    const cut = destination.lastIndexOf('/');
    if (cut > 0) new Directory(rootUri, destination.slice(0, cut)).create({ intermediates: true, idempotent: true });
    if (target.exists) target.delete();
    from.copy(target);
  },
});

export const startBundledPacks = (): Promise<PackRuntime> => {
  const rootUri = packRootUri();
  return startPacks({
    fs: createExpoPackFileSystem(rootUri),
    copier: createAssetCopier(rootUri),
    sources: BUNDLED_PACK_TABLE.map(({ id, manifestSha256, files }) => ({ id, manifestSha256, files })),
    sdkVersion: SDK_VERSION,
    platformCapabilities: PLATFORM_CAPABILITIES,
  });
};

export { SDK_VERSION };

/**
 * Runs the pack lifecycle scenarios on this device's real filesystem, in a directory of their own (`ummah-packs-selftest`) that the app
 * never reads. A lab manager is used, so this checks storage, recovery and rollback, not the trust policy.
 */
export const runDeviceSelfTest = async (): Promise<SelfTestResult[]> => {
  const rootUri = packRootUri('ummah-packs-selftest');
  const fs = createExpoPackFileSystem(rootUri);
  const [primary, secondary] = BUNDLED_PACK_TABLE;
  const results = await runPackSelfTest({
    fs,
    reset: async () => { const d = new Directory(rootUri); if (d.exists) d.delete(); d.create({ intermediates: true, idempotent: true }); },
    copier: createAssetCopier(rootUri),
    primary: { id: primary.id, manifestSha256: primary.manifestSha256, files: primary.files },
    secondary: { id: secondary.id, manifestSha256: secondary.manifestSha256, files: secondary.files },
    sdkVersion: SDK_VERSION,
    platformCapabilities: PLATFORM_CAPABILITIES,
    moveFile: (from, to) => new File(rootUri, from).move(new File(rootUri, to)),
  });
  console.log(`[pack-selftest] ${JSON.stringify({ sdk: SDK_VERSION, results })}`);
  return results;
};

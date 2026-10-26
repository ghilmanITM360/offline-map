import { Asset } from 'expo-asset';
import * as Crypto from 'expo-crypto';
import { Platform } from 'react-native';
import { Directory, File, Paths } from 'expo-file-system';
import { BUNDLED_PACK_TABLE } from './bundledPackTable';
import type { PackAssetCopier } from './bundledPacks';
import { createExpoPackFileSystem } from './expoPackFileSystem';
import { createNativeDigest } from './nativeDigest';
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

/** The platform's SHA-256 over files under the pack root. Any failure (module missing, file unreadable) makes the SDK hash in JS instead. */
export const createPlatformDigest = (rootUri: string) => createNativeDigest({
  size: async (path) => { const f = new File(rootUri, path); return f.exists ? f.size : null; },
  readBytes: (path) => new File(rootUri, path).bytes(),
  digest: (bytes) => Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, bytes as Uint8Array<ArrayBuffer>),
});

export const createAssetCopier = (rootUri: string): PackAssetCopier => {
  const copy: PackAssetCopier['copy'] = async (packId, path, destination) => {
    const from = new File(await localUriOf(packId, path));
    const target = new File(rootUri, destination);
    const cut = destination.lastIndexOf('/');
    if (cut > 0) new Directory(rootUri, destination.slice(0, cut)).create({ intermediates: true, idempotent: true });
    if (target.exists) target.delete();
    from.copy(target);
  };
  return {
    copy,
    // Found on iOS: expo-file-system will copy a packaged asset but refuses to read one in place ("Missing permission for uri" inside
    // the app bundle), so text is read from a copy in app storage.
    readText: async (packId, path) => {
      const scratch = `bundled-staging/.read-${packId}`;
      await copy(packId, path, scratch);
      const file = new File(rootUri, scratch);
      try {
        return await file.text();
      } finally {
        file.delete();
      }
    },
  };
};

const perfNow = (): number => (globalThis as { performance?: { now(): number } }).performance?.now() ?? Date.now();
const round = (ms: number): number => Math.round(ms);

export const startBundledPacks = async (): Promise<PackRuntime> => {
  const rootUri = packRootUri();
  const startedAt = perfNow();
  const runtime = await startPacks({
    fs: createExpoPackFileSystem(rootUri),
    copier: createAssetCopier(rootUri),
    sources: BUNDLED_PACK_TABLE.map(({ id, manifestSha256, files }) => ({ id, manifestSha256, files })),
    sdkVersion: SDK_VERSION,
    platformCapabilities: PLATFORM_CAPABILITIES,
    digestFile: createPlatformDigest(rootUri),
  });
  // One line per start, so a cold-start measurement is a log search, not a guess. `readyAtMs` counts from the JS runtime's own start.
  const t = runtime.timings;
  console.log(`[pack-startup] ${JSON.stringify({
    platform: Platform.OS, readyAtMs: round(perfNow()), startPacksMs: round(perfNow() - startedAt),
    installMs: round(t.installMs), copyMs: round(t.copyMs), recoverMs: round(t.recoverMs), readMs: round(t.readMs), bytesRead: t.bytesRead, filesRead: t.filesRead,
    installed: runtime.install.report.map((r) => `${r.id}:${r.status}`),
  })}`);
  return runtime;
};

export { SDK_VERSION };

export interface StartupBenchmarkRow { hashing: 'js' | 'platform'; start: 'first install' | 'restart'; totalMs: number; installMs: number; recoverMs: number; readMs: number; bytesRead: number }

/**
 * Starts the bundled packs in a directory of their own (`ummah-packs-bench`, never read by the app): once from nothing (copy + verify) and once
 * again (verify only), with the SDK hashing in JS and then with the platform digest. The rows are measurements on this device, nothing else.
 */
export const runStartupBenchmark = async (): Promise<StartupBenchmarkRow[]> => {
  const rootUri = packRootUri('ummah-packs-bench');
  const rows: StartupBenchmarkRow[] = [];
  const dir = new Directory(rootUri);
  for (const hashing of ['js', 'platform'] as const) {
    if (dir.exists) dir.delete();
    dir.create({ intermediates: true, idempotent: true });
    for (const start of ['first install', 'restart'] as const) {
      const t0 = perfNow();
      const runtime = await startPacks({
        fs: createExpoPackFileSystem(rootUri),
        copier: createAssetCopier(rootUri),
        sources: BUNDLED_PACK_TABLE.map(({ id, manifestSha256, files }) => ({ id, manifestSha256, files })),
        sdkVersion: SDK_VERSION,
        platformCapabilities: PLATFORM_CAPABILITIES,
        digestFile: hashing === 'platform' ? createPlatformDigest(rootUri) : undefined,
      });
      const t = runtime.timings;
      rows.push({ hashing, start, totalMs: round(perfNow() - t0), installMs: round(t.installMs), recoverMs: round(t.recoverMs), readMs: round(t.readMs), bytesRead: t.bytesRead });
    }
  }
  if (dir.exists) dir.delete();
  console.log(`[pack-startup-benchmark] ${JSON.stringify(rows)}`);
  return rows;
};

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
    primary: { id: primary.id, venueId: primary.packId.slice(0, primary.packId.lastIndexOf('@')), manifestSha256: primary.manifestSha256, files: primary.files },
    secondary: { id: secondary.id, venueId: secondary.packId.slice(0, secondary.packId.lastIndexOf('@')), manifestSha256: secondary.manifestSha256, files: secondary.files },
    sdkVersion: SDK_VERSION,
    platformCapabilities: PLATFORM_CAPABILITIES,
    moveFile: (from, to) => new File(rootUri, from).move(new File(rootUri, to)),
  });
  console.log(`[pack-selftest] ${JSON.stringify({ sdk: SDK_VERSION, results })}`);
  return results;
};

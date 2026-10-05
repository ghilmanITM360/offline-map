/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// #140: installs the offline basemap that ships inside the APK into app-private storage, because
// MapLibre Native can open `pmtiles://file://…` but not `pmtiles://asset://…`. Purely local — there is
// no network path here, and no user action (the old Download Map step is gone).

export interface BasemapFs {
  ensureDir(dir: string): void;
  /** Byte length of the file, or null if it does not exist. */
  sizeOf(path: string): number | null;
  copy(from: string, to: string): void;
  move(from: string, to: string): void;
  remove(path: string): void;
  list(dir: string): string[];
}

export interface BasemapInstallDeps {
  fs: BasemapFs;
  dir: string;
  /** Identity of the bundled archive (from BASEMAP_PROVENANCE.json). */
  expected: { sha256: string; bytes: number };
  /** Resolves the bundled APK asset to a readable local URI (only called when an install is needed). */
  resolveAssetUri: () => Promise<string>;
}

export interface BasemapInstallResult {
  uri: string;
  reused: boolean;
}

const PREFIX = 'ijtema-basemap-';

export async function installBundledBasemap({ fs, dir, expected, resolveAssetUri }: BasemapInstallDeps): Promise<BasemapInstallResult> {
  const name = `${PREFIX}${expected.sha256.slice(0, 12)}.pmtiles`;
  const target = `${dir}/${name}`;
  fs.ensureDir(dir);

  if (fs.sizeOf(target) === expected.bytes) return { uri: target, reused: true };

  // A wrong-sized leftover is a truncated/interrupted copy: never trust it.
  fs.remove(target);
  const partial = `${target}.partial`;
  fs.remove(partial);
  fs.copy(await resolveAssetUri(), partial);
  const copied = fs.sizeOf(partial);
  if (copied !== expected.bytes) {
    fs.remove(partial);
    throw new Error(`Bundled basemap size mismatch: expected ${expected.bytes} bytes, got ${copied ?? 'none'}`);
  }
  fs.move(partial, target);

  // Archives from older app versions are dead weight once the current one is in place.
  for (const path of fs.list(dir)) {
    if (path !== target && path.slice(dir.length + 1).startsWith(PREFIX)) fs.remove(path);
  }
  return { uri: target, reused: false };
}

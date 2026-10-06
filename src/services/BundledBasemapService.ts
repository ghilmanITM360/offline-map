/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// #140: installs the offline basemap that ships inside the APK into app-private storage, because
// MapLibre Native can open `pmtiles://file://…` but not `pmtiles://asset://…`. Purely local — there is
// no network path here, and no user action. Integrity is the manifest's SHA-256 (#306), so a corrupt or
// interrupted copy is discarded and reinstalled from the bundled asset.

export interface BasemapFs {
  ensureDir(dir: string): void;
  /** Byte length of the file, or null if it does not exist. */
  sizeOf(path: string): number | null;
  /** Lowercase hex SHA-256 of the file's content, or null if it does not exist. May throw if unreadable. */
  sha256(path: string): Promise<string | null>;
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
  const partial = `${target}.partial`;
  fs.ensureDir(dir);

  // A leftover .partial is an interrupted copy: never trusted, never resumed.
  fs.remove(partial);

  // Same size is not same content (#306): the archive is trusted only when its bytes hash to the
  // manifest SHA-256. This runs once per install call (app start / first map mount), never per render.
  if (await matchesManifest(fs, target, expected)) {
    pruneOlderArchives(fs, dir, target);
    return { uri: target, reused: true };
  }

  fs.remove(target);
  try {
    fs.copy(await resolveAssetUri(), partial);
    const copied = fs.sizeOf(partial);
    if (copied !== expected.bytes) {
      throw new Error(`Bundled basemap size mismatch: expected ${expected.bytes} bytes, got ${copied ?? 'none'}`);
    }
    if (!(await hashMatches(fs, partial, expected.sha256))) {
      throw new Error('Bundled basemap checksum mismatch: the copied archive does not match the bundled manifest');
    }
    fs.move(partial, target);
  } catch (error) {
    fs.remove(partial);
    throw error;
  }

  // Archives from older app versions are dead weight once the current one is in place.
  pruneOlderArchives(fs, dir, target);
  return { uri: target, reused: false };
}

async function hashMatches(fs: BasemapFs, path: string, sha256: string): Promise<boolean> {
  try {
    return (await fs.sha256(path))?.toLowerCase() === sha256.toLowerCase();
  } catch {
    return false; // unreadable content is not valid content
  }
}

async function matchesManifest(fs: BasemapFs, path: string, expected: BasemapInstallDeps['expected']): Promise<boolean> {
  return fs.sizeOf(path) === expected.bytes && (await hashMatches(fs, path, expected.sha256));
}

function pruneOlderArchives(fs: BasemapFs, dir: string, keep: string): void {
  for (const path of fs.list(dir)) {
    if (path !== keep && path !== `${keep}.partial` && path.slice(dir.length + 1).startsWith(PREFIX)) fs.remove(path);
  }
}

// The host owns getting the offline basemap onto the device: MapLibre Native opens `pmtiles://file://...` but not an app
// asset, so the bundled archive is copied to app-private storage and trusted only when its bytes hash to the manifest.

/** Identity of the bundled Karachi archive. `scripts/sdk-package/consumer.mjs` checks it against BASEMAP_PROVENANCE.json. */
export const BASEMAP = {
  sha256: 'd5e6883d55d55b0fa9e3230ab92585fb25a8949551528ef4d176192384a28cc0',
  bytes: 434589,
  zoom: { min: 12, max: 16 },
} as const;

export interface BasemapFs {
  ensureDir(dir: string): void;
  /** Byte length, or null when the file does not exist. */
  sizeOf(path: string): number | null;
  /** Lowercase hex SHA-256, or null when the file does not exist. May throw if unreadable. */
  sha256(path: string): Promise<string | null>;
  copy(from: string, to: string): void;
  move(from: string, to: string): void;
  remove(path: string): void;
  list(dir: string): string[];
}

export interface BasemapInstallDeps {
  fs: BasemapFs;
  dir: string;
  expected: { sha256: string; bytes: number };
  /** Resolves the bundled asset to a readable local URI; only called when an install is needed. */
  resolveAssetUri: () => Promise<string>;
}

const PREFIX = 'basemap-';

const hashIs = async (fs: BasemapFs, path: string, sha256: string) => {
  try {
    return (await fs.sha256(path))?.toLowerCase() === sha256.toLowerCase();
  } catch {
    return false; // unreadable content is not valid content
  }
};

/** Returns the `file://` URI of a verified archive, reinstalling from the bundled asset when it is missing or corrupt. */
export async function installBasemap({ fs, dir, expected, resolveAssetUri }: BasemapInstallDeps): Promise<string> {
  const target = `${dir}/${PREFIX}${expected.sha256.slice(0, 12)}.pmtiles`;
  const partial = `${target}.partial`;
  fs.ensureDir(dir);
  fs.remove(partial); // a leftover partial is an interrupted copy: never trusted, never resumed
  if (fs.sizeOf(target) === expected.bytes && (await hashIs(fs, target, expected.sha256))) return target;

  fs.remove(target);
  try {
    fs.copy(await resolveAssetUri(), partial);
    const copied = fs.sizeOf(partial);
    if (copied !== expected.bytes) throw new Error(`Basemap size mismatch: expected ${expected.bytes} bytes, got ${copied ?? 'none'}`);
    if (!(await hashIs(fs, partial, expected.sha256))) throw new Error('Basemap checksum mismatch');
    fs.move(partial, target);
  } catch (error) {
    fs.remove(partial);
    throw error;
  }
  for (const path of fs.list(dir)) if (path !== target && path.slice(dir.length + 1).startsWith(PREFIX)) fs.remove(path);
  return target;
}

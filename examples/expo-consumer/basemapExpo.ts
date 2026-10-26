import { Asset } from 'expo-asset';
import { Directory, File, Paths } from 'expo-file-system';
import { BASEMAP, installBasemap, type BasemapFs } from './basemap';
import { sha256Hex } from './sha256';

// Copied into ./assets by scripts/sdk-package/consumer.mjs from the repository's verified archive.
const ARCHIVE_MODULE = require('./assets/karachi-basemap.pmtiles');

const expoFs: BasemapFs = {
  ensureDir: (dir) => {
    const d = new Directory(dir);
    if (!d.exists) d.create({ intermediates: true });
  },
  sizeOf: (path) => {
    const f = new File(path);
    return f.exists ? f.size : null;
  },
  sha256: async (path) => {
    const f = new File(path);
    return f.exists ? sha256Hex(await f.bytes()) : null;
  },
  copy: (from, to) => new File(from).copy(new File(to)),
  move: (from, to) => new File(from).move(new File(to)),
  remove: (path) => {
    const f = new File(path);
    if (f.exists) f.delete();
  },
  list: (dir) => new Directory(dir).list().map((e) => e.uri),
};

/** Installs (or re-verifies) the bundled Karachi basemap and returns its `file://` URI. Every call re-checks, so a retry heals. */
export const installKarachiBasemap = (): Promise<string> => installBasemap({
  fs: expoFs,
  dir: new Directory(Paths.document, 'map').uri.replace(/\/$/, ''),
  expected: BASEMAP,
  resolveAssetUri: async () => {
    const asset = await Asset.fromModule(ARCHIVE_MODULE).downloadAsync();
    if (!asset.localUri) throw new Error('Bundled basemap asset has no local URI');
    return asset.localUri;
  },
});

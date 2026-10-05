/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Asset } from 'expo-asset';
import { Directory, File, Paths } from 'expo-file-system';
import provenance from '../../assets/offline-map/BASEMAP_PROVENANCE.json';
import { BasemapFs, BasemapInstallResult, installBundledBasemap } from './BundledBasemapService';

const ARCHIVE_MODULE = require('../../assets/offline-map/ijtema-basemap.pmtiles');

const expoFs: BasemapFs = {
  ensureDir: (dir) => {
    const d = new Directory(dir);
    if (!d.exists) d.create({ intermediates: true });
  },
  sizeOf: (path) => {
    const f = new File(path);
    return f.exists ? f.size : null;
  },
  copy: (from, to) => new File(from).copy(new File(to)),
  move: (from, to) => new File(from).move(new File(to)),
  remove: (path) => {
    const f = new File(path);
    if (f.exists) f.delete();
  },
  list: (dir) => new Directory(dir).list().map((e) => e.uri),
};

let pending: Promise<BasemapInstallResult> | null = null;

/** Single-flight: every caller (startup, map mount) shares one install; a failure can be retried. */
export function getBundledBasemap(): Promise<BasemapInstallResult> {
  pending ??= installBundledBasemap({
    fs: expoFs,
    dir: new Directory(Paths.document, 'map').uri.replace(/\/$/, ''),
    expected: { sha256: provenance.archive.sha256, bytes: provenance.archive.bytes },
    resolveAssetUri: async () => {
      const asset = await Asset.fromModule(ARCHIVE_MODULE).downloadAsync();
      if (!asset.localUri) throw new Error('Bundled basemap asset has no local URI');
      return asset.localUri;
    },
  }).catch((e) => {
    pending = null;
    throw e;
  });
  return pending;
}

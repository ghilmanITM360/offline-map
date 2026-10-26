/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { PackFileReader } from './PackVerifier';
import type { PackRef, PackStore } from './PackStore';
import { createSha256 } from './Sha256';

/** Pack-relative names of the two files that describe a pack rather than belong to it. */
export const PACK_MANIFEST_FILE = 'pack.manifest.json';
export const PACK_SIGNATURE_FILE = 'pack.manifest.sig';

/**
 * The only filesystem the pack store needs. A host implements it over expo-file-system, react-native-fs or its own native module;
 * the SDK ships no implementation and imports no platform module. Paths are `/`-separated and relative to a root the host chose.
 * Every method rejects on an I/O failure; "missing" is a normal answer where the signature says so.
 */
export interface PackFileSystem {
  /** Exact UTF-8 text (decoded fatally, BOM kept), or null when the file does not exist. */
  readText(path: string): Promise<string | null>;
  /** Replaces the file as a whole: write a sibling temp file, flush, rename over it. Readers see the old or the new text. */
  writeTextAtomic(path: string, text: string): Promise<void>;
  /** Names directly inside a directory; empty when it does not exist. */
  listNames(path: string): Promise<string[]>;
  /** Every file below a directory as a `/`-separated path relative to it; empty when it does not exist. */
  listFilesRecursive(path: string): Promise<string[]>;
  /** Size of a file in bytes, or null when it does not exist (or is not a file). */
  size(path: string): Promise<number | null>;
  /** The file's bytes in chunks of at most `chunkBytes`, so memory stays bounded however large the file is. */
  readChunks(path: string, chunkBytes: number): AsyncIterable<Uint8Array>;
  /** Atomically renames a directory. Must reject when `to` already exists. */
  renameDir(from: string, to: string): Promise<void>;
  /** Removes a file or directory tree. Idempotent: a missing path is not an error. */
  removeTree(path: string): Promise<void>;
  freeBytes(): Promise<number>;
}

export interface FileSystemPackStoreConfig {
  fs: PackFileSystem;
  /** Directory holding `staging/`, `installed/` and `pointer.json`. Default `packs`. */
  root?: string;
  /** Directory of read-only packs shipped inside the app, one subdirectory per `BundledPack.id`. Default `bundled`. */
  bundledRoot?: string;
  /** Hashing chunk size. Default 64 KiB; peak memory while hashing is about this. */
  chunkBytes?: number;
}

export interface FileSystemPackStore extends PackStore {
  /** Where an importer fills a new pack before `installStaged`. The directory is untrusted until the manager verifies it. */
  stagingDir(stagingId: string): string;
}

// Ids reach the filesystem from a persisted pointer file, so they are validated like any untrusted input.
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._@-]{0,127}$/; // installed ids are `<venueId>@<version>`
const safeId = (id: string): string => {
  if (!SAFE_ID.test(id) || id.includes('..')) throw new Error(`unsafe pack id: ${JSON.stringify(id)}`);
  return id;
};
const safeRelative = (path: string): string => {
  if (path.length === 0 || path.startsWith('/') || path.includes('\\') || path.split('/').some((s) => s === '' || s === '.' || s === '..')) {
    throw new Error(`unsafe pack path: ${JSON.stringify(path)}`);
  }
  return path;
};

export const createFileSystemPackStore = (config: FileSystemPackStoreConfig): FileSystemPackStore => {
  const { fs } = config;
  const root = (config.root ?? 'packs').replace(/\/+$/, '');
  const bundledRoot = (config.bundledRoot ?? 'bundled').replace(/\/+$/, '');
  const chunkBytes = Math.max(1024, config.chunkBytes ?? 64 * 1024);
  const pointerPath = `${root}/pointer.json`;
  const dir = (ref: PackRef): string => `${ref.area === 'bundled' ? bundledRoot : `${root}/${ref.area}`}/${safeId(ref.id)}`;

  const reader = (ref: PackRef): PackFileReader => {
    const base = dir(ref);
    return {
      async stat(path) {
        const full = `${base}/${safeRelative(path)}`;
        if ((await fs.size(full)) === null) return null;
        const hasher = createSha256();
        let bytes = 0;
        for await (const chunk of fs.readChunks(full, chunkBytes)) {
          hasher.update(chunk);
          bytes += chunk.length;
        }
        return { bytes, sha256: hasher.digestHex() };
      },
      async list() {
        return (await fs.listFilesRecursive(base)).filter((p) => p !== PACK_MANIFEST_FILE && p !== PACK_SIGNATURE_FILE);
      },
    };
  };

  return {
    readPointer: () => fs.readText(pointerPath),
    writePointer: (text) => fs.writeTextAtomic(pointerPath, text),
    freeBytes: () => fs.freeBytes(),
    list: async (area) => (await fs.listNames(`${root}/${area}`)).filter((name) => SAFE_ID.test(name) && !name.includes('..')),
    readManifest: (ref) => fs.readText(`${dir(ref)}/${PACK_MANIFEST_FILE}`),
    reader,
    commit: (stagingId, installedId) => fs.renameDir(dir({ area: 'staging', id: stagingId }), dir({ area: 'installed', id: installedId })),
    remove: (ref) => fs.removeTree(dir(ref)),
    stagingDir: (stagingId) => dir({ area: 'staging', id: stagingId }),
  };
};

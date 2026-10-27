import * as ExpoFileSystem from 'expo-file-system';
import type { PackFileSystem } from '@muslim-ummah/offline-navigation';

// The SDK's PackFileSystem port over the installed expo-file-system (SDK 54, 19.0.x object API). Facts this adapter is written
// against, read from that version's native sources rather than assumed:
//  - File.write is NOT atomic (iOS `atomically: false`), and there is no fsync. Replacing a file is therefore a three-step swap
//    (write temp, move target aside, move temp in) that readText() repairs, so a process kill at any step leaves the old or the
//    new complete text. Power-loss durability is whatever the OS gives; expo-file-system offers no flush.
//  - move() onto an existing File fails on both platforms, and moving a Directory onto an existing Directory moves it INSIDE
//    (unix `mv`). renameDir() checks for the destination first and creates the destination's parent (Android requires it).
//  - FileHandle.readBytes returns an empty array at end of file (Android allocates min(length, remaining)); the handle must be closed.
//  - File.exists / Directory.exists are type-aware on iOS and Android validateType() throws on the wrong type, so existence
//    checks go through a guard that treats a throw as "not that kind of thing".

export type ExpoFsApi = Pick<typeof ExpoFileSystem, 'File' | 'Directory'> & { Paths: Pick<typeof ExpoFileSystem.Paths, 'availableDiskSpace'> };

const nameOf = (uri: string): string => {
  const trimmed = uri.replace(/\/+$/, '');
  return decodeURIComponent(trimmed.slice(trimmed.lastIndexOf('/') + 1));
};
const SWAP_OLD = '.swap-old';
const SWAP_TMP = '.swap-tmp';

export const createExpoPackFileSystem = (rootUri: string, api: ExpoFsApi = ExpoFileSystem): PackFileSystem => {
  const { File, Directory } = api;
  const file = (path: string) => new File(rootUri, path);
  const dir = (path: string) => new Directory(rootUri, path);
  const guard = (probe: () => boolean): boolean => { try { return probe(); } catch { return false; } };
  const isFile = (path: string): boolean => guard(() => file(path).exists);
  const isDir = (path: string): boolean => guard(() => dir(path).exists);
  const ensureParent = (path: string): void => {
    const cut = path.lastIndexOf('/');
    if (cut > 0) dir(path.slice(0, cut)).create({ intermediates: true, idempotent: true });
  };
  const rootDir = new Directory(rootUri);
  if (!guard(() => rootDir.exists)) rootDir.create({ intermediates: true, idempotent: true });

  /** A kill between "target moved aside" and "temp moved in" leaves only `<path>.swap-old`: that is the last complete text. */
  const repair = (path: string): void => {
    if (isFile(path)) return;
    if (isFile(path + SWAP_OLD)) file(path + SWAP_OLD).move(file(path));
  };

  const walk = (path: string, prefix: string): string[] => {
    const out: string[] = [];
    for (const entry of dir(path).list()) {
      const name = nameOf(entry.uri);
      if (entry instanceof Directory) out.push(...walk(`${path}/${name}`, `${prefix}${name}/`));
      else out.push(`${prefix}${name}`);
    }
    return out;
  };

  return {
    async readText(path) {
      repair(path);
      if (!isFile(path)) return null;
      return file(path).text();
    },

    async writeTextAtomic(path, text) {
      ensureParent(path);
      const tmp = path + SWAP_TMP;
      const old = path + SWAP_OLD;
      if (isFile(tmp)) file(tmp).delete(); // a leftover temp is an interrupted write: never read, never resumed
      repair(path); // finish an interrupted swap before starting a new one
      const t = file(tmp);
      t.create({ overwrite: true });
      t.write(text);
      if (isFile(old)) file(old).delete();
      const hadTarget = isFile(path);
      if (hadTarget) file(path).move(file(old));
      try {
        t.move(file(path));
      } catch (e) {
        if (hadTarget) file(old).move(file(path)); // put the previous text back
        throw e;
      }
      // The new text is in place: that was the commit point. Removing the replaced copy is housekeeping; failing here must not report the
      // write as failed (readText() ignores a leftover .swap-old whenever the target exists, and the next write deletes it).
      if (hadTarget) {
        try { file(old).delete(); } catch { /* best effort */ }
      }
    },

    async listNames(path) {
      if (!isDir(path)) return [];
      return dir(path).list().map((e) => nameOf(e.uri));
    },

    async listFilesRecursive(path) {
      return isDir(path) ? walk(path, '') : [];
    },

    async size(path) {
      return isFile(path) ? file(path).size : null;
    },

    async *readChunks(path, chunkBytes) {
      if (!isFile(path)) throw new Error(`no such file: ${path}`);
      const handle = file(path).open();
      try {
        for (;;) {
          const bytes = handle.readBytes(chunkBytes);
          if (bytes.length === 0) return;
          yield bytes;
        }
      } finally {
        handle.close();
      }
    },

    async renameDir(from, to) {
      if (isDir(to) || isFile(to)) throw new Error(`destination exists: ${to}`);
      ensureParent(to);
      dir(from).move(dir(to));
    },

    async removeTree(path) {
      if (isDir(path)) dir(path).delete();
      else if (isFile(path)) file(path).delete();
    },

    async freeBytes() {
      return api.Paths.availableDiskSpace;
    },
  };
};

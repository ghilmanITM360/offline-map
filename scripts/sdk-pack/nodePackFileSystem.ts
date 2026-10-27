/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// The SDK's PackFileSystem port over Node's fs. It is the reference implementation of the port's contract (used by the pack tests and
// the pack compiler) and the model for a React Native adapter. Paths handed in are relative to `root` and may not leave it.
//
// Link policy: a pack tree contains regular files and directories only. Every component below the root is inspected with lstat and a
// symbolic link is never followed: reading, hashing, writing, listing, renaming and removing all refuse a path that passes through one, so no
// target outside the root can become a pack resource. A link (or any other entry that is not a regular file or directory) is still
// REPORTED by listFilesRecursive, so the verifier sees it as an unexpected resource instead of it being invisible, and size() answers null
// for it, so a declared resource that is a link is missing. Hard links are not detected (they need write access to the same tree).
import { randomBytes } from 'node:crypto';
import { constants, type Stats } from 'node:fs';
import { lstat, mkdir, open, readdir, rename, rm, statfs } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import type { PackFileSystem } from '../../packages/offline-navigation/src/domain/pack';

const isMissing = (e: unknown): boolean => (e as NodeJS.ErrnoException)?.code === 'ENOENT' || (e as NodeJS.ErrnoException)?.code === 'ENOTDIR';

export interface NodePackFileSystemOptions {
  /** Refuse any entry not owned by the current user (POSIX). Use it when the pack tree may be written by other accounts. Default false. */
  requireCurrentUser?: boolean;
}

export const createNodePackFileSystem = (rootDir: string, options: NodePackFileSystemOptions = {}): PackFileSystem => {
  const root = resolve(rootDir);
  const uid = typeof process.getuid === 'function' ? process.getuid() : null;
  const abs = (path: string): string => {
    const full = resolve(root, path);
    if (full !== root && !full.startsWith(root + sep)) throw new Error(`path escapes the pack root: ${path}`);
    return full;
  };
  const owned = (s: Stats, full: string): void => {
    if (options.requireCurrentUser && uid !== null && s.uid !== uid) throw new Error(`pack entry is not owned by the current user: ${full}`);
  };

  /**
   * lstat of every component from the root's child down to `full`. Throws on a symbolic link in an ancestor (and in the leaf when
   * `allowLeafLink` is false) and on an ancestor that is not a directory. Returns the leaf's Stats, or null when it does not exist.
   */
  const inspect = async (full: string, allowLeafLink = false): Promise<Stats | null> => {
    const parts = full === root ? [] : full.slice(root.length + 1).split(sep);
    let current = root;
    let leaf: Stats | null = null;
    for (let i = 0; i < parts.length; i += 1) {
      current = join(current, parts[i]);
      try {
        leaf = await lstat(current);
      } catch (e) {
        if (isMissing(e)) return null;
        throw e;
      }
      owned(leaf, current);
      const last = i === parts.length - 1;
      if (leaf.isSymbolicLink() && !(last && allowLeafLink)) throw new Error(`symbolic links are not allowed in a pack: ${current}`);
      if (!last && !leaf.isDirectory()) return null;
    }
    return leaf;
  };
  const regularFile = async (path: string): Promise<string | null> => {
    const full = abs(path);
    const s = await inspect(full);
    if (s === null) return null;
    if (!s.isFile()) throw new Error(`not a regular file: ${path}`);
    return full;
  };

  const walk = async (dir: string, prefix: string): Promise<string[]> => {
    const out: string[] = [];
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      // Real directories are descended into; everything else (files, links, devices, sockets) is listed so nothing is invisible.
      if (entry.isDirectory() && !entry.isSymbolicLink()) out.push(...await walk(full, `${prefix}${entry.name}/`));
      else out.push(`${prefix}${entry.name}`);
    }
    return out;
  };

  return {
    async readText(path) {
      const full = await regularFile(path);
      if (full === null) return null;
      const handle = await open(full, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
      try {
        return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(await handle.readFile());
      } finally {
        await handle.close();
      }
    },
    async writeTextAtomic(path, text) {
      const target = abs(path);
      await inspect(dirname(target) === root ? root : dirname(target));
      await mkdir(dirname(target), { recursive: true });
      await inspect(dirname(target));
      const temp = `${target}.tmp-${randomBytes(6).toString('hex')}`;
      const handle = await open(temp, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, 0o600);
      try {
        await handle.writeFile(text, 'utf8');
        await handle.sync();
      } finally {
        await handle.close();
      }
      await rename(temp, target);
    },
    async listNames(path) {
      const full = abs(path);
      const s = await inspect(full);
      if (s === null && full !== root) return [];
      try {
        return await readdir(full);
      } catch (e) {
        if (isMissing(e)) return [];
        throw e;
      }
    },
    async listFilesRecursive(path) {
      const full = abs(path);
      const s = full === root ? await lstat(root).catch(() => null) : await inspect(full);
      if (s === null || !s.isDirectory()) return [];
      return walk(full, '');
    },
    async size(path) {
      const full = abs(path);
      let s: Stats | null;
      try {
        s = await inspect(full, true); // a leaf link is "not a file", not an error: the resource is simply missing
      } catch {
        return null;
      }
      return s !== null && s.isFile() ? s.size : null;
    },
    async *readChunks(path, chunkBytes) {
      const full = await regularFile(path);
      if (full === null) throw new Error(`no such file: ${path}`);
      const handle = await open(full, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
      try {
        const buffer = new Uint8Array(chunkBytes);
        for (;;) {
          const { bytesRead } = await handle.read(buffer, 0, chunkBytes, null);
          if (bytesRead === 0) return;
          yield buffer.subarray(0, bytesRead);
        }
      } finally {
        await handle.close();
      }
    },
    async renameDir(from, to) {
      const source = abs(from);
      const target = abs(to);
      const s = await inspect(source);
      if (s === null || !s.isDirectory()) throw new Error(`not a directory: ${from}`);
      if ((await inspect(target, true)) !== null) throw new Error(`destination exists: ${to}`);
      await mkdir(dirname(target), { recursive: true });
      await inspect(dirname(target));
      await rename(source, target);
    },
    async removeTree(path) {
      const full = abs(path);
      if ((await inspect(full, true)) === null) return;
      await rm(full, { recursive: true, force: true }); // rm unlinks a link itself and never follows one
    },
    async freeBytes() {
      const s = await statfs(root);
      return Number(s.bavail) * Number(s.bsize);
    },
  };
};

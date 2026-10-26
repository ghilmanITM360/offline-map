/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// The SDK's PackFileSystem port over Node's fs. It is the reference implementation of the port's contract (used by the pack tests and
// the pack compiler) and the model for a React Native adapter. Paths handed in are relative to `root` and may not leave it.
import { randomBytes } from 'node:crypto';
import { constants } from 'node:fs';
import { mkdir, open, readdir, readFile, rename, rm, stat, statfs } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import type { PackFileSystem } from '../../packages/offline-navigation/src/domain/pack';

const isMissing = (e: unknown): boolean => (e as NodeJS.ErrnoException)?.code === 'ENOENT' || (e as NodeJS.ErrnoException)?.code === 'ENOTDIR';

export const createNodePackFileSystem = (rootDir: string): PackFileSystem => {
  const root = resolve(rootDir);
  const abs = (path: string): string => {
    const full = resolve(root, path);
    if (full !== root && !full.startsWith(root + sep)) throw new Error(`path escapes the pack root: ${path}`);
    return full;
  };
  const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });

  const walk = async (dir: string, prefix: string): Promise<string[]> => {
    const out: string[] = [];
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) out.push(...await walk(join(dir, entry.name), `${prefix}${entry.name}/`));
      else if (entry.isFile()) out.push(`${prefix}${entry.name}`);
    }
    return out;
  };

  return {
    async readText(path) {
      try {
        return decoder.decode(await readFile(abs(path)));
      } catch (e) {
        if (isMissing(e)) return null;
        throw e;
      }
    },
    async writeTextAtomic(path, text) {
      const target = abs(path);
      await mkdir(dirname(target), { recursive: true });
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
      try {
        return await readdir(abs(path));
      } catch (e) {
        if (isMissing(e)) return [];
        throw e;
      }
    },
    async listFilesRecursive(path) {
      try {
        return await walk(abs(path), '');
      } catch (e) {
        if (isMissing(e)) return [];
        throw e;
      }
    },
    async size(path) {
      try {
        const s = await stat(abs(path));
        return s.isFile() ? s.size : null;
      } catch (e) {
        if (isMissing(e)) return null;
        throw e;
      }
    },
    async *readChunks(path, chunkBytes) {
      const handle = await open(abs(path), 'r');
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
      const target = abs(to);
      try {
        await stat(target);
        throw new Error(`destination exists: ${to}`);
      } catch (e) {
        if (!isMissing(e)) throw e;
      }
      await mkdir(dirname(target), { recursive: true });
      await rename(abs(from), target);
    },
    async removeTree(path) {
      await rm(abs(path), { recursive: true, force: true });
    },
    async freeBytes() {
      const s = await statfs(root);
      return Number(s.bavail) * Number(s.bsize);
    },
  };
};

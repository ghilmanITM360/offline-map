// Test double for the slice of expo-file-system 19.0.x the pack adapter uses, backed by a real directory and written to behave like
// the native modules where they are strict: moving onto an existing File fails, moving a Directory onto an existing Directory
// moves it inside, a destination's parent must exist, readBytes returns an empty array at end of file, and existence checks are
// type-aware. It can "kill the process" at the Nth mutating call (the call fails, and so does everything after it) and counts open handles.
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, readSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import type { ExpoFsApi } from './expoPackFileSystem';

export interface FakeExpoFs {
  api: ExpoFsApi;
  /** Mutating calls made so far (create, write, move, delete, mkdir). */
  mutations(): number;
  /** The Nth mutating call from now fails, as does everything after it, until a new fake is created over the same directory. */
  killAt(n: number): void;
  openHandles(): number;
  setFreeBytes(n: number): void;
}

const toPath = (uri: string): string => decodeURIComponent(uri.replace(/^file:\/\//, '')).replace(/\/+$/, '') || '/';

export const createFakeExpoFs = (): FakeExpoFs => {
  let count = 0;
  let killAt = Infinity;
  let dead = false;
  let handles = 0;
  let free = 10 * 1024 ** 3;
  const alive = (): void => { if (dead) throw new Error('process is dead'); };
  const mutate = (): void => {
    alive();
    count += 1;
    if (count >= killAt) { dead = true; throw new Error('killed'); }
  };
  const join2 = (parts: unknown[]): string => parts.map((p) => (typeof p === 'string' ? p : (p as { uri: string }).uri)).map((p, i) => (i === 0 ? p.replace(/\/+$/, '') : p.replace(/^\/+|\/+$/g, ''))).join('/');

  class Entry {
    uri: string;
    constructor(...parts: unknown[]) { this.uri = join2(parts); }
    protected get path(): string { return toPath(this.uri); }
  }

  class File extends Entry {
    get exists(): boolean { alive(); return existsSync(this.path) && statSync(this.path).isFile(); }
    get size(): number { alive(); return statSync(this.path).size; }
    async text(): Promise<string> {
      alive();
      return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(readFileSync(this.path));
    }
    create(options: { overwrite?: boolean } = {}): void {
      mutate();
      if (existsSync(this.path) && !options.overwrite) throw new Error('already exists');
      if (!existsSync(dirname(this.path))) throw new Error('parent missing');
      writeFileSync(this.path, '');
    }
    write(content: string): void {
      // A kill mid-write leaves half the bytes behind, like a non-atomic write interrupted by the OS.
      if (dead) throw new Error('process is dead');
      count += 1;
      if (count >= killAt) {
        dead = true;
        writeFileSync(this.path, Buffer.from(content).subarray(0, Math.floor(Buffer.byteLength(content) / 2)));
        throw new Error('killed');
      }
      writeFileSync(this.path, content);
    }
    delete(): void { mutate(); if (!existsSync(this.path)) throw new Error('does not exist'); rmSync(this.path); }
    move(destination: File | Directory): void {
      mutate();
      const to = destination instanceof Directory ? join(destination['path'], basename(this.path)) : destination['path'];
      if (existsSync(to)) throw new Error('destination exists');
      if (!existsSync(dirname(to))) throw new Error('destination parent missing');
      renameSync(this.path, to);
      this.uri = `file://${to}`;
    }
    open(): { readBytes(n: number): Uint8Array; close(): void } {
      alive();
      const fd = openSync(this.path, 'r');
      handles += 1;
      let open = true;
      let position = 0;
      return {
        readBytes: (n) => {
          if (!open) throw new Error('file handle is closed');
          const size = statSync(this.path).size;
          const buffer = new Uint8Array(Math.max(0, Math.min(n, size - position)));
          const read = buffer.length === 0 ? 0 : readSync(fd, buffer, 0, buffer.length, position);
          position += read;
          return buffer.subarray(0, read);
        },
        close: () => { if (open) { open = false; handles -= 1; closeSync(fd); } },
      };
    }
  }

  class Directory extends Entry {
    get exists(): boolean { alive(); return existsSync(this.path) && statSync(this.path).isDirectory(); }
    create(options: { intermediates?: boolean; idempotent?: boolean } = {}): void {
      mutate();
      if (existsSync(this.path)) { if (options.idempotent) return; throw new Error('already exists'); }
      if (!options.intermediates && !existsSync(dirname(this.path))) throw new Error('parent missing');
      mkdirSync(this.path, { recursive: true });
    }
    delete(): void { mutate(); if (!existsSync(this.path)) throw new Error('does not exist'); rmSync(this.path, { recursive: true }); }
    move(destination: File | Directory): void {
      mutate();
      if (destination instanceof File) throw new Error('cannot move a directory onto a file');
      const target = destination['path'];
      const to = existsSync(target) ? join(target, basename(this.path)) : target; // unix `mv`
      if (existsSync(to)) throw new Error('destination exists');
      if (!existsSync(dirname(to))) throw new Error('destination parent missing');
      renameSync(this.path, to);
      this.uri = `file://${to}`;
    }
    list(): Array<File | Directory> {
      alive();
      return readdirSync(this.path, { withFileTypes: true }).map((e) => (e.isDirectory() ? new Directory(this.uri, e.name) : new File(this.uri, e.name)));
    }
  }

  return {
    api: { File, Directory, Paths: { get availableDiskSpace() { return free; } } } as unknown as ExpoFsApi,
    mutations: () => count,
    killAt: (n) => { killAt = count + n; },
    openHandles: () => handles,
    setFreeBytes: (n) => { free = n; },
  };
};

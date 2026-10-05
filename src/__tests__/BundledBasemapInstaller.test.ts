import { installBundledBasemap, BasemapFs } from '../services/BundledBasemapService';

// In-memory fake FS. A file is its byte length plus the SHA-256 of its content, so "same size,
// wrong bytes" (#306) is expressible. Models copy/move/delete/list exactly as the installer uses them.
type FakeFile = { size: number; sha: string };
function makeFs(initial: Record<string, FakeFile> = {}, opts: { copyThrows?: boolean; hashThrowsFor?: string[] } = {}) {
  const files = new Map<string, FakeFile>(Object.entries(initial));
  const calls: string[] = [];
  const fs: BasemapFs = {
    ensureDir: (d) => void calls.push(`ensureDir ${d}`),
    sizeOf: (p) => files.get(p)?.size ?? null,
    sha256: async (p) => {
      calls.push(`sha256 ${p}`);
      if (opts.hashThrowsFor?.includes(p)) throw new Error('read failed');
      return files.get(p)?.sha ?? null;
    },
    copy: (from, to) => {
      calls.push(`copy ${from} -> ${to}`);
      files.set(to, { ...(files.get(from) ?? { size: 0, sha: '' }) });
      if (opts.copyThrows) throw new Error('disk full');
    },
    move: (from, to) => {
      calls.push(`move ${from} -> ${to}`);
      files.set(to, files.get(from)!);
      files.delete(from);
    },
    remove: (p) => void (calls.push(`remove ${p}`), files.delete(p)),
    list: (d) => [...files.keys()].filter((p) => p.startsWith(`${d}/`)),
  };
  return { fs, files, calls };
}

const EXPECTED = { sha256: 'a'.repeat(64), bytes: 1000 };
const GOOD: FakeFile = { size: 1000, sha: EXPECTED.sha256 };
const DIR = 'file:///data/map';
const TARGET = `${DIR}/ijtema-basemap-${'a'.repeat(12)}.pmtiles`;
const PARTIAL = `${TARGET}.partial`;
const SRC = 'file:///cache/asset.pmtiles';
const install = (fs: BasemapFs, resolveAssetUri: () => Promise<string> = async () => SRC) =>
  installBundledBasemap({ fs, dir: DIR, expected: EXPECTED, resolveAssetUri });

describe('installBundledBasemap', () => {
  it('copies the bundled asset into app-private storage when none is installed (no network)', async () => {
    const { fs, files } = makeFs({ [SRC]: GOOD });
    expect(await install(fs)).toEqual({ uri: TARGET, reused: false });
    expect(files.get(TARGET)).toEqual(GOOD);
    expect(files.has(PARTIAL)).toBe(false);
  });

  it('reuses an installed archive whose size and content hash both match, without touching the asset', async () => {
    const { fs, calls } = makeFs({ [TARGET]: GOOD });
    const resolveAssetUri = jest.fn(async () => SRC);
    expect(await install(fs, resolveAssetUri)).toEqual({ uri: TARGET, reused: true });
    expect(resolveAssetUri).not.toHaveBeenCalled();
    expect(calls.filter((c) => c.startsWith('copy'))).toHaveLength(0);
    expect(calls.filter((c) => c.startsWith('sha256'))).toHaveLength(1);
  });

  it('replaces a truncated archive instead of trusting it, without hashing the wrong-size file', async () => {
    const { fs, files, calls } = makeFs({ [TARGET]: { size: 400, sha: 'x' }, [SRC]: GOOD });
    expect((await install(fs)).reused).toBe(false);
    expect(files.get(TARGET)).toEqual(GOOD);
    expect(calls).not.toContain(`sha256 ${TARGET}`);
  });

  it('replaces a same-size archive with wrong bytes (the case a size check alone accepts)', async () => {
    const { fs, files } = makeFs({ [TARGET]: { size: 1000, sha: 'f'.repeat(64) }, [SRC]: GOOD });
    expect((await install(fs)).reused).toBe(false);
    expect(files.get(TARGET)).toEqual(GOOD);
  });

  it('treats an unreadable existing archive as invalid and reinstalls from the bundle', async () => {
    const { fs, files } = makeFs({ [TARGET]: GOOD, [SRC]: GOOD }, { hashThrowsFor: [TARGET] });
    expect((await install(fs)).reused).toBe(false);
    expect(files.get(TARGET)).toEqual(GOOD);
  });

  it('restarts from scratch when a stale .partial is left over from an interrupted copy', async () => {
    const { fs, files, calls } = makeFs({ [PARTIAL]: { size: 10, sha: 'old' }, [SRC]: GOOD });
    expect((await install(fs)).reused).toBe(false);
    expect(calls.indexOf(`remove ${PARTIAL}`)).toBeLessThan(calls.findIndex((c) => c.startsWith('copy')));
    expect(files.has(PARTIAL)).toBe(false);
  });

  it('also clears a stale .partial when the installed archive is already valid', async () => {
    const { fs, files } = makeFs({ [TARGET]: GOOD, [PARTIAL]: { size: 10, sha: 'old' } });
    expect((await install(fs)).reused).toBe(true);
    expect(files.has(PARTIAL)).toBe(false);
  });

  it('rejects a short copy and never exposes it as the archive', async () => {
    const { fs, files } = makeFs({ [SRC]: { size: 999, sha: EXPECTED.sha256 } });
    await expect(install(fs)).rejects.toThrow(/size/i);
    expect(files.has(TARGET)).toBe(false);
    expect(files.has(PARTIAL)).toBe(false);
  });

  it('rejects a full-size copy with wrong bytes before promotion', async () => {
    const { fs, files, calls } = makeFs({ [SRC]: { size: 1000, sha: 'e'.repeat(64) } });
    await expect(install(fs)).rejects.toThrow(/hash|checksum|sha/i);
    expect(files.has(TARGET)).toBe(false);
    expect(files.has(PARTIAL)).toBe(false);
    expect(calls.some((c) => c.startsWith('move'))).toBe(false);
  });

  it('cleans up and rejects when the copy itself fails (disk write error)', async () => {
    const { fs, files } = makeFs({ [SRC]: GOOD }, { copyThrows: true });
    await expect(install(fs)).rejects.toThrow(/disk full/);
    expect(files.has(TARGET)).toBe(false);
    expect(files.has(PARTIAL)).toBe(false);
  });

  it('heals on the next attempt after a failed install (no network, from the bundled asset)', async () => {
    const bad = makeFs({ [SRC]: { size: 1000, sha: 'e'.repeat(64) } });
    await expect(install(bad.fs)).rejects.toThrow();
    const healed = makeFs({ [TARGET]: { size: 1000, sha: 'f'.repeat(64) }, [SRC]: GOOD });
    expect((await install(healed.fs)).reused).toBe(false);
    expect(healed.files.get(TARGET)).toEqual(GOOD);
  });

  it('removes archives from older app versions after an install (version upgrade)', async () => {
    const stale = `${DIR}/ijtema-basemap-${'b'.repeat(12)}.pmtiles`;
    const { fs, files } = makeFs({ [stale]: { size: 5, sha: 'b' }, [SRC]: GOOD });
    await install(fs);
    expect(files.has(stale)).toBe(false);
    expect(files.has(TARGET)).toBe(true);
  });

  it('removes older-version archives even when the current one was already valid', async () => {
    const stale = `${DIR}/ijtema-basemap-${'b'.repeat(12)}.pmtiles`;
    const { fs, files } = makeFs({ [stale]: { size: 5, sha: 'b' }, [TARGET]: GOOD });
    expect((await install(fs)).reused).toBe(true);
    expect(files.has(stale)).toBe(false);
  });
});

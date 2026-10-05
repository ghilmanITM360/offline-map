import { installBundledBasemap, BasemapFs } from '../services/BundledBasemapService';

// In-memory fake FS: path -> byte length. Models copy/move/delete/list exactly as the installer uses them.
function makeFs(initial: Record<string, number> = {}) {
  const files = new Map(Object.entries(initial));
  const calls: string[] = [];
  const fs: BasemapFs = {
    ensureDir: (d) => void calls.push(`ensureDir ${d}`),
    sizeOf: (p) => files.get(p) ?? null,
    copy: (from, to) => {
      calls.push(`copy ${from} -> ${to}`);
      files.set(to, files.get(from) ?? 0);
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
const DIR = 'file:///data/map';
const TARGET = `${DIR}/ijtema-basemap-${'a'.repeat(12)}.pmtiles`;
const SRC = 'file:///cache/asset.pmtiles';

describe('installBundledBasemap', () => {
  it('copies the bundled asset into app-private storage on first launch (no network)', async () => {
    const { fs, files } = makeFs({ [SRC]: 1000 });
    const result = await installBundledBasemap({ fs, dir: DIR, expected: EXPECTED, resolveAssetUri: async () => SRC });
    expect(result).toEqual({ uri: TARGET, reused: false });
    expect(files.get(TARGET)).toBe(1000);
    expect(files.has(`${TARGET}.partial`)).toBe(false);
  });

  it('reuses an already-installed archive of the right size without touching the asset', async () => {
    const { fs, calls } = makeFs({ [TARGET]: 1000 });
    const resolveAssetUri = jest.fn(async () => SRC);
    const result = await installBundledBasemap({ fs, dir: DIR, expected: EXPECTED, resolveAssetUri });
    expect(result).toEqual({ uri: TARGET, reused: true });
    expect(resolveAssetUri).not.toHaveBeenCalled();
    expect(calls.filter((c) => c.startsWith('copy'))).toHaveLength(0);
  });

  it('replaces a truncated archive instead of trusting it', async () => {
    const { fs, files } = makeFs({ [TARGET]: 400, [SRC]: 1000 });
    const result = await installBundledBasemap({ fs, dir: DIR, expected: EXPECTED, resolveAssetUri: async () => SRC });
    expect(result.reused).toBe(false);
    expect(files.get(TARGET)).toBe(1000);
  });

  it('rejects a bad copy and never exposes a partial file as the archive', async () => {
    const { fs, files } = makeFs({ [SRC]: 999 });
    await expect(
      installBundledBasemap({ fs, dir: DIR, expected: EXPECTED, resolveAssetUri: async () => SRC }),
    ).rejects.toThrow(/size/i);
    expect(files.has(TARGET)).toBe(false);
    expect(files.has(`${TARGET}.partial`)).toBe(false);
  });

  it('removes archives from older app versions after a successful install', async () => {
    const stale = `${DIR}/ijtema-basemap-${'b'.repeat(12)}.pmtiles`;
    const { fs, files } = makeFs({ [stale]: 5, [SRC]: 1000 });
    await installBundledBasemap({ fs, dir: DIR, expected: EXPECTED, resolveAssetUri: async () => SRC });
    expect(files.has(stale)).toBe(false);
    expect(files.has(TARGET)).toBe(true);
  });
});

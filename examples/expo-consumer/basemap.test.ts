import { BASEMAP, installBasemap, type BasemapFs } from './basemap';

// An in-memory file system: path -> content. "Hashing" a file returns its content, so a corrupt file is simply different text.
function memoryFs(files: Record<string, string>) {
  const fs: BasemapFs & { files: Record<string, string> } = {
    files,
    ensureDir: () => undefined,
    sizeOf: (p) => (p in files ? files[p].length : null),
    sha256: async (p) => (p in files ? files[p] : null),
    copy: (from, to) => { files[to] = files[from]; },
    move: (from, to) => { files[to] = files[from]; delete files[from]; },
    remove: (p) => { delete files[p]; },
    list: (dir) => Object.keys(files).filter((p) => p.startsWith(`${dir}/`)),
  };
  return fs;
}
const GOOD = 'a'.repeat(8);
const expected = { sha256: GOOD, bytes: GOOD.length };
const dir = '/doc/map';
const target = `${dir}/basemap-${GOOD.slice(0, 12)}.pmtiles`;
const run = (fs: BasemapFs, resolveAssetUri = async () => '/bundle/asset') => installBasemap({ fs, dir, expected, resolveAssetUri });

it('pins the Karachi archive identity', () => {
  expect(BASEMAP).toMatchObject({ sha256: 'd5e6883d55d55b0fa9e3230ab92585fb25a8949551528ef4d176192384a28cc0', bytes: 434589 });
});

it('copies the bundled asset once and then reuses the verified file without touching the asset', async () => {
  const fs = memoryFs({ '/bundle/asset': GOOD });
  const resolve = jest.fn(async () => '/bundle/asset');
  expect(await run(fs, resolve)).toBe(target);
  expect(await run(fs, resolve)).toBe(target);
  expect(resolve).toHaveBeenCalledTimes(1);
  expect(Object.keys(fs.files).sort()).toEqual(['/bundle/asset', target]);
});

it('replaces a corrupt same-size archive and discards an interrupted partial copy', async () => {
  const fs = memoryFs({ '/bundle/asset': GOOD, [target]: 'b'.repeat(8), [`${target}.partial`]: 'half' });
  expect(await run(fs)).toBe(target);
  expect(fs.files[target]).toBe(GOOD);
  expect(fs.files[`${target}.partial`]).toBeUndefined();
});

it('never installs a bundled asset that does not match the manifest, and leaves nothing behind', async () => {
  const fs = memoryFs({ '/bundle/asset': 'c'.repeat(8) });
  await expect(run(fs)).rejects.toThrow('checksum mismatch');
  const short = memoryFs({ '/bundle/asset': 'cc' });
  await expect(run(short)).rejects.toThrow('size mismatch');
  expect(Object.keys(fs.files)).toEqual(['/bundle/asset']);
  expect(Object.keys(short.files)).toEqual(['/bundle/asset']);
});

it('removes archives of an older version once the current one is in place', async () => {
  const old = `${dir}/basemap-oldversion00.pmtiles`;
  const fs = memoryFs({ '/bundle/asset': GOOD, [old]: 'old' });
  await run(fs);
  expect(fs.files[old]).toBeUndefined();
});

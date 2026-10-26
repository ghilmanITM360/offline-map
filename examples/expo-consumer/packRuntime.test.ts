import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createExpoPackFileSystem } from './expoPackFileSystem';
import { createFakeExpoFs } from './fakeExpoFs';
import { startPacks } from './packRuntime';
import { buildPack as build, directoryCopier } from './testPacks';

// Two small venues, built the way the real compiler lays them out, bundled into a fake "app" directory and started through the
// real PackManager over the Expo adapter's test double.
let work: string;
let app: string;
let device: string;
beforeEach(() => {
  work = mkdtempSync(join(tmpdir(), 'pack-runtime-'));
  app = join(work, 'app');
  device = join(work, 'device');
  mkdirSync(app);
  mkdirSync(device);
});
afterEach(() => { rmSync(work, { recursive: true, force: true }); });

const buildPack = (venueId: string, version?: string, over?: { graph?: unknown }) => build(app, venueId, version, over);
const copier = (failAfter = Infinity) => directoryCopier(app, device, failAfter);

const start = async (packs: Array<{ id: string; sha: string; files: string[] }>, c = copier()) => {
  const fake = createFakeExpoFs();
  const fs = createExpoPackFileSystem(`file://${device}`, fake.api);
  const runtime = await startPacks({
    fs, copier: c, sdkVersion: '0.1.0', platformCapabilities: ['pmtiles-local-read'],
    sources: packs.map((p) => ({ id: p.id, manifestSha256: p.sha, files: p.files })),
  });
  return { runtime, fake, fs };
};

describe('bundled packs at startup', () => {
  it('copies each bundled pack once, verifies it, and opens two isolated venues from their own packs', async () => {
    const a = await buildPack('venue-a');
    const b = await buildPack('venue-b');
    const { runtime, fake } = await start([a, b]);
    expect(runtime.install.report).toEqual([expect.objectContaining({ id: a.id, status: 'installed' }), expect.objectContaining({ id: b.id, status: 'installed' })]);
    expect(runtime.venueIds()).toEqual(['venue-a', 'venue-b']);
    const opened = await runtime.open('venue-a');
    const other = await runtime.open('venue-b');
    if (!opened.ok || !other.ok) throw new Error('venues should open');
    expect(opened.venue.source.venueId).toBe('venue-a');
    expect(other.venue.source.venueId).toBe('venue-b');
    expect(opened.venue.names.get('p1')).toBe('venue-a one');
    expect(other.venue.names.get('p1')).toBe('venue-b one');
    expect(opened.venue.archivePath).toBe('bundled/venue-a@1.0.0/map/ijtema-basemap.pmtiles');
    expect(opened.venue.origin).toBe('bundled');
    expect(opened.venue.source.graph.getNode('a')).toBeDefined();
    opened.venue.release();
    other.venue.release();
    expect(fake.openHandles()).toBe(0);
  });

  it('a second start finds the packs present and copies nothing', async () => {
    const a = await buildPack('venue-a');
    await start([a]);
    const c = copier();
    const { runtime } = await start([a], c);
    expect(runtime.install.report).toEqual([{ id: a.id, status: 'present' }]);
    expect(c.copies()).toBe(0);
  });

  it('a copy that fails partway is never used, leaves no half pack, and the next start completes it', async () => {
    const a = await buildPack('venue-a');
    const first = await start([a], copier(3));
    expect(first.runtime.install.report).toEqual([expect.objectContaining({ id: a.id, status: 'failed' })]);
    expect(await first.runtime.open('venue-a')).toMatchObject({ ok: false });
    expect(existsSync(join(device, 'bundled', a.id))).toBe(false);
    expect(existsSync(join(device, 'bundled-staging'))).toBe(false);
    const second = await start([a]);
    expect(second.runtime.install.report).toEqual([expect.objectContaining({ status: 'installed', repaired: false })]);
    expect((await second.runtime.open('venue-a')).ok).toBe(true);
  });

  it('a corrupted or missing resource on the device is repaired from the packaged copy at the next start', async () => {
    const a = await buildPack('venue-a');
    await start([a]);
    const graph = join(device, 'bundled', a.id, 'data/routing-graph.json');
    writeFileSync(graph, readFileSync(graph, 'utf8').replace('"a"', '"z"'));
    const afterCorrupt = await start([a]);
    expect(afterCorrupt.runtime.install.report).toEqual([expect.objectContaining({ status: 'installed', repaired: true })]);
    expect(readFileSync(graph, 'utf8')).toBe(readFileSync(join(app, a.id, 'data/routing-graph.json'), 'utf8'));
    rmSync(join(device, 'bundled', a.id, 'map/ijtema-basemap.pmtiles'));
    const afterMissing = await start([a]);
    expect(afterMissing.runtime.install.report).toEqual([expect.objectContaining({ status: 'installed', repaired: true })]);
    expect((await afterMissing.runtime.open('venue-a')).ok).toBe(true);
  });

  it('refuses a packaged manifest that does not match the digest pinned in the build', async () => {
    const a = await buildPack('venue-a');
    const { runtime } = await start([{ ...a, sha: 'f'.repeat(64) }]);
    expect(runtime.install.report).toEqual([expect.objectContaining({ status: 'failed', error: expect.objectContaining({ code: 'asset-digest-mismatch' }) })]);
    expect(runtime.venueIds()).toEqual([]);
    expect(await runtime.open('venue-a')).toMatchObject({ ok: false });
  });

  it('an invalid pack never becomes active: data that fails validation does not open', async () => {
    const bad = await buildPack('venue-a', '1.0.0', { graph: { schemaVersion: 1, venueId: 'venue-a', dataVersion: 'd', nodes: [{ id: 'a', lat: 1, lng: 1 }], edges: [{ from: 'a', to: 'ghost', distanceM: 5 }] } });
    const { runtime } = await start([bad]);
    const result = await runtime.open('venue-a');
    expect(result).toMatchObject({ ok: false, error: { code: 'resource-invalid' } });
  });

  it('removes bundled directories the current build no longer ships', async () => {
    const a = await buildPack('venue-a');
    const b = await buildPack('venue-b');
    await start([a, b]);
    await start([a]);
    expect(readdirSync(join(device, 'bundled'))).toEqual([a.id]);
  });

  it('refuses imported or remote packs: nothing can be installed without a signature and no verifier is configured', async () => {
    const a = await buildPack('venue-a');
    const { runtime } = await start([a]);
    const newer = await buildPack('venue-a', '1.1.0'); // a newer, perfectly consistent pack that nobody signed
    const stagingId = 'import1';
    mkdirSync(join(device, 'packs/staging', stagingId), { recursive: true });
    cpSync(join(app, newer.id), join(device, 'packs/staging', stagingId), { recursive: true });
    const result = await runtime.manager.installStaged(stagingId, { venueId: 'venue-a', signature: 'anything' });
    expect(result).toMatchObject({ ok: false, error: { code: 'signature-required' } });
    expect((await runtime.manager.resolveActive('venue-a'))?.manifest.packVersion).toBe('1.0.0');
  });
});

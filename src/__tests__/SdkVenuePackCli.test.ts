/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// The client venue tool on real folders: the shipped example venue compiles to a verified, reproducible pack, every invalid input is
// refused with a code and a hint (before any output is claimed where possible), and existing output is never touched.
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { main } from '../../scripts/sdk-pack/cli';

jest.setTimeout(60_000);
const ROOT = resolve(__dirname, '../..');
const sha = (p: string) => createHash('sha256').update(readFileSync(p)).digest('hex');

let work: string;
beforeEach(() => {
  work = mkdtempSync(join(tmpdir(), 'venue-cli-'));
  cpSync(join(ROOT, 'examples/synthetic-venue'), join(work, 'venue'), { recursive: true });
  mkdirSync(join(work, 'venue/input/map'));
  cpSync(join(ROOT, 'assets/offline-map/ijtema-basemap.pmtiles'), join(work, 'venue/input/map/basemap.pmtiles'));
});
afterEach(() => { rmSync(work, { recursive: true, force: true }); });

const run = async (...argv: string[]) => {
  const out: string[] = [], err: string[] = [];
  const code = await main(argv, { out: (l) => out.push(l), err: (l) => err.push(l) });
  return { code, out: out.join('\n'), err: err.join('\n') };
};
const compile = (out: string, extra: string[] = []) => run('compile', '--spec', join(work, 'venue/pack.spec.json'), '--input', join(work, 'venue/input'), '--out', out, ...extra);
const edit = (path: string, fn: (doc: any) => void) => {
  const file = join(work, 'venue/input', path);
  const doc = JSON.parse(readFileSync(file, 'utf8'));
  fn(doc);
  writeFileSync(file, JSON.stringify(doc));
};

describe('venue-pack compile', () => {
  it('turns the synthetic example into a verified pack with a pin and checksums, byte-identically twice', async () => {
    const first = await compile(join(work, 'out1'));
    expect(first).toMatchObject({ code: 0, err: '' });
    const second = await compile(join(work, 'out2'));
    expect(second.code).toBe(0);
    const manifest = join(work, 'out1/pack/pack.manifest.json');
    expect(sha(manifest)).toBe(sha(join(work, 'out2/pack/pack.manifest.json')));
    const pin = JSON.parse(readFileSync(join(work, 'out1/pack.pin.json'), 'utf8'));
    expect(pin).toMatchObject({ packId: 'example-courtyard@1.0.0', manifestSha256: sha(manifest) });
    expect(first.out).toContain(sha(manifest));
    for (const line of readFileSync(join(work, 'out1/SHA256SUMS.txt'), 'utf8').trim().split('\n')) {
      const [hash, path] = line.split('  ');
      expect(sha(join(work, 'out1', path))).toBe(hash);
    }
    expect(readdirSync(join(work, 'out1')).sort()).toEqual(['SHA256SUMS.txt', 'pack', 'pack.pin.json']);
    expect((await run('verify', join(work, 'out1/pack'), '--pin', pin.manifestSha256)).code).toBe(0);
  });

  it('refuses an existing output folder and leaves it untouched', async () => {
    mkdirSync(join(work, 'precious'));
    writeFileSync(join(work, 'precious/notes.txt'), 'keep');
    const r = await compile(join(work, 'precious'));
    expect(r.code).toBe(1);
    expect(r.err).toMatch(/already exists/);
    expect(readdirSync(join(work, 'precious'))).toEqual(['notes.txt']);
  });

  it.each([
    ['a spec field is missing', () => { const f = join(work, 'venue/pack.spec.json'); const d = JSON.parse(readFileSync(f, 'utf8')); delete d.bounds; writeFileSync(f, JSON.stringify(d)); }, /spec-invalid.*bounds/],
    ['a file is not declared', () => writeFileSync(join(work, 'venue/input/extra.txt'), 'x'), /resource-undeclared.*extra\.txt/],
    ['a declared file is missing', () => rmSync(join(work, 'venue/input/PROVENANCE.json')), /resource-missing.*PROVENANCE\.json/],
    ['the input holds a symbolic link', () => symlinkSync('/etc/hosts', join(work, 'venue/input/link.txt')), /symlink-refused.*link\.txt/],
    ['an edge ends at an unknown node', () => edit('data/routing-graph.json', (d) => { d.edges[0].to = 'nowhere'; }), /venue-data-invalid.*unknown node 'nowhere'/],
    ['a node id repeats', () => edit('data/routing-graph.json', (d) => { d.nodes[1].id = d.nodes[0].id; }), /venue-data-invalid.*duplicate node id/],
    ['a place references an unknown node', () => edit('data/place-directory.json', (d) => { d.places[0].nodeIds = ['ghost']; }), /venue-data-invalid.*unknown node 'ghost'/],
    ['a distance is not positive', () => edit('data/routing-graph.json', (d) => { d.edges[0].distanceM = 0; }), /venue-data-invalid.*distanceM/],
    ['a coordinate is out of range', () => edit('data/routing-graph.json', (d) => { d.nodes[0].lat = 123; }), /venue-data-invalid.*lat/],
    ['the place directory names another venue', () => edit('data/place-directory.json', (d) => { d.venueId = 'other'; }), /venue-data-invalid.*different venues/],
    ['the venue has no places', () => edit('data/place-directory.json', (d) => { d.places = []; }), /venue-data-invalid.*at least one place/],
  ])('refuses the input when %s, writes nothing, and says how to fix it', async (_, damage, message) => {
    damage();
    const r = await compile(join(work, 'out'));
    expect(r.code).toBe(1);
    expect(r.err).toMatch(message);
    expect(existsSync(join(work, 'out'))).toBe(false);
  });

  it('names a pack-level conflict that only the compiler can see (venue id in a data file) with its hint', async () => {
    edit('data/gate-metadata.json', (d) => { d.venueId = 'other'; });
    const r = await compile(join(work, 'out'));
    expect(r.code).toBe(1);
    expect(r.err).toMatch(/venue-conflict.*gate-metadata\.json/);
    expect(r.err).toMatch(/hint: Every data file must carry the same "venueId"/);
  });

  it('warns about a place no route reaches, and --strict turns the warning into a refusal', async () => {
    edit('data/routing-graph.json', (d) => { d.nodes.push({ id: 'island', lat: 24.9715, lng: 67.005 }); });
    edit('data/place-directory.json', (d) => { d.places.push({ id: 'island', kind: 'room', nodeIds: ['island'] }); });
    const lenient = await compile(join(work, 'out'));
    expect(lenient.code).toBe(0);
    expect(lenient.err).toMatch(/warning: place 'island' cannot be reached/);
    const strict = await compile(join(work, 'out-strict'), ['--strict']);
    expect(strict.code).toBe(1);
    expect(existsSync(join(work, 'out-strict'))).toBe(false);
  });

  it('warns about an edge shorter than the straight line, which would make the router pick longer routes', async () => {
    edit('data/routing-graph.json', (d) => { d.edges[0].distanceM = 1; });
    const r = await compile(join(work, 'out'));
    expect(r.code).toBe(0);
    expect(r.err).toMatch(/shorter than the straight line/);
  });
});

describe('venue-pack verify and app-assets', () => {
  it('detects a changed file, a missing file and a wrong pin', async () => {
    await compile(join(work, 'out'));
    const pack = join(work, 'out/pack');
    expect((await run('verify', pack, '--pin', '0'.repeat(64))).err).toMatch(/pin-mismatch/);
    writeFileSync(join(pack, 'data/place-directory.json'), '{"tampered":true}');
    const changed = await run('verify', pack);
    expect(changed.code).toBe(1);
    expect(changed.err).toMatch(/place-directory\.json/);
    rmSync(join(pack, 'data/place-directory.json'));
    expect((await run('verify', pack)).code).toBe(1);
  });

  it('copies a verified pack into an app as packfile assets, prints the table entry, and never overwrites', async () => {
    await compile(join(work, 'out'));
    const app = join(work, 'app');
    mkdirSync(app);
    writeFileSync(join(app, 'package.json'), '{}');
    const r = await run('app-assets', '--pack', join(work, 'out/pack'), '--app', app);
    expect(r.code).toBe(0);
    const pin = JSON.parse(readFileSync(join(work, 'out/pack.pin.json'), 'utf8'));
    expect(r.out).toContain(`manifestSha256: '${pin.manifestSha256}'`);
    expect(r.out).toContain("'data/routing-graph.json': require('./assets/packs/example-courtyard-1.0.0/data__routing-graph.json.packfile')");
    expect(sha(join(app, 'assets/packs/example-courtyard-1.0.0/pack.manifest.json.packfile'))).toBe(pin.manifestSha256);
    const again = await run('app-assets', '--pack', join(work, 'out/pack'), '--app', app);
    expect(again.code).toBe(1);
    expect(again.err).toMatch(/output-exists/);
  });

  it('refuses to copy a pack that does not verify', async () => {
    await compile(join(work, 'out'));
    writeFileSync(join(work, 'out/pack/data/localization.json'), '{}');
    mkdirSync(join(work, 'app'));
    writeFileSync(join(work, 'app/package.json'), '{}');
    expect((await run('app-assets', '--pack', join(work, 'out/pack'), '--app', join(work, 'app'))).code).toBe(1);
    expect(existsSync(join(work, 'app/assets'))).toBe(false);
  });

  it('prints usage with exit 2 for an unknown command or missing flags', async () => {
    expect((await run('frobnicate')).code).toBe(2);
    expect((await run('compile')).code).toBe(2);
    expect((await run('compile')).err).toMatch(/usage/);
  });
});

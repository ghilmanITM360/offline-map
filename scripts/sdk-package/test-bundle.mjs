// Verify the actual delivery archive, never the repository consumer driver's augmented copy.
//   node scripts/sdk-package/test-bundle.mjs <delivery.tgz> <fresh unpack directory>
// The archive is read by the raw TAR parser (tar.mjs): host `tar -t` hides metadata entries, which is how the AppleDouble files went unnoticed.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { auditEntries, extractEntries, readTarGz, sha256Hex } from './tar.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
assert.ok(process.argv[2] && process.argv[3], 'usage: test-bundle.mjs <delivery.tgz> <fresh unpack directory>');
const archive = resolve(process.argv[2]);
const out = resolve(process.argv[3]);
assert.ok(!existsSync(out), 'unpack into a fresh directory');
assert.ok(!out.startsWith(root + sep) && out !== root, 'unpack outside the checkout');

// 1. Raw archive audit: regular files only, no metadata, no unsafe path, no duplicate, and exactly the files the manifest declares.
const entries = readTarGz(archive);
const deliveryId = entries[0].path.split('/')[0];
assert.match(deliveryId, /^delivery-[0-9a-f]{7}(-external)?$/);
assert.ok(entries.every((e) => e.path.startsWith(`${deliveryId}/`)), 'one delivery root expected');
const manifestEntry = entries.find((e) => e.path === `${deliveryId}/manifest.json`);
assert.ok(manifestEntry, 'manifest.json is part of the archive');
const manifest = JSON.parse(Buffer.from(manifestEntry.data).toString('utf8'));
assert.equal(manifest.deliveryId, deliveryId);
const declared = new Set([...manifest.files.map((f) => `${deliveryId}/${f.path}`), ...['manifest.json', 'CHECKSUMS.txt', 'README.txt'].map((f) => `${deliveryId}/${f}`)]);
assert.deepEqual(auditEntries(entries, declared), [], 'the delivery archive must hold exactly the declared files');
for (const e of entries) assert.equal(e.mode, 0o644, `${e.path}: normalized mode`);
for (const f of manifest.files) {
  const e = entries.find((x) => x.path === `${deliveryId}/${f.path}`);
  assert.equal(e.size, f.bytes, `${f.path}: size`);
  assert.equal(sha256Hex(e.data), f.sha256, `${f.path}: sha-256`);
}
mkdirSync(out, { recursive: true });
extractEntries(entries, out);
assert.deepEqual(readdirSync(out), [deliveryId]);
const delivery = join(out, deliveryId);
const consumer = join(delivery, 'examples/expo-consumer');
const sha = (p) => sha256Hex(readFileSync(p));

// 2. The example app's assets, pinned packs and packaged files.
const table = readFileSync(join(consumer, 'bundledPackTable.ts'), 'utf8');
const assets = [...table.matchAll(/require\(['"](\.\/assets\/[^'"]+)['"]\)/g)].map((m) => m[1]);
const profile = manifest.profile ?? 'internal';
assert.equal(profile, deliveryId.endsWith('-external') ? 'external' : 'internal');
// 8 files per preset pack (everything but the shared basemap archive): Karachi 1.1.0 and the synthetic venue 1.1.0, or the synthetic one alone.
const packfiles = profile === 'internal' ? 16 : 8;
assert.equal(assets.filter((p) => p.endsWith('.packfile')).length, packfiles);
const missing = assets.filter((p) => !existsSync(resolve(consumer, p)));
assert.deepEqual(missing, [], `delivery omits local assets: ${missing.join(', ')}`);
for (const venue of ['karachi-ijtema', 'synthetic-demo-venue'].filter((v) => profile === 'internal' || v === 'synthetic-demo-venue')) {
  const pin = JSON.parse(readFileSync(join(root, 'scripts/sdk-pack', `${venue}-1.1.0.pin.json`), 'utf8'));
  const manifestFile = join(consumer, 'assets/packs', venue, 'pack.manifest.json.packfile');
  assert.equal(sha(manifestFile), pin.manifestSha256, `${venue} manifest pin`);
  assert.ok(table.includes(`manifestSha256: '${pin.manifestSha256}'`));
  for (const resource of pin.resources) {
    const path = resource.path === 'map/ijtema-basemap.pmtiles'
      ? join(consumer, 'assets/karachi-basemap.pmtiles')
      : join(consumer, 'assets/packs', venue, `${resource.path.replaceAll('/', '__')}.packfile`);
    assert.equal(statSync(path).size, resource.bytes, resource.path);
    assert.equal(sha(path), resource.sha256, resource.path);
  }
}
if (profile === 'external') {
  // Nothing of the Karachi survey may be in an external delivery: no pack folder, no table reference, no pin, no marker in any text file.
  assert.ok(!existsSync(join(consumer, 'assets/packs/karachi-ijtema')), 'the external delivery must not carry the Karachi pack');
  assert.ok(!table.includes('karachi-ijtema'), 'the external pack table must not name the Karachi venue');
  for (const e of manifest.files.filter((f) => /\.(json|packfile|ts|tsx|md|txt)$/.test(f.path))) {
    const text = readFileSync(join(delivery, e.path), 'utf8');
    assert.ok(!/GATE_1[0-9]|B12_C1|karachi-ijtema@/.test(text) || /^docs\//.test(e.path) || /\.(test)\.tsx?$/.test(e.path), `${e.path} carries a Karachi venue marker`);
  }
}
const checksums = readFileSync(join(delivery, 'CHECKSUMS.txt'), 'utf8');
for (const entry of manifest.files) assert.ok(checksums.split('\n').includes(`${entry.sha256}  ${entry.path}`), entry.path);
for (const asset of assets) assert.ok(manifest.files.some((e) => e.path === `examples/expo-consumer/${relative(consumer, resolve(consumer, asset))}`), `unlisted asset ${asset}`);
for (const required of [manifest.tarball.file, manifest.iosPrecisionTarball.file, 'tools/venue-pack/venue-pack.cjs', 'examples/synthetic-venue/pack.spec.json', 'examples/synthetic-venue/input/map/basemap.pmtiles',
  'docs/QUICK_START.md', 'docs/VENUE_PACK_TOOL.md', 'docs/TRANSLATION_REVIEW.md', 'docs/COMPATIBILITY_MATRIX.md', 'examples/expo-consumer/copy/translationTable.ts', 'examples/expo-consumer/ios-precision.tgz']) {
  assert.ok(manifest.files.some((f) => f.path === required), `delivery lacks ${required}`);
}
assert.ok(!existsSync(join(consumer, 'modules')) && !existsSync(join(consumer, 'plugins')), 'no hand-copied native modules or plugins in the example app');
// The start-here documents must not point anywhere that does not exist in the delivery.
for (const doc of ['README.md', 'QUICK_START.md', 'VENUE_PACK_TOOL.md', 'INTEGRATION_GUIDES.md', 'TRANSLATION_REVIEW.md', 'COMPATIBILITY_MATRIX.md']) {
  const text = readFileSync(join(delivery, 'docs', doc), 'utf8');
  for (const [, target] of text.matchAll(/\]\(([^)#\s]+)(?:#[^)]*)?\)/g)) {
    if (/^[a-z]+:/.test(target)) continue;
    assert.ok(existsSync(resolve(delivery, 'docs', target)), `docs/${doc} links to ${target}, which the delivery does not contain`);
  }
}

// 3. The packaged SDK exposes the plugin and the Metro helper next to the compiled entrypoints.
const sdkTar = readTarGz(join(delivery, manifest.tarball.file));
const sdkManifest = JSON.parse(Buffer.from(sdkTar.find((e) => e.path === 'package/package.json').data).toString('utf8'));
assert.deepEqual(Object.keys(sdkManifest.exports), ['.', './session', './ui', './maplibre', './app.plugin.js', './metro', './package.json']);
assert.equal(sha(join(delivery, manifest.tarball.file)), manifest.tarball.sha256);

// 4. The venue tool, run from the unpacked delivery with plain Node and nothing else: it compiles the shipped example into a verified pack.
const tool = join(delivery, 'tools/venue-pack/venue-pack.cjs');
const venue = (...args) => spawnSync(process.execPath, [tool, ...args], { encoding: 'utf8', env: { PATH: process.env.PATH }, cwd: out });
const example = join(delivery, 'examples/synthetic-venue');
const built = join(out, 'venue-build');
const compiled = venue('compile', '--spec', join(example, 'pack.spec.json'), '--input', join(example, 'input'), '--out', join(built, 'one'));
assert.equal(compiled.status, 0, compiled.stderr + compiled.stdout);
const again = venue('compile', '--spec', join(example, 'pack.spec.json'), '--input', join(example, 'input'), '--out', join(built, 'two'));
assert.equal(again.status, 0, again.stderr);
assert.equal(sha(join(built, 'one/pack/pack.manifest.json')), sha(join(built, 'two/pack/pack.manifest.json')), 'the tool must compile deterministically');
const pin = JSON.parse(readFileSync(join(built, 'one/pack.pin.json'), 'utf8'));
assert.equal(pin.manifestSha256, sha(join(built, 'one/pack/pack.manifest.json')));
const checked = venue('verify', join(built, 'one/pack'), '--pin', pin.manifestSha256);
assert.equal(checked.status, 0, checked.stderr);
const bad = venue('compile', '--spec', join(example, 'pack.spec.json'), '--input', join(example, 'input'), '--out', join(built, 'one'));
assert.equal(bad.status, 1);
assert.match(bad.stderr, /already exists/);
writeFileSync(join(built, 'one/pack/data/place-directory.json'), '{}');
assert.equal(venue('verify', join(built, 'one/pack')).status, 1, 'a changed pack file must fail verification');

console.log(JSON.stringify({ deliveryId, profile, entries: entries.length, assets: assets.length, packfiles, checkedFiles: manifest.files.length, venueToolManifestSha256: pin.manifestSha256, result: 'PASS' }));

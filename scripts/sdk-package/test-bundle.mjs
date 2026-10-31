// Verify the actual delivery archive, never the repository consumer driver's augmented copy.
// node scripts/sdk-package/test-bundle.mjs <delivery.tgz> <fresh unpack directory>
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
assert.ok(process.argv[2] && process.argv[3], 'usage: test-bundle.mjs <delivery.tgz> <fresh unpack directory>');
const archive = resolve(process.argv[2]);
const out = resolve(process.argv[3]);
assert.ok(!existsSync(out), 'unpack into a fresh directory');
assert.ok(!out.startsWith(root + sep) && out !== root, 'unpack outside the checkout');
const tar = (args) => {
  const result = spawnSync('tar', args, { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim().split('\n').filter(Boolean);
};
const entries = tar(['-tzf', archive]);
assert.ok(entries.every((p) => !p.startsWith('/') && !p.split('/').includes('..')), 'unsafe archive path');
mkdirSync(out, { recursive: true });
tar(['-xzf', archive, '-C', out]);
const dirs = readdirSync(out).filter((p) => statSync(join(out, p)).isDirectory());
assert.equal(dirs.length, 1, 'one delivery root expected');
const delivery = join(out, dirs[0]);
const consumer = join(delivery, 'examples/expo-consumer');
const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');
const table = readFileSync(join(consumer, 'bundledPackTable.ts'), 'utf8');
const assets = [...table.matchAll(/require\(['"](\.\/assets\/[^'"]+)['"]\)/g)].map((m) => m[1]);
assert.equal(assets.filter((p) => p.endsWith('.packfile')).length, 12);
const missing = assets.filter((p) => !existsSync(resolve(consumer, p)));
assert.deepEqual(missing, [], `delivery omits local assets: ${missing.join(', ')}`);
for (const venue of ['karachi-ijtema', 'synthetic-demo-venue']) {
  const pin = JSON.parse(readFileSync(join(root, 'scripts/sdk-pack', `${venue}.pin.json`), 'utf8'));
  const manifest = join(consumer, 'assets/packs', venue, 'pack.manifest.json.packfile');
  assert.equal(sha(manifest), pin.manifestSha256, `${venue} manifest pin`);
  assert.ok(table.includes(`manifestSha256: '${pin.manifestSha256}'`));
  for (const resource of pin.resources) {
    const path = resource.path === 'map/ijtema-basemap.pmtiles'
      ? join(consumer, 'assets/karachi-basemap.pmtiles')
      : join(consumer, 'assets/packs', venue, `${resource.path.replaceAll('/', '__')}.packfile`);
    assert.equal(statSync(path).size, resource.bytes, resource.path);
    assert.equal(sha(path), resource.sha256, resource.path);
  }
}
const manifest = JSON.parse(readFileSync(join(delivery, 'manifest.json'), 'utf8'));
const checksums = readFileSync(join(delivery, 'CHECKSUMS.txt'), 'utf8');
for (const entry of manifest.files) {
  assert.equal(statSync(join(delivery, entry.path)).size, entry.bytes, entry.path);
  assert.equal(sha(join(delivery, entry.path)), entry.sha256, entry.path);
  assert.ok(checksums.split('\n').includes(`${entry.sha256}  ${entry.path}`), entry.path);
}
for (const asset of assets) assert.ok(manifest.files.some((e) => e.path === `examples/expo-consumer/${relative(consumer, resolve(consumer, asset))}`), `unlisted asset ${asset}`);
assert.ok(entries.every((p) => !p.split('/').some((s) => s.startsWith('._') || s === '__MACOSX')), 'AppleDouble metadata must not ship');
console.log(JSON.stringify({ consumer, assets: assets.length, packfiles: 12, checkedFiles: manifest.files.length, result: 'PASS' }));

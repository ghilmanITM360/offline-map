// Assemble the private release-candidate delivery bundle OUTSIDE the repository: the packed tarball, the client documents, the
// working consumer app sources (with the sample basemap), checksums and a manifest. Nothing is published or sent anywhere.
//   node scripts/sdk-package/bundle.mjs <fresh directory outside the repository>
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inventoryFromLock, renderInventory } from './inventory.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
assert.ok(process.argv[2], 'usage: node scripts/sdk-package/bundle.mjs <fresh outside-repository directory>');
const out = resolve(process.argv[2]);
const rel = relative(root, out);
assert.ok(rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel), 'output must be outside the repository');
assert.ok(!existsSync(out) || readdirSync(out).length === 0, 'use a fresh, empty bundle directory');
mkdirSync(out, { recursive: true });

const run = (cmd, args, cwd = root) => {
  const r = spawnSync(cmd, args, { cwd, encoding: 'utf8', env: { PATH: process.env.PATH, HOME: process.env.HOME, CI: '1' }, maxBuffer: 64 * 1024 * 1024 });
  assert.equal(r.status, 0, `${cmd} ${args.join(' ')}\n${r.stdout}\n${r.stderr}`);
  return r.stdout;
};
const sha256 = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');
const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));

// 1. The artifact: the same reproducible tarball test:sdk-package proves (packed twice, byte-identical).
const scratch = mkdtempSync(join(out, '.scratch-'));
const first = run(process.execPath, [join(root, 'scripts/sdk-package/pack.mjs'), join(scratch, 'a')]).trim().split('\n').pop();
const second = run(process.execPath, [join(root, 'scripts/sdk-package/pack.mjs'), join(scratch, 'b')]).trim().split('\n').pop();
assert.equal(sha256(first), sha256(second), 'the tarball must be byte-reproducible');
const tarName = first.split(sep).pop();
const tarSha = sha256(first);
mkdirSync(join(out, 'package'), { recursive: true });
cpSync(first, join(out, 'package', tarName));

// 2. The archive allowlist: only package.json, the licence text and compiled dist/ JavaScript and declarations.
const listing = run('tar', ['-tzf', first]).split('\n').filter(Boolean);
for (const entry of listing) assert.ok(/^package\/(package\.json|LICENSE|dist\/.*\.(js|d\.ts))$/.test(entry), `unexpected archive entry: ${entry}`);

// 3. Independent reinstall of the artifact alone into an empty project: the headless entrypoint must load in plain Node.
const probe = join(scratch, 'probe');
mkdirSync(probe);
writeFileSync(join(probe, 'package.json'), JSON.stringify({ name: 'probe', version: '0.0.0', private: true }));
run('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', '--no-package-lock', first], probe);
const loaded = run(process.execPath, ['-e', "const m=require('@muslim-ummah/offline-navigation'); console.log(typeof m.createNavigationController, typeof m.createPackManager)"], probe).trim();
assert.equal(loaded, 'function function');

// 4. Documents and the working example (without installs, builds or generated native projects).
mkdirSync(join(out, 'docs'), { recursive: true });
for (const f of readdirSync(join(root, 'docs/sdk/client'))) cpSync(join(root, 'docs/sdk/client', f), join(out, 'docs', f));
cpSync(join(root, 'docs/sdk/OFFLINE_PACK_SPEC.md'), join(out, 'docs/OFFLINE_PACK_SPEC.md'));
for (const f of ['FINAL_GO_NO_GO.md', 'FINAL_CLOSURE_LEDGER.md']) cpSync(join(root, 'docs/sdk', f), join(out, 'docs', f));
// Generated native projects live at the example's top level only; modules/*/ios is real source and must ship.
const skip = /(^|\/)(node_modules|\.expo|sdk\.tgz|package-lock\.json)(\/|$)|^(ios|android)(\/|$)|^export-/;
cpSync(join(root, 'examples/expo-consumer'), join(out, 'examples/expo-consumer'), { recursive: true, filter: (p) => !skip.test(relative(join(root, 'examples/expo-consumer'), p)) });
const archive = join(root, 'assets/offline-map/ijtema-basemap.pmtiles');
const provenance = JSON.parse(readFileSync(join(root, 'assets/offline-map/BASEMAP_PROVENANCE.json'), 'utf8'));
assert.equal(sha256(archive), provenance.archive.sha256, 'the sample archive must match its provenance');
mkdirSync(join(out, 'examples/expo-consumer/assets'), { recursive: true });
cpSync(archive, join(out, 'examples/expo-consumer/assets/karachi-basemap.pmtiles'));
cpSync(join(root, 'assets/offline-map/BASEMAP_PROVENANCE.json'), join(out, 'examples/expo-consumer/assets/BASEMAP_PROVENANCE.json'));
cpSync(first, join(out, 'examples/expo-consumer/sdk.tgz'));
copyFileSync(join(root, 'packages/offline-navigation/LICENSE'), join(out, 'LICENSE'));

// 4b. A reviewed, reproducible consumer install: resolve the example's pinned dependencies once, against THIS tarball, and ship the lockfile.
// `npm ci` with it installs exactly this graph; `--dry-run` proves the lockfile and package.json agree. Only registry metadata is read.
const lockDir = join(scratch, 'lock');
mkdirSync(lockDir);
for (const f of ['package.json']) cpSync(join(root, 'examples/expo-consumer', f), join(lockDir, f));
cpSync(first, join(lockDir, 'sdk.tgz'));
run('npm', ['install', '--package-lock-only', '--ignore-scripts', '--no-audit', '--no-fund'], lockDir);
run('npm', ['ci', '--dry-run', '--ignore-scripts', '--no-audit', '--no-fund'], lockDir);
const lockFile = join(lockDir, 'package-lock.json');
const lock = JSON.parse(readFileSync(lockFile, 'utf8'));
assert.ok(lock.packages['node_modules/@muslim-ummah/offline-navigation']?.resolved?.startsWith('file:'), 'the lockfile must pin the packed tarball');
cpSync(lockFile, join(out, 'examples/expo-consumer/package-lock.json'));
writeFileSync(join(out, 'docs/DEPENDENCY_INVENTORY.md'), renderInventory(inventoryFromLock(lock), {
  title: 'JavaScript dependency and licence inventory (consumer app)', tarballSha256: tarSha, lockSha256: sha256(lockFile),
}));
rmSync(scratch, { recursive: true, force: true });

for (const f of ['modules/sdk-location-precision/ios/SdkLocationPrecisionModule.swift', 'modules/sdk-location-precision/ios/SdkLocationPrecision.podspec', 'modules/sdk-location-precision/expo-module.config.json']) assert.ok(existsSync(join(out, 'examples/expo-consumer', f)), `missing ${f}`);

// 5. Hygiene: no personal paths, secrets or unrelated files in anything text.
const textFiles = walk(out).filter((f) => /\.(md|json|ts|tsx|js|mjs|swift|podspec|txt)$/.test(f));
const forbidden = [/\/Users\/[A-Za-z]/, /ghilman/i, /BEGIN [A-Z ]*PRIVATE KEY/, /AKIA[0-9A-Z]{16}/, /\.env\b/];
for (const f of textFiles) {
  const text = readFileSync(f, 'utf8');
  for (const pattern of forbidden) assert.ok(!pattern.test(text), `${relative(out, f)} contains ${pattern}`);
}

// 6. Manifest, checksums and the go/no-go pointer.
const version = JSON.parse(readFileSync(join(root, 'packages/offline-navigation/package.json'), 'utf8')).version;
const files = walk(out).map((f) => relative(out, f)).sort();
const entries = files.map((f) => ({ path: f, bytes: statSync(join(out, f)).size, sha256: sha256(join(out, f)) }));
const info = {
  name: '@muslim-ummah/offline-navigation', version, status: 'release candidate with outstanding acceptance (see docs/SECURITY_AND_VALIDATION_REPORT.md)',
  sourceCommit: run('git', ['rev-parse', 'HEAD']).trim(), tarball: { file: `package/${tarName}`, sha256: tarSha },
  generatedBy: 'scripts/sdk-package/bundle.mjs', published: false,
};
writeFileSync(join(out, 'manifest.json'), JSON.stringify({ ...info, files: entries }, null, 2) + '\n');
writeFileSync(join(out, 'CHECKSUMS.txt'), entries.map((e) => `${e.sha256}  ${e.path}`).join('\n') + '\n');
writeFileSync(join(out, 'README.txt'), `Muslim Ummah Offline Navigation SDK ${version} - private release candidate\n\nStart at docs/README.md. Install package/${tarName}.\nVerify with: shasum -a 256 -c CHECKSUMS.txt (manifest.json, CHECKSUMS.txt and this README are not listed in it).\nThis bundle is NOT published anywhere and carries outstanding physical-device and field acceptance: docs/SECURITY_AND_VALIDATION_REPORT.md.\n`);
console.log(`sdk-bundle: ${files.length} files, tarball sha256 ${info.tarball.sha256}, commit ${info.sourceCommit}`);
console.log(out);

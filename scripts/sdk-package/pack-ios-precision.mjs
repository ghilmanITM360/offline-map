// Pack @muslim-ummah/ios-location-precision (a tiny Expo native module: Swift, podspec, a JavaScript wrapper) into a reproducible tarball.
//   node scripts/sdk-package/pack-ios-precision.mjs <outside-repository-output-directory>
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const pkgDir = join(root, 'packages/ios-location-precision');
assert.ok(process.argv[2], 'usage: node scripts/sdk-package/pack-ios-precision.mjs <outside-repository-output-directory>');
const out = resolve(process.argv[2]);
const rel = relative(root, out);
assert.ok(rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel), 'output must be outside the repository');
mkdirSync(out, { recursive: true });
// Copy only what the manifest ships, so editor and filesystem metadata beside the sources can never reach the tarball.
const stage = mkdtempSync(join(out, 'stage-'));
const manifest = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8'));
cpSync(join(pkgDir, 'package.json'), join(stage, 'package.json'));
for (const name of manifest.files) cpSync(join(pkgDir, name), join(stage, name), { recursive: true, filter: (p) => !/(^|\/)(\._[^/]*|\.DS_Store)$/.test(p) });
const run = (args) => {
  const r = spawnSync('npm', args, { cwd: stage, encoding: 'utf8', env: { PATH: process.env.PATH } });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  return JSON.parse(r.stdout)[0];
};
const dry = run(['pack', '--dry-run', '--json', '--ignore-scripts']);
for (const f of dry.files) assert.ok(/^(package\.json|LICENSE|index\.js|index\.d\.ts|expo-module\.config\.json|ios\/[A-Za-z]+\.(swift|podspec))$/.test(f.path), `unexpected file: ${f.path}`);
console.log(join(out, run(['pack', '--json', '--ignore-scripts', '--pack-destination', out]).filename));

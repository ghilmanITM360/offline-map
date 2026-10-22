// Exercise the actual tarball in an isolated consumer, never a workspace link.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const out = process.argv[2] ? resolve(process.argv[2]) : mkdtempSync(join(tmpdir(), 'sdk-package-proof-'));
mkdirSync(out, { recursive: true });
function run(cmd, args, cwd = out) {
  const result = spawnSync(cmd, args, { cwd, encoding: 'utf8', env: { PATH: process.env.PATH } });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  return result.stdout;
}
const artifacts = ['first', 'second'].map((name) => {
  const dir = join(out, name);
  run(process.execPath, [join(root, 'scripts/sdk-package/pack.mjs'), dir]);
  return join(dir, 'muslim-ummah-offline-navigation-0.1.0.tgz');
});
const hash = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');
assert.equal(hash(artifacts[0]), hash(artifacts[1]), 'identical input must produce byte-identical tarballs');
const consumer = join(out, 'consumer');
assert.ok(!existsSync(consumer), 'use a fresh evidence directory for each verification');
mkdirSync(consumer, { recursive: true });
writeFileSync(join(consumer, 'package.json'), '{"private":true}');
run('npm', ['install', '--offline', '--ignore-scripts', '--legacy-peer-deps', '--no-audit', '--no-fund', artifacts[0]], consumer);
const pkgDir = join(consumer, 'node_modules/@muslim-ummah/offline-navigation');
const manifest = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8'));
assert.equal(manifest.private, true);
assert.equal(manifest.version, '0.1.0');
assert.deepEqual(Object.keys(manifest.exports), ['.', './session', './ui', './package.json']);
assert.equal(manifest.dependencies, undefined);
assert.deepEqual(manifest.peerDependencies, { react: '>=19.1.0', 'react-native': '>=0.81.0' });
for (const target of [manifest.main, manifest.types, manifest['react-native'], ...Object.values(manifest.exports).flatMap((v) => typeof v === 'string' ? [v] : Object.values(v))]) assert.ok(existsSync(join(pkgDir, target)), target);
const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]);
for (const file of walk(pkgDir)) {
  assert.ok(file.endsWith('package.json') || /\/dist\/.*\.(js|d\.ts)$/.test(file), file);
  assert.ok(!readFileSync(file, 'utf8').includes(root), 'artifact contains repository path');
}
// Runtime is a separate plain Node process with no loader, peers, NODE_PATH or repository cwd.
writeFileSync(join(consumer, 'smoke.cjs'), `
const assert = require('node:assert/strict');
const sdk = require('@muslim-ummah/offline-navigation');
const session = require('@muslim-ummah/offline-navigation/session');
assert.equal(sdk.createNavigationSession, session.createNavigationSession);
const heap = new sdk.MinHeap(); heap.push('far', 9); heap.push('near', 1);
assert.equal(heap.pop().value, 'near');
const route = sdk.runAStar({
  seeds: [{ id: 'a', gScore: 0 }], heuristic: () => 0, isGoal: id => id === 'c',
  neighbors: id => id === 'a' ? [{to:'b', weight:1, edge:'ab'}, {to:'c', weight:9, edge:'ac'}] : id === 'b' ? [{to:'c', weight:1, edge:'bc'}] : [],
});
assert.equal(route.gScore.c, 2);
assert.deepEqual(sdk.reconstructAStarPath(route, 'c').nodes, ['a','b','c']);
const s = session.createNavigationSession('artifact'); assert.equal(s.start(), true);
const old = s.beginRequest(); const current = s.beginRequest();
assert.equal(old.canCommit(), false); assert.equal(current.commit(() => {}), true);
s.cancel(); assert.equal(s.state, 'cancelled');
assert.throws(() => require('@muslim-ummah/offline-navigation/dist/domain/algorithms/MinHeap.js'), {code:'ERR_PACKAGE_PATH_NOT_EXPORTED'});
assert.equal(sdk.GateChooser, undefined);
assert.ok(!Object.keys(require.cache).some(p => p.includes('/node_modules/react/') || p.includes('/node_modules/react-native/')));
console.log('artifact runtime: heap + session + export encapsulation passed');
`);
process.stdout.write(run(process.execPath, ['smoke.cjs'], consumer));
assert.ok(!existsSync(join(consumer, 'node_modules/react')));
assert.ok(!existsSync(join(consumer, 'node_modules/react-native')));
writeFileSync(join(consumer, 'headless.ts'), `import { MinHeap, createNavigationSession } from '@muslim-ummah/offline-navigation';\nimport type { NavigationSession } from '@muslim-ummah/offline-navigation/session';\nconst s: NavigationSession = createNavigationSession('types'); const heap = new MinHeap<string>(); heap.push(s.id, 1);`);
const tscArgs = ['--noEmit', '--strict', '--skipLibCheck', '--target', 'es2020', '--module', 'node16', '--moduleResolution', 'node16', '--types', 'node', '--typeRoots', join(root, 'node_modules/@types')];
run(process.execPath, [join(root, 'node_modules/typescript/bin/tsc'), ...tscArgs, 'headless.ts'], consumer);
// Reuse installed host peers only for a RN-aware declaration check; do not install duplicates.
for (const name of ['react', 'react-native', '@types']) symlinkSync(join(root, 'node_modules', name), join(consumer, 'node_modules', name), 'dir');
writeFileSync(join(consumer, 'ui.ts'), `import { MapUnavailableBanner, GateChooser } from '@muslim-ummah/offline-navigation/ui';\nexport const ui = [MapUnavailableBanner, GateChooser];`);
run(process.execPath, [join(root, 'node_modules/typescript/bin/tsc'), ...tscArgs, '--jsx', 'react', 'ui.ts'], consumer);
const req = createRequire(join(consumer, 'package.json'));
assert.equal(req.resolve('react'), createRequire(join(root, 'package.json')).resolve('react'));
assert.equal(req.resolve('react-native'), createRequire(join(root, 'package.json')).resolve('react-native'));
const evidence = { sha256: hash(artifacts[0]), artifact: artifacts[0], reproducible: true, exports: manifest.exports, runtime: 'plain Node, no React/RN', types: 'headless and UI passed; UI uses shared installed peers', independentMetroBundle: false };
writeFileSync(join(out, 'evidence.json'), JSON.stringify(evidence, null, 2) + '\n');
console.log('sdk-package: contents, reproducibility, isolated runtime, declarations, shared peers passed');
console.log(JSON.stringify(evidence));

// Install the packed SDK tarball into an independent Expo project (its own React/RN, stock Metro config) and prove it
// type-checks, renders and bundles for Android and iOS. JS only: no native build, simulator or device is involved.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
assert.ok(process.argv[2], 'usage: node scripts/sdk-package/consumer.mjs <fresh outside-repository evidence directory>');
const out = resolve(process.argv[2]);
const rel = relative(root, out);
assert.ok(rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel), 'output must be outside the repository');
assert.ok(!existsSync(join(out, 'consumer')), 'use a fresh evidence directory for each verification');
mkdirSync(out, { recursive: true });

const env = { PATH: process.env.PATH, HOME: process.env.HOME, CI: '1', EXPO_NO_TELEMETRY: '1' };
function run(cmd, args, cwd, extraEnv = {}) {
  const result = spawnSync(cmd, args, { cwd, encoding: 'utf8', env: { ...env, ...extraEnv }, maxBuffer: 256 * 1024 * 1024 });
  assert.equal(result.status, 0, `${cmd} ${args.join(' ')}\n${result.stdout}\n${result.stderr}`);
  return result.stdout;
}
const sha256 = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');
const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]);

// 1. The artifact under test: the same reproducible tarball test:sdk-package checks.
const packDir = join(out, 'pack');
const tarball = run(process.execPath, [join(root, 'scripts/sdk-package/pack.mjs'), packDir], root).trim().split('\n').pop();

// 2. A fresh project from the committed example, pinned to exactly what the repository itself resolves, so the
// consumer cannot silently drift to other React/Expo versions.
const consumer = join(out, 'consumer');
cpSync(join(root, 'examples/expo-consumer'), consumer, { recursive: true, filter: (p) => !p.includes('node_modules') });
cpSync(tarball, join(consumer, 'sdk.tgz'));
const manifest = JSON.parse(readFileSync(join(consumer, 'package.json'), 'utf8'));
const pins = { ...manifest.dependencies, ...manifest.devDependencies };
delete pins['@muslim-ummah/offline-navigation'];
for (const [name, version] of Object.entries(pins)) {
  assert.equal(JSON.parse(readFileSync(join(root, 'node_modules', name, 'package.json'), 'utf8')).version, version, `${name} pin differs from the repository's resolved version`);
}
run('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', '--prefer-offline'], consumer);

// 3. The tarball, not source, is what got installed; one React and one React Native, both the pinned ones.
const sdkDir = join(consumer, 'node_modules/@muslim-ummah/offline-navigation');
assert.ok(existsSync(join(sdkDir, 'dist/ui/NavigationScreen.js')) && !existsSync(join(sdkDir, 'src')), 'installed SDK must be the compiled artifact');
// @expo/cli ships its own React canary under static/ for its server tooling; it is never part of the app's module graph
// (the bundle check in step 5 proves that), so it is the one place a second copy is expected.
const copies = (name) => run('find', [join(consumer, 'node_modules'), '-path', `*/node_modules/${name}/package.json`, '-not', '-path', '*/@expo/cli/static/*'], consumer).split('\n').filter(Boolean)
  .filter((p) => JSON.parse(readFileSync(p, 'utf8')).name === name);
for (const name of ['react', 'react-native']) assert.equal(copies(name).length, 1, `exactly one ${name} must be installed`);

// 4. Types, then rendering, both against the installed artifact.
run(join(consumer, 'node_modules/.bin/tsc'), ['--noEmit', '-p', '.'], consumer);
run(join(consumer, 'node_modules/.bin/jest'), ['--ci', '--json', `--outputFile=${join(out, 'jest.json')}`], consumer);
const jest = JSON.parse(readFileSync(join(out, 'jest.json'), 'utf8'));
assert.equal(jest.numFailedTests, 0);
assert.ok(jest.numPassedTests >= 4, 'the consumer flows must have run');

// 5. Production Metro bundles (Hermes) for both platforms, resolved by package name from node_modules only.
const bundles = {};
for (const platform of ['android', 'ios']) {
  const dir = join(consumer, `export-${platform}`);
  run(join(consumer, 'node_modules/.bin/expo'), ['export', '--platform', platform, '--output-dir', dir, '--dump-sourcemap'], consumer, { EXPO_OFFLINE: '1' });
  const files = walk(dir);
  const maps = files.filter((f) => f.endsWith('.map'));
  assert.ok(maps.length > 0 && files.some((f) => /\.(hbc|js)$/.test(f) && statSync(f).size > 100_000), `${platform}: no production bundle`);
  // Expo writes '/node_modules/...' relative to the project for files inside it and an absolute path for any file outside
  // it; '\0polyfill:' entries are virtual. A source that does not exist under the consumer is kept absolute, so it fails
  // the containment check below.
  const sources = maps.flatMap((m) => JSON.parse(readFileSync(m, 'utf8')).sources).filter((s) => !s.startsWith('\0'))
    .map((s) => (existsSync(join(consumer, s)) ? join(consumer, s) : s));
  assert.ok(sources.some((s) => s.endsWith('node_modules/@muslim-ummah/offline-navigation/dist/ui/NavigationScreen.js')), `${platform}: the packed screen is not in the bundle`);
  assert.ok(sources.some((s) => s.endsWith('node_modules/@muslim-ummah/offline-navigation/dist/domain/navigation/NavigationController.js')), `${platform}: the packed controller is not in the bundle`);
  assert.ok(sources.every((s) => s.startsWith(consumer + sep)), `${platform}: a module came from outside the consumer: ${sources.find((s) => !s.startsWith(consumer + sep))}`);
  assert.ok(!sources.some((s) => s.startsWith(root + sep)), `${platform}: repository source leaked into the bundle`);
  const roots = (name) => new Set(sources.filter((s) => s.includes(`/node_modules/${name}/`)).map((s) => s.slice(0, s.indexOf(`/node_modules/${name}/`))));
  for (const name of ['react', 'react-native']) assert.equal(roots(name).size, 1, `${platform}: the bundle must contain exactly one ${name}`);
  bundles[platform] = { modules: sources.length, bytes: files.filter((f) => /\.(hbc|js)$/.test(f)).reduce((n, f) => n + statSync(f).size, 0) };
}

// npm ls exits non-zero on the known test-renderer/react-reconciler peer mismatch (also present in the repository), so
// read its JSON and record the problems instead of failing on them.
const ls = JSON.parse(spawnSync('npm', ['ls', '--all', '--json'], { cwd: consumer, encoding: 'utf8', env, maxBuffer: 256 * 1024 * 1024 }).stdout);
const versions = ls.dependencies;
const evidence = {
  tarball, sha256: sha256(tarball),
  lockfileSha256: sha256(join(consumer, 'package-lock.json')),
  npmLsProblems: ls.problems ?? [],
  versions: Object.fromEntries(Object.entries(versions).map(([k, v]) => [k, v.version])),
  jest: { passed: jest.numPassedTests, suites: jest.numTotalTestSuites, preset: 'jest-expo/android' },
  bundles,
  scope: 'JS only: installed tarball type-checks, renders under Jest and bundles for Android and iOS. No native build, simulator, device or real MapLibre.',
};
writeFileSync(join(out, 'evidence.json'), JSON.stringify(evidence, null, 2) + '\n');
console.log('sdk-consumer: installed artifact, one React/RN, tsc, jest flows and Android+iOS production bundles passed');
console.log(JSON.stringify(evidence));

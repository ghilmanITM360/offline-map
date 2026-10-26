// Install the packed SDK tarball into an independent Expo project (its own React/RN, stock Metro config) and prove it
// type-checks, renders and bundles for Android and iOS, with the packed MapLibre adapter and the bundled Karachi basemap.
// JS only: no native build, simulator or device is involved.
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

// The verified Karachi archive is the repository's own; the example's constants must describe exactly these bytes.
const ARCHIVE = join(root, 'assets/offline-map/ijtema-basemap.pmtiles');
const provenance = JSON.parse(readFileSync(join(root, 'assets/offline-map/BASEMAP_PROVENANCE.json'), 'utf8'));
assert.equal(sha256(ARCHIVE), provenance.archive.sha256, 'the repository archive must match its provenance');
mkdirSync(join(consumer, 'assets'), { recursive: true });
cpSync(ARCHIVE, join(consumer, 'assets/karachi-basemap.pmtiles'));
const basemapSource = readFileSync(join(consumer, 'basemap.ts'), 'utf8');
for (const literal of [`sha256: '${provenance.archive.sha256}'`, `bytes: ${provenance.archive.bytes}`, `zoom: { min: ${provenance.zoom.min}, max: ${provenance.zoom.max} }`]) {
  assert.ok(basemapSource.includes(literal), `basemap.ts must carry ${literal} from BASEMAP_PROVENANCE.json`);
}

// The bundled venue packs are built by the pack compiler from tracked sources and pinned by manifest digest. The example's table must
// describe exactly what the compiler produced: same digest, same file list, one asset per file (the archive is the shared one above).
const packTable = readFileSync(join(consumer, 'bundledPackTable.ts'), 'utf8');
const bundledPackFiles = [];
for (const [venue, script, pinFile] of [['karachi-ijtema', 'karachi.ts', 'karachi-ijtema.pin.json'], ['synthetic-demo-venue', 'demo.ts', 'synthetic-demo-venue.pin.json']]) {
  const built = join(out, 'packs', venue);
  run(process.execPath, ['--import', 'tsx', join(root, 'scripts/sdk-pack', script), built], root);
  const pin = JSON.parse(readFileSync(join(root, 'scripts/sdk-pack', pinFile), 'utf8'));
  assert.equal(sha256(join(built, 'pack.manifest.json')), pin.manifestSha256, `${venue}: the built pack differs from its committed pin`);
  assert.ok(packTable.includes(`packId: '${pin.packId}'`) && packTable.includes(`id: '${pin.packId.replace('@', '-')}'`) && packTable.includes(`manifestSha256: '${pin.manifestSha256}'`), `bundledPackTable.ts must pin ${pin.packId} at ${pin.manifestSha256}`);
  for (const path of ['pack.manifest.json', ...pin.resources.map((r) => r.path)]) {
    if (path === 'map/ijtema-basemap.pmtiles') { assert.equal(sha256(join(built, path)), provenance.archive.sha256); continue; }
    const asset = `${path.replaceAll('/', '__')}.packfile`;
    assert.ok(packTable.includes(`'${path}': require('./assets/packs/${venue}/${asset}')`), `bundledPackTable.ts must list ${path} for ${venue}`);
    mkdirSync(join(consumer, 'assets/packs', venue), { recursive: true });
    cpSync(join(built, path), join(consumer, 'assets/packs', venue, asset));
    bundledPackFiles.push([`${venue}/${path}`, sha256(join(built, path))]);
  }
}
const manifest = JSON.parse(readFileSync(join(consumer, 'package.json'), 'utf8'));
const pins = { ...manifest.dependencies, ...manifest.devDependencies };
delete pins['@muslim-ummah/offline-navigation'];
// A package the repository does not itself install (the example's expo-system-ui) is pinned to what the installed Expo SDK declares compatible.
const bundled = JSON.parse(readFileSync(join(root, 'node_modules/expo/bundledNativeModules.json'), 'utf8'));
const compatible = (range, version) => {
  const [rm, rn, rp] = range.replace(/^[~^]/, '').split('.').map(Number);
  const [vm, vn, vp] = version.split('.').map(Number);
  return range.startsWith('~') ? vm === rm && vn === rn && vp >= rp : vm === rm && (vn > rn || (vn === rn && vp >= rp));
};
for (const [name, version] of Object.entries(pins)) {
  const installed = join(root, 'node_modules', name, 'package.json');
  if (existsSync(installed)) assert.equal(JSON.parse(readFileSync(installed, 'utf8')).version, version, `${name} pin differs from the repository's resolved version`);
  else assert.ok(bundled[name] && compatible(bundled[name], version), `${name}@${version} is not what Expo SDK ${bundled.expo ?? ''} bundles (${bundled[name]})`);
}
run('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', '--prefer-offline'], consumer);

// 3. The tarball, not source, is what got installed; one React and one React Native, both the pinned ones.
const sdkDir = join(consumer, 'node_modules/@muslim-ummah/offline-navigation');
assert.ok(existsSync(join(sdkDir, 'dist/ui/NavigationScreen.js')) && !existsSync(join(sdkDir, 'src')), 'installed SDK must be the compiled artifact');
// @expo/cli ships its own React canary under static/ for its server tooling; it is never part of the app's module graph
// (the bundle check in step 5 proves that), so it is the one place a second copy is expected.
const copies = (name) => run('find', [join(consumer, 'node_modules'), '-path', `*/node_modules/${name}/package.json`, '-not', '-path', '*/@expo/cli/static/*'], consumer).split('\n').filter(Boolean)
  .filter((p) => JSON.parse(readFileSync(p, 'utf8')).name === name);
for (const name of ['react', 'react-native', '@maplibre/maplibre-react-native']) assert.equal(copies(name).length, 1, `exactly one ${name} must be installed`);

// The MapLibre config plugin must resolve from the app's own dependencies (it is what edits the native projects).
const expoConfig = JSON.parse(run(join(consumer, 'node_modules/.bin/expo'), ['config', '--json', '--type', 'public'], consumer, { EXPO_OFFLINE: '1' }));
assert.ok(expoConfig.plugins.some((p) => p === '@maplibre/maplibre-react-native' || p[0] === '@maplibre/maplibre-react-native'), 'the MapLibre config plugin must be configured');

// 4. Types, then rendering, both against the installed artifact.
run(join(consumer, 'node_modules/.bin/tsc'), ['--noEmit', '-p', '.'], consumer);
run(join(consumer, 'node_modules/.bin/jest'), ['--ci', '--json', `--outputFile=${join(out, 'jest.json')}`], consumer);
const jest = JSON.parse(readFileSync(join(out, 'jest.json'), 'utf8'));
assert.equal(jest.numFailedTests, 0);
assert.ok(jest.numPassedTests >= 10, 'the consumer flows must have run');

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
  assert.ok(sources.some((s) => s.endsWith('node_modules/@muslim-ummah/offline-navigation/dist/maplibre/MapLibreNavigationMap.js')), `${platform}: the packed MapLibre adapter is not in the bundle`);
  assert.ok(files.some((f) => !f.endsWith('.map') && statSync(f).size === provenance.archive.bytes && sha256(f) === provenance.archive.sha256), `${platform}: the basemap archive is not among the exported assets`);
  for (const [name, hash] of bundledPackFiles) assert.ok(files.some((f) => !f.endsWith('.map') && sha256(f) === hash), `${platform}: ${name} is not among the exported assets`);
  assert.ok(sources.every((s) => s.startsWith(consumer + sep)), `${platform}: a module came from outside the consumer: ${sources.find((s) => !s.startsWith(consumer + sep))}`);
  assert.ok(!sources.some((s) => s.startsWith(root + sep)), `${platform}: repository source leaked into the bundle`);
  const roots = (name) => new Set(sources.filter((s) => s.includes(`/node_modules/${name}/`)).map((s) => s.slice(0, s.indexOf(`/node_modules/${name}/`))));
  for (const name of ['react', 'react-native', '@maplibre/maplibre-react-native']) assert.equal(roots(name).size, 1, `${platform}: the bundle must contain exactly one ${name}`);
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
  basemap: { sha256: provenance.archive.sha256, bytes: provenance.archive.bytes },
  scope: 'JS only: installed tarball type-checks, renders under Jest (native MapLibre and file system mocked) and bundles for Android and iOS with the archive as an asset. No native build, simulator, device or real MapLibre rendering.',
};
writeFileSync(join(out, 'evidence.json'), JSON.stringify(evidence, null, 2) + '\n');
console.log('sdk-consumer: installed artifact, one React/RN, tsc, jest flows and Android+iOS production bundles passed');
console.log(JSON.stringify(evidence));

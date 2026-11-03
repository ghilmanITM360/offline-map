// Independent-client acceptance: unpack ONLY the delivery archive into a fresh folder outside any repository and exercise what a client does with it
// (QUICK_START.md), using nothing from the SDK source tree. This file is the only repository code involved, and it only unpacks and drives commands.
//   node scripts/sdk-package/client-acceptance.mjs <delivery.tgz> <fresh work directory> [expected archive sha256]
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { auditEntries, extractEntries, readTarGz, sha256Hex } from './tar.mjs';

assert.ok(process.argv[2] && process.argv[3], 'usage: client-acceptance.mjs <delivery.tgz> <fresh work directory> [archive sha256]');
const archive = resolve(process.argv[2]);
const work = resolve(process.argv[3]);
assert.ok(!existsSync(work), 'use a fresh work directory');
for (let d = dirname(work); ; d = dirname(d)) { assert.ok(!existsSync(join(d, '.git')), `${work} is inside a git repository: ${d}`); if (dirname(d) === d) break; }
mkdirSync(work, { recursive: true });
const log = [];
const step = (name, detail = '') => { log.push({ name, detail }); console.log(`  ok - ${name}${detail ? ` (${detail})` : ''}`); };
const env = { PATH: process.env.PATH, HOME: process.env.HOME, CI: '1', EXPO_NO_TELEMETRY: '1', EXPO_NO_DOTENV: '1' };
const run = (cmd, args, cwd, extra = {}, timeout = 900_000) => {
  const r = spawnSync(cmd, args, { cwd, encoding: 'utf8', env: { ...env, ...extra }, maxBuffer: 256 * 1024 * 1024, timeout });
  assert.equal(r.status, 0, `${cmd} ${args.join(' ')} (cwd ${cwd})\n${r.error?.message ?? ''}\n${r.stdout}\n${r.stderr}`);
  return r.stdout;
};
const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));

// 1. Receive and verify (QUICK_START step 1).
const archiveSha = sha256Hex(readFileSync(archive));
if (process.argv[4]) assert.equal(archiveSha, process.argv[4].toLowerCase(), 'archive checksum differs from the one supplied');
const entries = readTarGz(archive);
assert.deepEqual(auditEntries(entries), [], 'raw archive audit');
assert.equal(entries.filter((e) => e.path.split('/').some((p) => p.startsWith('._'))).length, 0, 'no AppleDouble entries');
extractEntries(entries, work);
const deliveryId = readdirSync(work).filter((n) => n.startsWith('delivery-'))[0];
const delivery = join(work, deliveryId);
for (const line of readFileSync(join(delivery, 'CHECKSUMS.txt'), 'utf8').trim().split('\n')) {
  const [hash, path] = [line.slice(0, 64), line.slice(66)];
  assert.equal(sha256Hex(readFileSync(join(delivery, path))), hash, path);
}
const manifest = JSON.parse(readFileSync(join(delivery, 'manifest.json'), 'utf8'));
step('archive unpacked with Node only; raw audit clean; CHECKSUMS.txt verifies', `${entries.length} files, ${archiveSha.slice(0, 12)}`);

// 2. Venue preparation with the shipped tool (QUICK_START step 4), run from the delivery with plain Node.
const tool = join(delivery, 'tools/venue-pack/venue-pack.cjs');
const venueSpec = join(delivery, 'examples/synthetic-venue/pack.spec.json');
const venueInput = join(delivery, 'examples/synthetic-venue/input');
const compiled = run(process.execPath, [tool, 'compile', '--spec', venueSpec, '--input', venueInput, '--out', join(work, 'venue-build')], work);
const pin = JSON.parse(readFileSync(join(work, 'venue-build/pack.pin.json'), 'utf8'));
assert.ok(compiled.includes(pin.manifestSha256));
run(process.execPath, [tool, 'verify', join(work, 'venue-build/pack'), '--pin', pin.manifestSha256], work);
const refused = spawnSync(process.execPath, [tool, 'compile', '--spec', venueSpec, '--input', venueInput, '--out', join(work, 'venue-build')], { encoding: 'utf8', cwd: work });
assert.equal(refused.status, 1);
step('venue tool compiled the synthetic venue, verified it against its pin, and refused to reuse an output folder', pin.manifestSha256.slice(0, 12));

// 3. The example app, copied as a client would, installed from its shipped lock (QUICK_START step 2).
const app = join(work, 'my-app');
cpSync(join(delivery, 'examples/expo-consumer'), app, { recursive: true });
run('npm', ['ci', '--ignore-scripts', '--no-audit', '--no-fund', '--prefer-offline'], app);
const sdkDir = join(app, 'node_modules/@muslim-ummah/offline-navigation');
assert.ok(existsSync(join(sdkDir, 'dist/ui/NavigationScreen.js')) && !existsSync(join(sdkDir, 'src')), 'installed SDK is the compiled artifact');
assert.ok(existsSync(join(sdkDir, 'app.plugin.js')) && existsSync(join(sdkDir, 'metro.js')));
assert.ok(existsSync(join(app, 'node_modules/@muslim-ummah/ios-location-precision/ios/SdkLocationPrecisionModule.swift')));
const copies = (name) => run('find', [join(app, 'node_modules'), '-path', `*/node_modules/${name}/package.json`, '-not', '-path', '*/@expo/cli/static/*'], app).split('\n').filter(Boolean).filter((p) => JSON.parse(readFileSync(p, 'utf8')).name === name);
for (const name of ['react', 'react-native', '@maplibre/maplibre-react-native']) assert.equal(copies(name).length, 1, `one ${name}`);
step('npm ci from the shipped lock; one react, react-native and MapLibre; SDK, plugin, Metro helper and iOS module installed from tarballs');

// 4. Public exports, declarations and a headless journey on the CLIENT-COMPILED pack (QUICK_START step 6: headless).
writeFileSync(join(app, 'headless.cjs'), `
const assert = require('node:assert/strict');
const fs = require('node:fs');
const sdk = require('@muslim-ummah/offline-navigation');
const dir = process.argv[2];
const text = (p) => fs.readFileSync(dir + '/' + p, 'utf8');
const parsed = sdk.parsePackVenueData(text('data/routing-graph.json'), text('data/place-directory.json'), 'example-courtyard');
assert.ok(parsed.ok, JSON.stringify(parsed));
assert.deepEqual(sdk.validateVenueGraph(parsed.source.graph), []);
const nav = sdk.createNavigationController({ venue: parsed.source });
assert.equal(nav.listPlaces().length, 6);
nav.selectDestination('library'); nav.selectOrigin('entrance');
const state = nav.getState();
assert.equal(state.phase, 'preview'); assert.deepEqual(state.route.steps.map((x) => x.kind), ['depart', 'turn_right', 'turn_left', 'arrive']);
assert.equal(nav.startGuide(), true); nav.nextStep(); nav.previousStep();
nav.selectDestination('entrance'); assert.equal(nav.getState().route, null); assert.equal(nav.getState().presentation, 'SAME_PLACE'); // same origin and destination: reported, no route
nav.selectDestination('no-such-place'); assert.equal(nav.getState().error, 'unknown_place');
nav.exit(); assert.equal(nav.getState().phase, 'browsing'); nav.dispose();
const second = sdk.createNavigationController({ venue: parsed.source });
second.selectDestination('cafe'); second.selectOrigin('hall'); assert.ok(second.getState().route); second.dispose();
console.log('headless journey on the client-compiled pack passed');
`);
process.stdout.write(run(process.execPath, ['headless.cjs', join(work, 'venue-build/pack')], app));
run(join(app, 'node_modules/.bin/tsc'), ['--noEmit', '-p', '.'], app);
step('headless navigation on the client-compiled pack; app type-checks against the shipped declarations');

// 5. The app's own tests (offline venue switch, fresh journeys, pack corruption recovery, failure paths, RTL/language).
assert.ok(JSON.parse(readFileSync(join(app, 'package.json'), 'utf8')).scripts.test, 'the app ships its npm test script');
const jestJson = JSON.parse(run(join(app, 'node_modules/.bin/jest'), ['--ci', '--runInBand', '--watchman=false', '--json'], app, {}, 1_200_000));
assert.equal(jestJson.numFailedTests, 0);
assert.ok(jestJson.numPassedTests >= 60);
step('consumer tests', `${jestJson.numPassedTests} tests / ${jestJson.numTotalTestSuites} suites`);

// 6. Native configuration through the real plugin: prebuild both platforms in a throwaway copy (no pod install, Gradle or compiler).
const inspect = (name, mutate) => {
  const dir = join(work, name);
  mkdirSync(dir);
  cpSync(join(app, 'package.json'), join(dir, 'package.json'));
  const config = JSON.parse(readFileSync(join(app, 'app.json'), 'utf8'));
  mutate?.(config.expo);
  writeFileSync(join(dir, 'app.json'), JSON.stringify(config, null, 2));
  symlinkSync(join(app, 'node_modules'), join(dir, 'node_modules'), 'dir');
  return dir;
};
const expo = join(app, 'node_modules/.bin/expo');
const prebuild = inspect('prebuild');
run(expo, ['prebuild', '--platform', 'all', '--no-install', '--template', join(app, 'node_modules/expo/template.tgz')], prebuild, { EXPO_OFFLINE: '1' });
const android = join(prebuild, 'android/app/src/main');
const manifestXml = readFileSync(join(android, 'AndroidManifest.xml'), 'utf8');
assert.ok(manifestXml.includes('android.permission.ACCESS_FINE_LOCATION') && !manifestXml.includes('ACCESS_BACKGROUND_LOCATION'));
for (const change of ['fontScale', 'smallestScreenSize', 'density']) assert.ok(/android:configChanges="[^"]*/.exec(manifestXml)?.[0].includes(change), change);
const java = join(android, 'java/com/example/sdkconsumer');
assert.ok(readFileSync(join(java, 'MainApplication.kt'), 'utf8').includes('enableFontScaleChangesUpdatingLayout() = true'));
assert.ok(readFileSync(join(java, 'MainActivity.kt'), 'utf8').includes('reactDelegate?.reactRootView?.requestLayout()'));
const plist = readFileSync(join(prebuild, 'ios/SDKConsumer/Info.plist'), 'utf8');
assert.ok(plist.includes('NSLocationWhenInUseUsageDescription') && !plist.includes('NSLocationAlwaysUsageDescription') && !plist.includes('UIBackgroundModes'));
assert.ok(/CFBundleLocalizations<\/key>\s*<array>\s*<string>en<\/string>\s*<string>ur<\/string>/.test(plist));
const autolinked = run(join(app, 'node_modules/.bin/expo-modules-autolinking'), ['resolve', '--platform', 'apple', '--json'], prebuild);
assert.ok(autolinked.includes('SdkLocationPrecision'));
step('plugin: Android permissions, configChanges, font-layout fix; iOS foreground-location text, languages; iOS precision module autolinked');

// 6b. Invalid configuration fails early with the SDK's own message.
for (const [name, mutate, message] of [
  ['bad-option', (e) => { e.plugins[0][1].locationPermisionText = 'typo'; }, /unknown option "locationPermisionText"/],
  ['bad-language', (e) => { e.plugins[0][1].languages = []; }, /"languages" must be a non-empty list/],
]) {
  const dir = inspect(name, mutate);
  const r = spawnSync(expo, ['prebuild', '--platform', 'android', '--no-install', '--template', join(app, 'node_modules/expo/template.tgz')], { cwd: dir, encoding: 'utf8', env: { ...env, EXPO_OFFLINE: '1' } });
  assert.notEqual(r.status, 0, `${name} must fail`);
  assert.ok(!existsSync(join(dir, 'android')), `${name}: no native project may be generated from an invalid configuration`);
  assert.match(r.stdout + r.stderr, message);
  assert.match(r.stdout + r.stderr, /\[@muslim-ummah\/offline-navigation\]/);
}
step('invalid plugin options fail with a message naming the option');

// 7+8. Production Metro exports for both platforms: contained in the app, one React/RN/MapLibre, every pack asset present. Run once as delivered, then again after
// the client's own compiled pack has been added with `app-assets` and its table entry, which must also export the pack's bytes. (Metro does not follow a symlinked
// node_modules, so the pack is added to the app itself, as a client would.)
const clientHashes = pin.resources.map((r) => r.sha256).concat(pin.manifestSha256);
const exportAll = (label, withClientPack) => {
  for (const platform of ['android', 'ios']) {
    const out = join(app, `export-${platform}-${withClientPack ? 'pack' : 'base'}`);
    run(expo, ['export', '--platform', platform, '--output-dir', out, '--dump-sourcemap', '--max-workers', '1'], app, { EXPO_OFFLINE: '1' });
    const files = walk(out);
    const maps = files.filter((f) => f.endsWith('.map'));
    assert.ok(maps.length > 0 && files.some((f) => /\.(hbc|js)$/.test(f) && statSync(f).size > 100_000), `${label} ${platform}: no bundle`);
    const sources = maps.flatMap((m) => JSON.parse(readFileSync(m, 'utf8')).sources).filter((s) => !s.startsWith('\0')).map((s) => (existsSync(join(app, s)) ? join(app, s) : s));
    assert.ok(sources.every((s) => s.startsWith(app + sep)), `${label} ${platform}: source outside the app: ${sources.find((s) => !s.startsWith(app + sep))}`);
    for (const needle of ['dist/ui/NavigationScreen.js', 'dist/domain/navigation/NavigationController.js', 'dist/maplibre/MapLibreNavigationMap.js']) assert.ok(sources.some((s) => s.endsWith(`@muslim-ummah/offline-navigation/${needle}`)), `${label} ${platform}: ${needle}`);
    const hashes = new Set(files.filter((f) => !f.endsWith('.map')).map((f) => sha256Hex(readFileSync(f))));
    for (const p of manifest.files.filter((f) => /^examples\/expo-consumer\/assets\/(packs\/.*\.packfile|karachi-basemap\.pmtiles)$/.test(f.path))) assert.ok(hashes.has(p.sha256), `${label} ${platform}: ${p.path} missing from the export`);
    if (withClientPack) for (const h of clientHashes) assert.ok(hashes.has(h), `${platform}: client pack asset ${h.slice(0, 12)} missing from the export`);
    step(`production export ${platform} (${label})`, `${sources.length} module sources`);
  }
};
exportAll('as delivered', false);
const printed = run(process.execPath, [tool, 'app-assets', '--pack', join(work, 'venue-build/pack'), '--app', app], work);
const entry = printed.slice(printed.indexOf('  {\n    id:'));
const tablePath = join(app, 'bundledPackTable.ts');
const table = readFileSync(tablePath, 'utf8');
assert.ok(table.includes('\n];\n\nexport const BUNDLED_PACK_TABLE'));
writeFileSync(tablePath, table.replace('\n];\n\nexport const BUNDLED_PACK_TABLE', `\n${entry.trimEnd()}\n];\n\nexport const BUNDLED_PACK_TABLE`));
run(join(app, 'node_modules/.bin/tsc'), ['--noEmit', '-p', '.'], app);
step('app-assets copied the client pack into the app; the table entry type-checks');
exportAll('with the client pack added', true);

// 9. Nothing in the unpacked delivery points at a developer machine.
const forbidden = [/\/Users\/[A-Za-z]/, /ghilman/i, /BEGIN [A-Z ]*PRIVATE KEY/];
for (const f of walk(delivery).filter((p) => /\.(md|json|ts|tsx|js|cjs|mjs|swift|podspec|txt)$/.test(p) && !p.includes('node_modules'))) {
  const text = readFileSync(f, 'utf8');
  for (const pattern of forbidden) assert.ok(!pattern.test(text), `${relative(delivery, f)} matches ${pattern}`);
}
step('no developer paths or key material in the delivered text files');

const evidence = { deliveryId, archiveSha256: archiveSha, sdkTarballSha256: manifest.tarball.sha256, iosPrecisionTarballSha256: manifest.iosPrecisionTarball.sha256, sourceCommit: manifest.sourceCommit, steps: log, result: 'PASS' };
writeFileSync(join(work, 'client-acceptance.json'), `${JSON.stringify(evidence, null, 2)}\n`);
console.log(JSON.stringify({ result: 'PASS', deliveryId, archiveSha256: archiveSha, steps: log.length }));

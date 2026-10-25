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
assert.deepEqual(Object.keys(manifest.exports), ['.', './session', './ui', './maplibre', './package.json']);
assert.equal(manifest.dependencies, undefined);
assert.deepEqual(manifest.peerDependencies, { '@maplibre/maplibre-react-native': '>=11.5.0 <12', react: '>=19.1.0', 'react-native': '>=0.81.0' });
assert.deepEqual(Object.keys(manifest.peerDependenciesMeta).sort(), Object.keys(manifest.peerDependencies).sort());
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
const A = { id: 'a', coordinate: { lat: 1, lng: 1 } }, B = { id: 'b', coordinate: { lat: 1.0005, lng: 1 } };
const venue = {
  venueId: 'artifact-venue', dataVersion: '1',
  graph: { nodeIds: () => ['a', 'b'], getNode: id => id === 'a' ? A : id === 'b' ? B : undefined, edgesFrom: id => id === 'a' ? [{ to: 'b', distanceM: 55 }] : id === 'b' ? [{ to: 'a', distanceM: 55 }] : [] },
  placeIds: () => ['pa', 'pb'], getPlace: id => id === 'pa' ? { id, kind: 'k', nodeIds: ['a'] } : id === 'pb' ? { id, kind: 'k', nodeIds: ['b'] } : undefined,
};
const nav = sdk.createNavigationController({ venue });
assert.deepEqual(nav.listPlaces().map(p => p.id), ['pa', 'pb']);
nav.selectDestination('pb'); nav.selectOrigin('pa');
assert.deepEqual(nav.getState().route.steps.map(x => x.kind), ['depart', 'arrive']);
assert.equal(nav.startGuide(), true); nav.exit(); assert.equal(nav.getState().phase, 'browsing');
assert.throws(() => require('@muslim-ummah/offline-navigation/dist/domain/algorithms/MinHeap.js'), {code:'ERR_PACKAGE_PATH_NOT_EXPORTED'});
assert.equal(sdk.GateChooser, undefined);
assert.equal(sdk.NavigationScreen, undefined); assert.equal(sdk.createDefaultNavigationTheme, undefined); // UI never leaks into the headless root
assert.ok(!Object.keys(require.cache).some(p => p.includes('/node_modules/react/') || p.includes('/node_modules/react-native/') || p.includes('/node_modules/@maplibre/')));
console.log('artifact runtime: heap + session + navigation controller + export encapsulation passed');
`);
process.stdout.write(run(process.execPath, ['smoke.cjs'], consumer));
assert.ok(!existsSync(join(consumer, 'node_modules/react')));
assert.ok(!existsSync(join(consumer, 'node_modules/react-native')));
writeFileSync(join(consumer, 'headless.ts'), `import { MinHeap, createNavigationSession, createNavigationController } from '@muslim-ummah/offline-navigation';\nimport type { NavigationControllerState, VenueDataSource } from '@muslim-ummah/offline-navigation';\nimport type { NavigationSession } from '@muslim-ummah/offline-navigation/session';\nconst s: NavigationSession = createNavigationSession('types'); const heap = new MinHeap<string>(); heap.push(s.id, 1);\nexport const open = (venue: VenueDataSource): NavigationControllerState => createNavigationController({ venue }).getState();`);
const tscArgs = ['--noEmit', '--strict', '--skipLibCheck', '--target', 'es2020', '--module', 'node16', '--moduleResolution', 'node16', '--types', 'node', '--typeRoots', join(root, 'node_modules/@types')];
run(process.execPath, [join(root, 'node_modules/typescript/bin/tsc'), ...tscArgs, 'headless.ts'], consumer);
// Reuse installed host peers only for a RN-aware declaration check; do not install duplicates.
for (const name of ['react', 'react-native', '@maplibre', '@types']) symlinkSync(join(root, 'node_modules', name), join(consumer, 'node_modules', name), 'dir');
// The packed artifact must carry the ready-made screen, its default theme/copy and their declarations.
const uiDir = join(pkgDir, dirname(manifest.exports['./ui'].types));
const mapDir = join(pkgDir, dirname(manifest.exports['./maplibre'].types));
for (const name of ['MapLibreNavigationMap', 'navigationOverlay', 'offlineBasemapStyle']) assert.ok(existsSync(join(mapDir, `${name}.js`)) && existsSync(join(mapDir, `${name}.d.ts`)), `packed ${name}`);
for (const name of ['NavigationScreen', 'PlaceDirectory', 'createDefaultNavigationTheme', 'EnglishNavigationCopy', 'NavigationScreenTypes']) {
  assert.ok(existsSync(join(uiDir, `${name}.js`)) && existsSync(join(uiDir, `${name}.d.ts`)), `packed ${name}`);
}
writeFileSync(join(consumer, 'ui.ts'), [
  `import React from 'react';`,
  `import { MapUnavailableBanner, GateChooser, NavigationProvider, NavigationScreen, createDefaultNavigationTheme, ENGLISH_NAVIGATION_SCREEN_COPY } from '@muslim-ummah/offline-navigation/ui';`,
  `import type { NavigationMapProps, NavigationMapHandle, NavigationScreenCopy } from '@muslim-ummah/offline-navigation/ui';`,
  `import { createNavigationController } from '@muslim-ummah/offline-navigation';`,
  `import type { VenueDataSource } from '@muslim-ummah/offline-navigation';`,
  `export const ui = [MapUnavailableBanner, GateChooser];`,
  `// A host's map: it renders what it is given and answers recenter(); typed against the packed declarations.`,
  `const HostMap = (props: NavigationMapProps): null => { const handle: NavigationMapHandle = { recenter: () => props.onAvailabilityChange(true) }; void handle; return null; };`,
  `const copy: NavigationScreenCopy = { ...ENGLISH_NAVIGATION_SCREEN_COPY };`,
  `export const screen = (venue: VenueDataSource) => {`,
  `  const controller = createNavigationController({ venue });`,
  `  const theme = createDefaultNavigationTheme({ isRTL: false });`,
  `  return React.createElement(NavigationProvider, { controller, children: React.createElement(NavigationScreen, { copy, theme, isRTL: false, MapComponent: HostMap, describePlace: (p) => ({ title: p.id }), onTripEnded: (reason: 'exit' | 'arrived') => void reason }) });`,
  `};`,
  `import { createMapLibreNavigationMap } from '@muslim-ummah/offline-navigation/maplibre';`,
  `// The packed MapLibre adapter is typed as the screen's MapComponent.`,
  `export const MapView: React.ComponentType<NavigationMapProps> = createMapLibreNavigationMap({ venue: {} as VenueDataSource, archiveUri: null, archiveZoom: { min: 10, max: 17 }, initialCenter: { lat: 0, lng: 0 }, initialZoom: 15 });`,
  `export const withMap = (copy: NavigationScreenCopy) => React.createElement(NavigationScreen, { copy, theme: createDefaultNavigationTheme({ isRTL: false }), isRTL: false, MapComponent: MapView });`,
  `// @ts-expect-error the screen cannot render without the host's copy`,
  `export const missingCopy = React.createElement(NavigationScreen, { theme: createDefaultNavigationTheme({ isRTL: false }), isRTL: false });`,
  `// @ts-expect-error the screen needs to know the reading direction`,
  `export const missingDirection = React.createElement(NavigationScreen, { copy, theme: createDefaultNavigationTheme({ isRTL: false }) });`,
].join('\n'));
run(process.execPath, [join(root, 'node_modules/typescript/bin/tsc'), ...tscArgs, '--jsx', 'react', 'ui.ts'], consumer);
const req = createRequire(join(consumer, 'package.json'));
assert.equal(req.resolve('react'), createRequire(join(root, 'package.json')).resolve('react'));
assert.equal(req.resolve('react-native'), createRequire(join(root, 'package.json')).resolve('react-native'));
const evidence = { sha256: hash(artifacts[0]), artifact: artifacts[0], reproducible: true, exports: manifest.exports, runtime: 'plain Node, no React/RN', types: 'headless and UI passed; UI uses shared installed peers', independentMetroBundle: false };
writeFileSync(join(out, 'evidence.json'), JSON.stringify(evidence, null, 2) + '\n');
console.log('sdk-package: contents, reproducibility, isolated runtime, declarations, shared peers passed');
console.log(JSON.stringify(evidence));

// B5a-1: export contract for @muslim-ummah/offline-navigation. Static manifest + import-graph checks, a
// package-name type probe through `exports` (bundler resolution, as Metro/Expo use), and a compiled headless
// runtime check. Source-only package: no consumer installation or Metro bundling is exercised here.
import { strict as assert } from 'node:assert';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pkgDir = join(root, 'packages/offline-navigation');
const pkg = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8'));
const tsc = join(root, 'node_modules/typescript/bin/tsc');
const tmp = mkdtempSync(join(tmpdir(), 'sdk-exports-'));
let passed = 0;
const check = (name, fn) => { fn(); passed++; console.log(`  ok - ${name}`); };
const imports = (f) => [...readFileSync(f, 'utf8').matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g)].map((m) => m[1]);
const resolveRel = (from, spec) => ['.ts', '.tsx', '/index.ts'].map((x) => resolve(dirname(from), spec) + x).find(existsSync);
const tscRun = (args) => spawnSync(process.execPath, [tsc, ...args], { cwd: tmp, encoding: 'utf8' });
const UI_COMPONENTS = readdirSync(join(pkgDir, 'src/ui')).filter((f) => f.endsWith('.tsx')).map((f) => f.slice(0, -4));

try {
  check('manifest: private scoped 0.x package with optional react/react-native peers', () => {
    assert.equal(pkg.name, '@muslim-ummah/offline-navigation');
    assert.equal(pkg.private, true);
    assert.match(pkg.version, /^0\.\d+\.\d+$/);
    assert.deepEqual(Object.keys(pkg.peerDependencies).sort(), ['@maplibre/maplibre-react-native', 'react', 'react-native']);
    for (const peer of Object.keys(pkg.peerDependencies)) assert.equal(pkg.peerDependenciesMeta[peer].optional, true, peer);
    assert.equal(pkg.dependencies, undefined);
  });
  check('every entrypoint the manifest names exists; only ".", "./session", "./ui", "./maplibre" are public', () => {
    assert.deepEqual(Object.keys(pkg.exports), ['.', './session', './ui', './maplibre', './package.json']);
    const targets = [pkg.main, pkg.types, pkg['react-native'], ...Object.values(pkg.exports).flatMap((v) => typeof v === 'string' ? [v] : Object.values(v))];
    for (const t of targets) assert.ok(existsSync(join(pkgDir, t)), `missing ${t}`);
  });
  check(`UI entrypoint re-exports all ${UI_COMPONENTS.length} leaves and the focus hook`, () => {
    assert.equal(UI_COMPONENTS.length, 18);
    const reexports = imports(join(pkgDir, 'src/ui/index.ts')).map((s) => s.slice(2)).sort();
    assert.deepEqual(reexports, [...UI_COMPONENTS, 'useAccessibilityFocus', 'RouteStepCopy', 'EnglishNavigationCopy', 'NavigationScreenTypes'].sort());
  });
  check('headless entrypoint graph never reaches react/react-native or the UI layer', () => {
    const seen = new Set();
    const walk = (f) => {
      if (seen.has(f)) return;
      seen.add(f);
      for (const s of imports(f)) {
        assert.ok(s.startsWith('.'), `${relative(root, f)} imports '${s}'`);
        const next = resolveRel(f, s);
        assert.ok(next && !next.includes('/src/ui/'), `${relative(root, f)} -> '${s}'`);
        walk(next);
      }
    };
    walk(join(pkgDir, 'src/index.ts'));
    assert.ok(seen.size > 10);
  });
  check('no package file imports the host app or anything outside react, react-native, the package and (only under src/maplibre) MapLibre', () => {
    const walkDir = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walkDir(join(d, e.name)) : [join(d, e.name)]);
    for (const f of walkDir(join(pkgDir, 'src'))) for (const s of imports(f)) {
      if (s.startsWith('.')) assert.ok(resolve(dirname(f), s).startsWith(join(pkgDir, 'src')), `${relative(root, f)} escapes via '${s}'`);
      else if (s === '@maplibre/maplibre-react-native') assert.ok(f.startsWith(join(pkgDir, 'src/maplibre/')), `${relative(root, f)} imports MapLibre outside the maplibre entrypoint`);
      else assert.ok(s === 'react' || s === 'react-native', `${relative(root, f)} imports '${s}'`);
    }
  });

  // Package-name probe: a throwaway consumer whose node_modules links the package, type-checked with bundler resolution.
  mkdirSync(join(tmp, 'node_modules/@muslim-ummah'), { recursive: true });
  symlinkSync(pkgDir, join(tmp, 'node_modules/@muslim-ummah/offline-navigation'), 'dir');
  const probeArgs = ['--noEmit', '--strict', '--skipLibCheck', '--module', 'esnext', '--moduleResolution', 'bundler', '--target', 'es2020',
    '--jsx', 'react-native', '--types', 'react', '--typeRoots', join(root, 'node_modules/@types')];
  check('package-name imports of ".", "./session" and "./ui" type-check through exports', () => {
    writeFileSync(join(tmp, 'ok.ts'), [
      `import { runAStar, MinHeap, SpatialGrid, spatialHaversineM, isValidCoordinate, findVenuePath, validateVenueGraph, findStreetRouteToTargets, evaluateNavigationStart, createNavigationSession } from '@muslim-ummah/offline-navigation';`,
      `import { createNavigationSession as fromSession } from '@muslim-ummah/offline-navigation/session';`,
      `import { createMapLibreNavigationMap, buildOfflineBasemapStyle } from '@muslim-ummah/offline-navigation/maplibre';`,
      `import { ${UI_COMPONENTS.join(', ')}, useAccessibilityFocus } from '@muslim-ummah/offline-navigation/ui';`,
      `export const all = [runAStar, MinHeap, SpatialGrid, spatialHaversineM, isValidCoordinate, findVenuePath, validateVenueGraph, findStreetRouteToTargets, evaluateNavigationStart, createNavigationSession, fromSession, createMapLibreNavigationMap, buildOfflineBasemapStyle, ${UI_COMPONENTS.join(', ')}, useAccessibilityFocus];`,
      `export const same: typeof createNavigationSession = fromSession;`,
    ].join('\n'));
    const r = tscRun([...probeArgs, 'ok.ts']);
    assert.equal(r.status, 0, r.stdout + r.stderr);
  });
  check('private internals and the UI-from-root path are not reachable by package name', () => {
    writeFileSync(join(tmp, 'bad.ts'), [
      `import { findVenuePath } from '@muslim-ummah/offline-navigation/src/domain/venue/VenueRouting';`,
      `import { GateChooser, createMapLibreNavigationMap } from '@muslim-ummah/offline-navigation';`,
      `export const x = [findVenuePath, GateChooser, createMapLibreNavigationMap];`,
    ].join('\n'));
    const out = tscRun([...probeArgs, 'bad.ts']).stdout;
    assert.match(out, /bad\.ts\(1,.*TS2307/);
    assert.match(out, /bad\.ts\(2,.*TS2305/);
    assert.match(out, /createMapLibreNavigationMap/); // the root does not export the MapLibre adapter either
  });
  check('compiled headless entrypoint runs in plain Node without loading react/react-native', () => {
    const out = join(tmp, 'cjs');
    const r = tscRun([join(pkgDir, 'src/index.ts'), '--outDir', out, '--rootDir', join(pkgDir, 'src'), '--module', 'commonjs',
      '--moduleResolution', 'node10', '--target', 'es2020', '--strict', '--skipLibCheck', '--types', 'node', '--typeRoots', join(root, 'node_modules/@types')]);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    writeFileSync(join(out, 'package.json'), '{"type":"commonjs"}');
    const req = createRequire(join(out, 'index.js'));
    const sdk = req('./index.js');
    for (const n of ['runAStar', 'findVenuePath', 'findStreetRouteToTargets', 'createNavigationSession', 'evaluateNavigationStart']) assert.equal(typeof sdk[n], 'function', n);
    assert.ok(!Object.keys(req.cache).some((k) => /node_modules[\\/](react|react-native|@maplibre)[\\/]/.test(k)));
  });
  console.log(`sdk-exports: ${passed} checks passed`);
} catch (e) {
  console.error(`sdk-exports: FAIL - ${e.message}`);
  process.exitCode = 1;
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

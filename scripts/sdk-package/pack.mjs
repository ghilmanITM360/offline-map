// Build an allowlisted, compiled private artifact outside the checkout. Workspace exports stay source-based.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const pkgDir = join(root, 'packages/offline-navigation');
assert.ok(process.argv[2], 'usage: node scripts/sdk-package/pack.mjs <outside-repository-output-directory>');
const out = resolve(process.argv[2]);
const rel = relative(root, out);
assert.ok(rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel), 'output must be outside the repository');
mkdirSync(out, { recursive: true });
const stage = mkdtempSync(join(out, 'stage-'));
function run(cmd, args, cwd = stage) {
  const result = spawnSync(cmd, args, { cwd, encoding: 'utf8', env: { PATH: process.env.PATH } });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  return result.stdout;
}
run(process.execPath, [join(root, 'node_modules/typescript/bin/tsc'), '--project', join(pkgDir, 'tsconfig.build.json'), '--outDir', join(stage, 'dist')]);
const source = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8'));
assert.equal(source.private, true);
const exports = Object.fromEntries(Object.entries(source.exports).map(([key, value]) => [key,
  typeof value === 'string' ? value : {
    types: value.types.replace('./src/', './dist/').replace(/\.tsx?$/, '.d.ts'),
    default: value.default.replace('./src/', './dist/').replace(/\.tsx?$/, '.js'),
  },
]));
const manifest = { ...source, main: exports['.'].default, types: exports['.'].types,
  'react-native': exports['.'].default, exports, files: ['dist'] };
writeFileSync(join(stage, 'package.json'), JSON.stringify(manifest, null, 2) + '\n');
// Apache-2.0 section 4(a): whoever receives the package gets the licence text (verbatim apache.org LICENSE-2.0, checked by test:sdk-package).
copyFileSync(join(pkgDir, 'LICENSE'), join(stage, 'LICENSE'));
const inspection = JSON.parse(run('npm', ['pack', '--dry-run', '--json', '--ignore-scripts']))[0];
for (const file of inspection.files) assert.ok(file.path === 'package.json' || file.path === 'LICENSE' || /^dist\/.*\.(js|d\.ts)$/.test(file.path), `unexpected artifact file: ${file.path}`);
for (const target of [manifest.main, manifest.types, ...Object.values(exports).flatMap((value) => typeof value === 'string' ? [value] : Object.values(value))]) assert.ok(existsSync(join(stage, target)), `missing entrypoint ${target}`);
writeFileSync(join(out, 'pack-dry-run.json'), JSON.stringify(inspection, null, 2) + '\n');
const packed = JSON.parse(run('npm', ['pack', '--json', '--ignore-scripts', '--pack-destination', out]))[0];
console.log(join(out, packed.filename));

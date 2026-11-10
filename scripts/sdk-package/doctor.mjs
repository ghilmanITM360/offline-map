// One command that tells an engineer on a fresh checkout whether this Mac can reproduce the SDK: toolchain, installed dependencies, the committed
// inputs (basemap, pack pins) and, optionally, the build. Read-only; installs and downloads nothing.
//   npm run sdk:doctor            checks only
//   npm run sdk:doctor -- --build runs typecheck, the SDK package proof and both delivery builds (into a temporary folder outside the repository)
// Machine-installed tools (Xcode, Android SDK, CocoaPods) are reported as OPTIONAL: they are needed for native builds only, never installed by Git.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const sh = (cmd, args, cwd = root) => spawnSync(cmd, args, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const rows = [];
const check = (name, ok, detail = '', optional = false) => rows.push({ name, ok, detail, optional });
const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');

const want = readFileSync(join(root, '.nvmrc'), 'utf8').trim().replace(/^v/, '');
check('node', process.versions.node === want, `have ${process.versions.node}, CI and delivery use ${want} (.nvmrc)`);
check('npm', Number(sh('npm', ['-v']).stdout.split('.')[0]) >= 10, sh('npm', ['-v']).stdout.trim());
check('git repository', sh('git', ['rev-parse', 'HEAD']).status === 0, sh('git', ['rev-parse', 'HEAD']).stdout.trim());
check('no Git LFS needed', !readFileSync(join(root, '.gitattributes'), 'utf8').includes('filter=lfs'), 'every asset is a normal Git object');
check('dependencies installed (npm ci)', existsSync(join(root, 'node_modules/.package-lock.json')), 'run: npm ci');
check('root lockfile and example app manifest committed', existsSync(join(root, 'examples/expo-consumer/package.json')) && sh('git', ['ls-files', '--error-unmatch', 'package-lock.json']).status === 0, 'package-lock.json');

const prov = JSON.parse(readFileSync(join(root, 'assets/offline-map/BASEMAP_PROVENANCE.json'), 'utf8'));
const base = join(root, 'assets/offline-map/ijtema-basemap.pmtiles');
const want256 = JSON.stringify(prov).match(/"sha256":\s*"([0-9a-f]{64})"/)?.[1];
check('basemap present and matches provenance', existsSync(base) && sha(base) === want256, want256?.slice(0, 12));
for (const f of ['karachi-ijtema-1.1.0.pin.json', 'synthetic-demo-venue-1.1.0.pin.json']) check(`pack pin ${f}`, existsSync(join(root, 'scripts/sdk-pack', f)));
const dirty = sh('git', ['status', '--porcelain', '--untracked-files=no']).stdout.trim();
check('tracked tree clean (delivery builds name their source commit)', dirty === '', dirty ? 'tracked files differ from HEAD' : '');

const tool = (name, cmd, args) => { const r = sh(cmd, args); check(`${name} (native builds only)`, r.status === 0, (r.stdout || r.stderr).split('\n')[0], true); };
tool('Xcode', 'xcodebuild', ['-version']);
tool('Java', 'java', ['-version']);
tool('CocoaPods', 'pod', ['--version']);
check('Android SDK (native builds only)', Boolean(process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || existsSync(join(process.env.HOME ?? '', 'Library/Android/sdk'))), '', true);

if (process.argv.includes('--build') && rows.every((r) => r.ok || r.optional)) {
  const out = mkdtempSync(join(tmpdir(), 'sdk-doctor-'));
  for (const [name, args] of [['typecheck', ['run', 'typecheck']], ['sdk package proof', ['run', 'test:sdk-package']], ['internal delivery', ['run', 'sdk:bundle', '--', join(out, 'internal'), '--profile', 'internal']], ['external delivery', ['run', 'sdk:bundle', '--', join(out, 'external'), '--profile', 'external']]]) {
    const r = sh('npm', args);
    check(name, r.status === 0, r.status === 0 ? r.stdout.trim().split('\n').pop().slice(0, 160) : (r.stdout + r.stderr).slice(-400));
  }
  console.log(`build outputs: ${out}`);
}

for (const r of rows) console.log(`${r.ok ? 'ok  ' : r.optional ? 'warn' : 'FAIL'} ${r.name}${r.detail ? ` - ${r.detail}` : ''}`);
const failed = rows.filter((r) => !r.ok && !r.optional);
console.log(failed.length ? `sdk:doctor: ${failed.length} required check(s) FAILED` : 'sdk:doctor: all required checks passed');
process.exit(failed.length ? 1 : 0);

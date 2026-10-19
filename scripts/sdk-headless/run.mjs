// B2c: compile the headless consumer with the installed tsc into a private temp dir, run it in a plain Node
// process (scrubbed env, no tsx), and statically guard the domain's imports. Exit nonzero on any failure.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const domain = join(root, 'packages/offline-navigation/src/domain');
const out = mkdtempSync(join(tmpdir(), 'sdk-headless-'));

const fail = (msg) => { console.error(`sdk-headless: FAIL - ${msg}`); process.exitCode = 1; };

try {
  // Bounded static guard (the runtime run below is the real proof): relative imports only, no clock/randomness.
  const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]);
  for (const f of walk(domain).filter((p) => p.endsWith('.ts'))) {
    const src = readFileSync(f, 'utf8');
    for (const [, spec] of src.matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g)) {
      if (!spec.startsWith('.')) fail(`${relative(root, f)} imports non-relative '${spec}'`);
      else if (!resolve(dirname(f), spec).startsWith(domain)) fail(`${relative(root, f)} escapes the domain via '${spec}'`);
    }
    if (/Date\.now|new Date\(|Math\.random|performance\.now/.test(src)) fail(`${relative(root, f)} reads clock/randomness`);
  }
  if (process.exitCode) throw new Error('static guard failed');

  const tsc = join(root, 'node_modules/typescript/bin/tsc');
  const build = spawnSync(process.execPath, [
    tsc, join(root, 'scripts/sdk-headless/consumer.ts'),
    '--outDir', out, '--rootDir', root, '--module', 'commonjs', '--moduleResolution', 'node10',
    '--target', 'es2020', '--strict', '--skipLibCheck', '--types', 'node', '--typeRoots', join(root, 'node_modules/@types'),
  ], { cwd: root, encoding: 'utf8' });
  if (build.status !== 0) { console.error(build.stdout + build.stderr); throw new Error('tsc failed'); }
  writeFileSync(join(out, 'package.json'), '{"type":"commonjs"}');

  const run = spawnSync(process.execPath, [join(out, 'scripts/sdk-headless/consumer.js')], {
    cwd: out, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    env: { PATH: process.env.PATH }, // no secrets, no NODE_OPTIONS (so no tsx loader), no project cwd
  });
  process.stdout.write(run.stdout);
  if (run.status !== 0) { process.stderr.write(run.stderr); throw new Error(`consumer exited ${run.status}`); }
} catch (e) {
  fail(e.message);
} finally {
  rmSync(out, { recursive: true, force: true });
}

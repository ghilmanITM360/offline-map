// Assemble the private release-candidate delivery bundle OUTSIDE the repository: the packed tarball, the client documents, the
// working consumer app sources (with the sample basemap), checksums and a manifest. Nothing is published or sent anywhere.
//   node scripts/sdk-package/bundle.mjs <fresh directory outside the repository> [--allow-dirty] [--profile internal|external]
// internal: the owner-controlled Karachi preset + the synthetic venue (NOT cleared for external distribution). external: synthetic data only.
// The archive is written by scripts/sdk-package/tar.mjs (pure Node), never by the host `tar`, so it holds exactly the declared files.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inventoryFromLock, renderInventory } from './inventory.mjs';
import { auditEntries, readTarGz, writeTarGz } from './tar.mjs';
import { buildVenueTool } from './venue-tool.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
assert.ok(process.argv[2], 'usage: node scripts/sdk-package/bundle.mjs <fresh outside-repository directory>');
const out = resolve(process.argv[2]);
const rel = relative(root, out);
assert.ok(rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel), 'output must be outside the repository');
assert.ok(!existsSync(out) || readdirSync(out).length === 0, 'use a fresh, empty bundle directory');
assert.ok(!existsSync(`${out}.tgz`) && !existsSync(`${out}.verification`), 'use fresh archive and verification paths');
const gitHead = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).stdout.trim();
const dirty = spawnSync('git', ['status', '--porcelain', '--untracked-files=no'], { cwd: root, encoding: 'utf8' }).stdout.trim();
assert.ok(process.argv.includes('--allow-dirty') || dirty === '', `tracked files differ from HEAD ${gitHead.slice(0, 7)}; commit first so the delivery names the source it was built from (or pass --allow-dirty for a throwaway build)`);
const profile = process.argv.includes('--profile') ? process.argv[process.argv.indexOf('--profile') + 1] : 'internal';
assert.ok(['internal', 'external'].includes(profile), '--profile must be internal or external');
const deliveryId = `delivery-${gitHead.slice(0, 7)}${profile === 'external' ? '-external' : ''}`; // the archive's top-level folder: identical for identical sources, whatever directory built it
mkdirSync(out, { recursive: true });

const run = (cmd, args, cwd = root) => {
  const r = spawnSync(cmd, args, { cwd, encoding: 'utf8', env: { PATH: process.env.PATH, HOME: process.env.HOME, CI: '1', COPYFILE_DISABLE: '1' }, maxBuffer: 64 * 1024 * 1024 });
  assert.equal(r.status, 0, `${cmd} ${args.join(' ')}\n${r.stdout}\n${r.stderr}`);
  return r.stdout;
};
const sha256 = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');
const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));

// 1. The artifact: the same reproducible tarball test:sdk-package proves (packed twice, byte-identical).
const scratch = mkdtempSync(join(out, '.scratch-'));
const first = run(process.execPath, [join(root, 'scripts/sdk-package/pack.mjs'), join(scratch, 'a')]).trim().split('\n').pop();
const second = run(process.execPath, [join(root, 'scripts/sdk-package/pack.mjs'), join(scratch, 'b')]).trim().split('\n').pop();
assert.equal(sha256(first), sha256(second), 'the tarball must be byte-reproducible');
const tarName = first.split(sep).pop();
const tarSha = sha256(first);
mkdirSync(join(out, 'package'), { recursive: true });
cpSync(first, join(out, 'package', tarName));

// 2. The archive allowlist, read by the raw TAR parser: only package.json, the licence, the Expo plugin, the Metro helper and compiled dist/.
const sdkEntries = readTarGz(first);
for (const entry of sdkEntries) assert.ok(/^package\/(package\.json|LICENSE|app\.plugin\.js|metro\.js|metro\.d\.ts|plugin\/[A-Za-z]+\.js|dist\/.*\.(js|d\.ts))$/.test(entry.path) && entry.type === '0', `unexpected archive entry: ${entry.path}`);
assert.deepEqual(auditEntries(sdkEntries), [], 'the SDK tarball must be clean');

// 2b. The iOS location-precision native module (a separate, tiny npm package) and the venue pack tool, both reproducible.
const iosA = run(process.execPath, [join(root, 'scripts/sdk-package/pack-ios-precision.mjs'), join(scratch, 'ios-a')]).trim().split('\n').pop();
const iosB = run(process.execPath, [join(root, 'scripts/sdk-package/pack-ios-precision.mjs'), join(scratch, 'ios-b')]).trim().split('\n').pop();
assert.equal(sha256(iosA), sha256(iosB), 'the iOS precision tarball must be byte-reproducible');
const iosName = iosA.split(sep).pop();
const iosSha = sha256(iosA);
cpSync(iosA, join(out, 'package', iosName));
assert.deepEqual(auditEntries(readTarGz(iosA)), [], 'the iOS precision tarball must be clean');
mkdirSync(join(out, 'tools/venue-pack'), { recursive: true });
await buildVenueTool(join(scratch, 'tool-a.cjs'));
await buildVenueTool(join(scratch, 'tool-b.cjs'));
assert.equal(sha256(join(scratch, 'tool-a.cjs')), sha256(join(scratch, 'tool-b.cjs')), 'the venue tool must be byte-reproducible');
cpSync(join(scratch, 'tool-a.cjs'), join(out, 'tools/venue-pack/venue-pack.cjs'));

// 3. Independent reinstall of the artifact alone into an empty project: the headless entrypoint must load in plain Node.
const probe = join(scratch, 'probe');
mkdirSync(probe);
writeFileSync(join(probe, 'package.json'), JSON.stringify({ name: 'probe', version: '0.0.0', private: true }));
run('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', '--no-package-lock', first], probe);
const loaded = run(process.execPath, ['-e', "const m=require('@muslim-ummah/offline-navigation'); console.log(typeof m.createNavigationController, typeof m.createPackManager)"], probe).trim();
assert.equal(loaded, 'function function');
const extras = run(process.execPath, ['-e', "const m=require('@muslim-ummah/offline-navigation/metro'); const c=m.withOfflineNavigation({resolver:{assetExts:['png']}}); console.log(c.resolver.assetExts.join(','))"], probe).trim();
assert.equal(extras, 'png,pmtiles,packfile');

// 4. Documents and the working example (without installs, builds or generated native projects).
mkdirSync(join(out, 'docs'), { recursive: true });
for (const f of readdirSync(join(root, 'docs/sdk/client'))) cpSync(join(root, 'docs/sdk/client', f), join(out, 'docs', f));
cpSync(join(root, 'docs/sdk/OFFLINE_PACK_SPEC.md'), join(out, 'docs/OFFLINE_PACK_SPEC.md'));
for (const f of ['FINAL_GO_NO_GO.md', 'FINAL_CLOSURE_LEDGER.md', 'CODEX_AUDIT_REMEDIATION.md']) cpSync(join(root, 'docs/sdk', f), join(out, 'docs', f));
// The delivery's docs/ is flat and the example app sits beside it, so repository-relative links are rewritten to where the files really are.
for (const f of readdirSync(join(out, 'docs')).filter((n) => n.endsWith('.md'))) {
  const text = readFileSync(join(out, 'docs', f), 'utf8')
    .replaceAll('](../../../examples/', '](../examples/')
    .replace(/\]\(\.\.\/([A-Z0-9_]+\.md)(#[^)]*)?\)/g, (whole, name, hash = '') => (existsSync(join(out, 'docs', name)) ? `](${name}${hash})` : whole));
  writeFileSync(join(out, 'docs', f), text);
}
// Generated native projects live at the example's top level only; modules/*/ios is real source and must ship.
const skip = /(^|\/)(node_modules|\.expo|sdk\.tgz|package-lock\.json|\._[^/]*|__MACOSX)(\/|$)|^(ios|android)(\/|$)|^export-/;
cpSync(join(root, 'examples/expo-consumer'), join(out, 'examples/expo-consumer'), { recursive: true, filter: (p) => !skip.test(relative(join(root, 'examples/expo-consumer'), p)) });
// One pack table per delivery: the external profile ships the synthetic-only table and nothing of the Karachi survey.
if (profile === 'external') cpSync(join(out, 'examples/expo-consumer/bundledPackTable.external.ts'), join(out, 'examples/expo-consumer/bundledPackTable.ts'));
rmSync(join(out, 'examples/expo-consumer/bundledPackTable.external.ts'));
// The synthetic example venue for the pack tool, with the same sample basemap the example app ships (a pack needs a map archive).
cpSync(join(root, 'examples/synthetic-venue'), join(out, 'examples/synthetic-venue'), { recursive: true, filter: (p) => !/(^|\/)(\._[^/]*|\.DS_Store)$/.test(p) });
mkdirSync(join(out, 'examples/synthetic-venue/input/map'), { recursive: true });
const archive = join(root, 'assets/offline-map/ijtema-basemap.pmtiles');
cpSync(archive, join(out, 'examples/synthetic-venue/input/map/basemap.pmtiles'));
const provenance = JSON.parse(readFileSync(join(root, 'assets/offline-map/BASEMAP_PROVENANCE.json'), 'utf8'));
assert.equal(sha256(archive), provenance.archive.sha256, 'the sample archive must match its provenance');
mkdirSync(join(out, 'examples/expo-consumer/assets'), { recursive: true });
cpSync(archive, join(out, 'examples/expo-consumer/assets/karachi-basemap.pmtiles'));
cpSync(join(root, 'assets/offline-map/BASEMAP_PROVENANCE.json'), join(out, 'examples/expo-consumer/assets/BASEMAP_PROVENANCE.json'));
// Compile tracked sources, never copy ignored checkout assets. Pins and shared archive bytes are authoritative.
const packTable = readFileSync(join(out, 'examples/expo-consumer/bundledPackTable.ts'), 'utf8');
for (const [venue, script] of [['karachi-ijtema', 'karachi.ts'], ['synthetic-demo-venue', 'demo.ts']].filter(([v]) => profile === 'internal' || v === 'synthetic-demo-venue')) {
  const built = join(scratch, 'packs', venue);
  run(process.execPath, ['--import', 'tsx', join(root, 'scripts/sdk-pack', script), built, '--preset']);
  const pin = JSON.parse(readFileSync(join(root, 'scripts/sdk-pack', `${venue}-1.1.0.pin.json`), 'utf8'));
  assert.equal(sha256(join(built, 'pack.manifest.json')), pin.manifestSha256, `${venue}: manifest pin changed`);
  assert.ok(packTable.includes(`packId: '${pin.packId}'`) && packTable.includes(`manifestSha256: '${pin.manifestSha256}'`), `${venue}: consumer pin changed`);
  for (const resource of pin.resources) {
    assert.equal(statSync(join(built, resource.path)).size, resource.bytes, resource.path);
    assert.equal(sha256(join(built, resource.path)), resource.sha256, resource.path);
  }
  for (const path of ['pack.manifest.json', ...pin.resources.map((r) => r.path)]) {
    if (path === 'map/ijtema-basemap.pmtiles') {
      assert.equal(sha256(join(built, path)), provenance.archive.sha256);
      continue;
    }
    const asset = `${path.replaceAll('/', '__')}.packfile`;
    assert.ok(packTable.includes(`'${path}': require('./assets/packs/${venue}/${asset}')`), `${venue}: missing consumer reference ${path}`);
    mkdirSync(join(out, 'examples/expo-consumer/assets/packs', venue), { recursive: true });
    cpSync(join(built, path), join(out, 'examples/expo-consumer/assets/packs', venue, asset));
  }
}
cpSync(first, join(out, 'examples/expo-consumer/sdk.tgz'));
cpSync(iosA, join(out, 'examples/expo-consumer/ios-precision.tgz'));
copyFileSync(join(root, 'packages/offline-navigation/LICENSE'), join(out, 'LICENSE'));

// 4b. A reviewed, reproducible consumer install: resolve the example's pinned dependencies once, against THIS tarball, and ship the lockfile.
// `npm ci` with it installs exactly this graph; `--dry-run` proves the lockfile and package.json agree. Only registry metadata is read.
const lockDir = join(scratch, 'lock');
mkdirSync(lockDir);
for (const f of ['package.json']) cpSync(join(root, 'examples/expo-consumer', f), join(lockDir, f));
cpSync(first, join(lockDir, 'sdk.tgz'));
cpSync(iosA, join(lockDir, 'ios-precision.tgz'));
run('npm', ['install', '--package-lock-only', '--ignore-scripts', '--no-audit', '--no-fund'], lockDir);
run('npm', ['ci', '--dry-run', '--ignore-scripts', '--no-audit', '--no-fund'], lockDir);
const lockFile = join(lockDir, 'package-lock.json');
const lock = JSON.parse(readFileSync(lockFile, 'utf8'));
assert.ok(lock.packages['node_modules/@muslim-ummah/offline-navigation']?.resolved?.startsWith('file:'), 'the lockfile must pin the packed tarball');
cpSync(lockFile, join(out, 'examples/expo-consumer/package-lock.json'));
writeFileSync(join(out, 'docs/DEPENDENCY_INVENTORY.md'), renderInventory(inventoryFromLock(lock), {
  title: 'JavaScript dependency and licence inventory (consumer app)', tarballSha256: tarSha, lockSha256: sha256(lockFile),
}));
rmSync(scratch, { recursive: true, force: true });

// The consumer must carry no native module sources of its own: the iOS module arrives from its tarball, the plugin from the SDK.
for (const f of ['modules', 'plugins', 'sdk.tgz', 'ios-precision.tgz', 'package-lock.json']) assert.equal(existsSync(join(out, 'examples/expo-consumer', f)), f !== 'modules' && f !== 'plugins', `${f} in the example app`);

// 5. Hygiene: no personal paths, secrets or unrelated files in anything text.
const textFiles = walk(out).filter((f) => /\.(md|json|ts|tsx|js|mjs|swift|podspec|txt)$/.test(f));
const forbidden = [/\/Users\/[A-Za-z]/, /ghilman/i, /BEGIN [A-Z ]*PRIVATE KEY/, /AKIA[0-9A-Z]{16}/, /\.env\b/];
for (const f of textFiles) {
  const text = readFileSync(f, 'utf8');
  for (const pattern of forbidden) assert.ok(!pattern.test(text), `${relative(out, f)} contains ${pattern}`);
}

// 6. Manifest, checksums and the go/no-go pointer.
const version = JSON.parse(readFileSync(join(root, 'packages/offline-navigation/package.json'), 'utf8')).version;
const files = walk(out).map((f) => relative(out, f)).sort();
const entries = files.map((f) => ({ path: f, bytes: statSync(join(out, f)).size, sha256: sha256(join(out, f)) }));
const info = {
  name: '@muslim-ummah/offline-navigation', version, deliveryId, status: 'release candidate with outstanding acceptance (see docs/SECURITY_AND_VALIDATION_REPORT.md)',
  profile,
  distribution: profile === 'internal' ? 'internal: contains the owner-controlled Karachi preset; NOT cleared for external distribution' : 'external-shareable: synthetic venue data only; no Karachi survey data',
  supersedes: { deliveryId: 'delivery-b9cd118', sha256: '28fe810b95bd279cb05bd69556b8690c3133cc3f4c445f42691f5f847b154069', reason: 'candidate 2 (SDK 0.1.0); kept unchanged as history' },
  sourceCommit: gitHead, tarball: { file: `package/${tarName}`, sha256: tarSha },
  iosPrecisionTarball: { file: `package/${iosName}`, sha256: iosSha },
  generatedBy: 'scripts/sdk-package/bundle.mjs', published: false,
};
writeFileSync(join(out, 'manifest.json'), JSON.stringify({ ...info, files: entries }, null, 2) + '\n');
writeFileSync(join(out, 'CHECKSUMS.txt'), entries.map((e) => `${e.sha256}  ${e.path}`).join('\n') + '\n');
writeFileSync(join(out, 'README.txt'), `Muslim Ummah Offline Navigation SDK ${version} - private release candidate (${deliveryId})

Start at docs/QUICK_START.md (the one onboarding path). What is in this delivery:

  LIBRARY (install these)
    package/${tarName}      the SDK
    package/${iosName}      iOS location-precision native module (Expo apps on iOS)
  CLIENT TOOL (run these)
    tools/venue-pack/venue-pack.cjs                    turns your surveyed venue data into a verified offline pack (docs/VENUE_PACK_TOOL.md)
  EXAMPLES (read, copy from, do not ship as is)
    examples/synthetic-venue/                          an invented venue and the spec that compiles it
    examples/expo-consumer/                            a working Expo app using only the packages above
  DOCUMENTS
    docs/                                              quick start, API reference, compatibility matrix, limits, checklist

Verify with: shasum -a 256 -c CHECKSUMS.txt (manifest.json, CHECKSUMS.txt and this README are not listed in it).
This bundle is NOT published anywhere. It carries outstanding physical-device and field acceptance: docs/SECURITY_AND_VALIDATION_REPORT.md.
${profile === 'internal'
  ? "PROFILE internal: the example app ships the owner's Karachi Ijtema preset pack for acceptance testing only. It is NOT cleared for external distribution; redistribution rights are an owner decision (docs/LICENSES_AND_NOTICES.md)."
  : 'PROFILE external: the example app ships only the invented synthetic venue (over an OpenStreetMap basemap, ODbL, with attribution). No Karachi survey data is in this delivery.'}
`);
// The archive: every file of the delivery, once, under one top-level folder, written by tar.mjs and then audited by the raw parser.
const everything = walk(out).map((f) => relative(out, f)).sort();
const archivePath = `${out}.tgz`;
const archiveSha = writeTarGz(everything.map((f) => ({ path: `${deliveryId}/${f}`, data: readFileSync(join(out, f)) })), archivePath);
assert.deepEqual(auditEntries(readTarGz(archivePath), new Set(everything.map((f) => `${deliveryId}/${f}`))), [], 'the delivery archive must hold exactly the declared files');
console.log(run(process.execPath, [join(root, 'scripts/sdk-package/test-bundle.mjs'), archivePath, `${out}.verification`]).trim());
console.log(`sdk-bundle: ${files.length} files, archive sha256 ${archiveSha}, tarball sha256 ${info.tarball.sha256}, commit ${info.sourceCommit}`);
console.log(archivePath);

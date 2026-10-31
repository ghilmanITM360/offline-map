// Regression for PostCSS source-map file disclosure, exercised against the installed build dependency.
// An optional consumer directory tests its independently installed copy with the same hostile inputs.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

const project = resolve(process.argv[2] ?? '.');
const require = createRequire(join(project, 'package.json'));
const postcss = require('postcss');
let imagePackage = dirname(require.resolve('image-size'));
while (!existsSync(join(imagePackage, 'package.json')) ||
  JSON.parse(readFileSync(join(imagePackage, 'package.json'), 'utf8')).name !== 'image-size') {
  assert.notEqual(imagePackage, dirname(imagePackage), 'installed image-size package manifest missing');
  imagePackage = dirname(imagePackage);
}
// Exercise Metro's real CommonJS interop, not a hand-written image-size adapter. A subprocess bounds defective parsers.
const imageProbe = `
  const assert = require('node:assert/strict');
  const { createRequire } = require('node:module');
  const { dirname, join } = require('node:path');
  const req = createRequire(process.argv[1]);
  const metro = req(join(dirname(req.resolve('metro/package.json')), 'src/Assets.js'));
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6dX8AAAAASUVORK5CYII=', 'base64');
  assert.deepEqual(metro.getAssetSize('png', png, 'healthy.png'), { width: 1, height: 1 });
  const bad = Buffer.from(process.argv[2], 'hex');
  assert.throws(() => metro.getAssetSize('png', bad, 'renamed-malicious.png'));
`;
// A zero-length ICNS entry and a matching zero-length JXL partial stream must reject, even renamed .png.
for (const [format, hex] of [
  ['ICNS', '69636e73000000106963703400000000'],
  ['JXL', '0000000c4a584c200d0a870a0000000c667479706a786c20000000006a786c7000000000'],
]) {
  const result = spawnSync(process.execPath,
    ['--max-old-space-size=64', '-e', imageProbe, join(project, 'package.json'), hex],
    { encoding: 'utf8', timeout: 3000, killSignal: 'SIGKILL', maxBuffer: 1024 * 1024 });
  assert.equal(result.status, 0, `${format} must reject promptly through Metro: ${result.error?.code ?? result.signal ?? result.stderr.slice(-500)}`);
}
const fixture = mkdtempSync(join(tmpdir(), 'offline-sdk-postcss-'));
const canary = 'POSTCSS_EXTERNAL_MAP_CANARY';
try {
  mkdirSync(join(fixture, 'css'));
  const from = join(fixture, 'css/input.css');
  const mapPath = join(fixture, 'canary.map');
  writeFileSync(mapPath, JSON.stringify({
    version: 3, sources: ['canary.js'], names: [], mappings: 'AAAA', sourcesContent: [canary],
  }));
  for (const [annotation, options] of [
    ['../canary.map', { from }],
    [mapPath, {}],
  ]) {
    const css = `a{color:red}\n/*# sourceMappingURL=${annotation} */`;
    const parsed = postcss.parse(css, options);
    assert.ok(!parsed.source.input.map?.text?.includes(canary),
      `PostCSS must not read an external source map (${options.from ? 'with from' : 'without from'})`);
    assert.equal(postcss.parse(css, { ...options, map: false }).source.input.map, undefined);
  }
  // Preserve ordinary same-directory maps and the async plugin API used by Expo's CSS transformer.
  writeFileSync(join(fixture, 'css/input.css.map'), JSON.stringify({
    version: 3, sources: ['input.css'], names: [], mappings: 'AAAA', sourcesContent: ['a{color:red}'],
  }));
  assert.ok(postcss.parse('a{color:red}\n/*# sourceMappingURL=input.css.map */', { from }).source.input.map);
  const result = await postcss.default([{
    postcssPlugin: 'compatibility-probe',
    Declaration(declaration) {
      if (declaration.prop === 'color') declaration.value = 'blue';
    },
  }]).process('a{color:red}', { from, to: from, map: false });
  assert.equal(result.content, 'a{color:blue}');
  console.log(JSON.stringify({ project, postcss: require('postcss/package.json').version,
    imageSize: JSON.parse(readFileSync(join(imagePackage, 'package.json'), 'utf8')).version,
    checks: 10, result: 'PASS' }));
} finally {
  rmSync(fixture, { recursive: true, force: true });
}

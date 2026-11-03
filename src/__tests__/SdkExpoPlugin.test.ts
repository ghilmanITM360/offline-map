/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// The SDK's single Expo config plugin and Metro helper: option validation, early and readable failures, and the shipped entrypoints.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const pkgDir = path.resolve(__dirname, '../../packages/offline-navigation');
const plugin = require(path.join(pkgDir, 'app.plugin.js'));
const { withOfflineNavigation: withMetro, ASSET_EXTENSIONS } = require(path.join(pkgDir, 'metro.js'));
const { patchApplication, patchActivity, SUPPORTED_REACT_NATIVE } = require(path.join(pkgDir, 'plugin/androidFontScale.js'));
const pkg = JSON.parse(fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf8'));

describe('plugin options', () => {
  it('defaults to English, MapLibre on and the Android font fix on', () => {
    expect(plugin.resolveOptions()).toMatchObject({ languages: ['en'], maplibre: true, androidFontScaleFix: true });
    expect(plugin.resolveOptions({}).locationPermissionText).toMatch(/only while it is open/);
  });

  it('keeps the host\'s values and removes duplicate languages', () => {
    expect(plugin.resolveOptions({ locationPermissionText: 'Why', languages: ['en', 'ur', 'en', 'ur-Latn'], maplibre: false, androidFontScaleFix: false }))
      .toEqual({ locationPermissionText: 'Why', languages: ['en', 'ur', 'ur-Latn'], maplibre: false, androidFontScaleFix: false });
  });

  it.each([
    [{ locationPermisionText: 'typo' }, /unknown option "locationPermisionText"/],
    [{ locationPermissionText: '   ' }, /locationPermissionText/],
    [{ languages: [] }, /languages/],
    [{ languages: ['english!'] }, /languages/],
    [{ maplibre: 'yes' }, /maplibre.*true or false/],
    [{ androidFontScaleFix: 1 }, /androidFontScaleFix.*true or false/],
    [[], /must be an object/],
  ])('rejects %j with a message that names the option', (options, message) => {
    expect(() => plugin.resolveOptions(options)).toThrow(message);
    expect(() => plugin.resolveOptions(options)).toThrow('[@muslim-ummah/offline-navigation]');
  });
});

describe('plugin application', () => {
  it('names a missing peer instead of throwing a resolver stack', () => {
    const lonely = fs.mkdtempSync(path.join(os.tmpdir(), 'plugin-no-peers-'));
    try {
      const config = { name: 'x', slug: 'x', _internal: { projectRoot: lonely } };
      expect(() => plugin(config, {})).toThrow(/live navigation needs "expo-location" installed in the app/);
    } finally {
      fs.rmSync(lonely, { recursive: true, force: true });
    }
  });

  it('is exported by the package and the Android font fix still refuses any other React Native version', () => {
    expect(pkg.exports['./app.plugin.js']).toBe('./app.plugin.js');
    expect(pkg.files).toEqual(expect.arrayContaining(['app.plugin.js', 'plugin']));
    expect(SUPPORTED_REACT_NATIVE).toBe('0.81.5');
    for (const patch of [patchApplication, patchActivity]) expect(() => patch('class A {}', '0.82.0')).toThrow(/requires revalidation for RN 0\.82\.0; expected 0\.81\.5/);
  });
});

describe('Metro helper', () => {
  const base = () => ({ resolver: { assetExts: ['png', 'db'], sourceExts: ['ts'] }, watchFolders: ['/a'] });

  it('adds the basemap and pack file types, keeps everything else, and does not change its input', () => {
    const input = base();
    const out = withMetro(input);
    expect(out.resolver.assetExts).toEqual(['png', 'db', 'pmtiles', 'packfile']);
    expect(out.resolver.sourceExts).toEqual(['ts']);
    expect(out.watchFolders).toEqual(['/a']);
    expect(input).toEqual(base());
    expect(ASSET_EXTENSIONS).toEqual(['pmtiles', 'packfile']);
  });

  it('is idempotent and rejects a config without an asset list', () => {
    expect(withMetro(withMetro(base())).resolver.assetExts).toEqual(['png', 'db', 'pmtiles', 'packfile']);
    expect(() => withMetro({})).toThrow(/resolver\.assetExts/);
    expect(() => withMetro(undefined)).toThrow(/resolver\.assetExts/);
  });

  it('is a public export with declarations', () => {
    expect(pkg.exports['./metro']).toEqual({ types: './metro.d.ts', default: './metro.js' });
    expect(fs.existsSync(path.join(pkgDir, 'metro.d.ts'))).toBe(true);
  });
});

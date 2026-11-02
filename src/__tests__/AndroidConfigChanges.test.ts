/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { spawnSync } from 'node:child_process';

const root = path.resolve(__dirname, '..', '..');
const { addRequiredConfigChanges, REQUIRED_CONFIG_CHANGES } = require(path.join(root, 'plugins', 'withAndroidConfigChanges.js'));

// #259: a font-size or display-size change must not recreate MainActivity (the map crashes when it does).
describe('MainActivity handles font and display size changes itself', () => {
  it('the committed manifest declares them', () => {
    const manifest = fs.readFileSync(path.join(root, 'android/app/src/main/AndroidManifest.xml'), 'utf8');
    const activity = manifest.match(/<activity[^>]*android:name="\.MainActivity"[^>]*>/)?.[0] ?? '';
    const changes = (activity.match(/android:configChanges="([^"]*)"/)?.[1] ?? '').split('|');
    for (const name of REQUIRED_CONFIG_CHANGES) expect(changes).toContain(name);
  });

  it('the prebuild plugin adds them to a stock manifest and keeps the existing ones', () => {
    const stock = {
      manifest: {
        application: [{ activity: [{ $: { 'android:name': '.MainActivity', 'android:configChanges': 'keyboard|uiMode' } }] }],
      },
    };
    const changes = addRequiredConfigChanges(stock).manifest.application[0].activity[0].$['android:configChanges'].split('|');
    expect(changes).toEqual(expect.arrayContaining(['keyboard', 'uiMode', ...REQUIRED_CONFIG_CHANGES]));
    expect(new Set(changes).size).toBe(changes.length);
  });

  it('is registered in app.json', () => {
    const app = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8'));
    expect(app.expo.plugins).toContain('./plugins/withAndroidConfigChanges.js');
  });

  it('the independent consumer generates a manifest that keeps its journey through text/display size changes', () => {
    const result = spawnSync(process.execPath, [path.join(root, 'node_modules/expo/bin/cli'), 'config', '--type', 'introspect', '--json'], {
      cwd: path.join(root, 'examples/expo-consumer'), encoding: 'utf8', timeout: 15_000,
      env: { ...process.env, EXPO_NO_TELEMETRY: '1' },
    });
    expect({ status: result.status, error: result.error?.message, stderr: result.stderr }).toMatchObject({ status: 0 });
    const config = JSON.parse(result.stdout);
    const activities = config._internal.modResults.android.manifest.manifest.application[0].activity;
    const main = activities.find((activity: { $: Record<string, string> }) => activity.$['android:name'] === '.MainActivity');
    expect(main.$['android:configChanges'].split('|')).toEqual(expect.arrayContaining(['fontScale', 'smallestScreenSize', 'density']));
  }, 20_000);
});

// #394: exercise real prebuild because MainApplication/Activity mods are not introspective.
it('the delivered consumer generates native font invalidation without replacing the journey', () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'sdk-font-prebuild-'));
  try {
    for (const name of ['app.json', 'package.json', 'plugins']) {
      fs.cpSync(path.join(root, 'examples/expo-consumer', name), path.join(temporary, name), { recursive: true });
    }
    fs.symlinkSync(path.join(root, 'node_modules'), path.join(temporary, 'node_modules'), 'dir');
    const result = spawnSync(process.execPath, [path.join(root, 'node_modules/expo/bin/cli'), 'prebuild', '--platform', 'android', '--no-install', '--template', path.join(root, 'node_modules/expo/template.tgz')], {
      cwd: temporary, encoding: 'utf8', timeout: 30_000,
      env: { ...process.env, CI: '1', EXPO_OFFLINE: '1', EXPO_NO_TELEMETRY: '1', EXPO_NO_DOTENV: '1' },
    });
    expect({ status: result.status, stderr: result.stderr }).toMatchObject({ status: 0 });
    const java = path.join(temporary, 'android/app/src/main/java/com/example/sdkconsumer');
    const application = fs.readFileSync(path.join(java, 'MainApplication.kt'), 'utf8');
    const activity = fs.readFileSync(path.join(java, 'MainActivity.kt'), 'utf8');
    expect(application).toContain('enableFontScaleChangesUpdatingLayout() = true');
    expect(activity).toContain('reactDelegate?.reactRootView?.requestLayout()');
    expect(application).toContain('BuildConfig.IS_EDGE_TO_EDGE_ENABLED');
    expect(application).not.toContain('dangerouslyForceOverride');
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
}, 40_000);

const { patchApplication, patchActivity } = require(path.join(root, 'examples/expo-consumer/plugins/withAndroidFontScale.js'));
test.each([patchApplication, patchActivity])('native workaround rejects a changed RN version and is idempotent', (patch) => {
  const name = patch === patchApplication ? 'MainApplication' : 'MainActivity';
  const source = fs.readFileSync(path.join(root, `android/app/src/main/java/com/aicrafted/karachiijtema/${name}.kt`), 'utf8');
  expect(patch(source, '0.81.5')).toBe(source);
  expect(() => patch(source, '0.82.0')).toThrow('requires revalidation');
  expect(() => patch('class Unknown {}', '0.81.5')).toThrow('Unrecognized');
});

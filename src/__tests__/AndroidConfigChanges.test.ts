/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'fs';
import path from 'path';

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
});

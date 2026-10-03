/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { readFileSync } from 'fs';
import { join } from 'path';

// #163 PERM-001: the owner-confirmed launcher/display name is "Ijtema Map". These are the config files
// that decide what the launcher, the recents list and the OS permission dialog show; identifiers
// (package id, slug, bundle id) are deliberately not part of this check.
const root = join(__dirname, '..', '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

describe('#163 app display name', () => {
  it('Expo config name is Ijtema Map', () => {
    expect(JSON.parse(read('app.json')).expo.name).toBe('Ijtema Map');
  });

  it('Android launcher label (app_name) is Ijtema Map', () => {
    expect(read('android/app/src/main/res/values/strings.xml')).toContain('<string name="app_name">Ijtema Map</string>');
  });

  it('iOS display name is Ijtema Map', () => {
    expect(read('ios/KarachiIjtemaOfflineNav/Info.plist')).toMatch(/<key>CFBundleDisplayName<\/key>\s*<string>Ijtema Map<\/string>/);
  });

  it('location permission explanations name the app Ijtema Map, not an older variant', () => {
    const expo = JSON.parse(read('app.json')).expo;
    const location = expo.plugins.find((p: unknown) => Array.isArray(p) && p[0] === 'expo-location')[1];
    expect(location.locationWhenInUsePermission).toMatch(/^Ijtema Map /);
    expect(read('ios/KarachiIjtemaOfflineNav/Info.plist')).toContain('<string>Ijtema Map uses your location');
  });

  it('keeps the package, slug and bundle identifiers unchanged', () => {
    const expo = JSON.parse(read('app.json')).expo;
    expect(expo.slug).toBe('karachi-ijtema-offline-nav');
    expect(expo.android.package).toBe('com.aicrafted.karachiijtema');
    expect(expo.ios.bundleIdentifier).toBe('com.aicrafted.karachiijtema');
  });
});

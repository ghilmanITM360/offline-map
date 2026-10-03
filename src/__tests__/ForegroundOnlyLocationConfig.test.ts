/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { readFileSync } from 'fs';
import { join } from 'path';

// #148 owner decision: location is foreground-only (the app stops its GPS watch when it leaves the foreground and
// has no background task). The Expo config must not carry background-location settings.
const root = join(__dirname, '..', '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

describe('#148 foreground-only location config', () => {
  const expo = JSON.parse(read('app.json')).expo;
  const location = expo.plugins.find((p: unknown) => Array.isArray(p) && p[0] === 'expo-location')[1];

  it('has no always/background location permission text or background switches', () => {
    expect(location).not.toHaveProperty('locationAlwaysPermission');
    expect(location).not.toHaveProperty('locationAlwaysAndWhenInUsePermission');
    expect(location).not.toHaveProperty('isIosBackgroundLocationEnabled');
    expect(location).not.toHaveProperty('isAndroidBackgroundLocationEnabled');
  });

  it('keeps the when-in-use explanation', () => {
    expect(location.locationWhenInUsePermission).toMatch(/uses your location/);
  });

  it('the Android manifest asks for foreground location only', () => {
    const manifest = read('android/app/src/main/AndroidManifest.xml');
    expect(manifest).toContain('android.permission.ACCESS_FINE_LOCATION');
    expect(manifest).not.toContain('ACCESS_BACKGROUND_LOCATION');
  });
});

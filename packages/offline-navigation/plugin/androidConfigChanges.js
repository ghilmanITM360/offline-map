/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

const { withAndroidManifest } = require('expo/config-plugins');

// Without these, Android destroys and recreates MainActivity when the user changes the system font size or
// display size, and the native map view then fails with "Trying to resolve view with tag N which doesn't
// exist" (#259). React Native applies the new metrics itself when the activity is kept alive.
const REQUIRED_CONFIG_CHANGES = ['fontScale', 'smallestScreenSize', 'density'];

function addRequiredConfigChanges(androidManifest) {
  const activities = androidManifest.manifest.application?.[0]?.activity ?? [];
  const main = activities.find((activity) => activity.$?.['android:name'] === '.MainActivity');
  if (!main) return androidManifest;

  const current = (main.$['android:configChanges'] ?? '').split('|').filter(Boolean);
  main.$['android:configChanges'] = [...new Set([...current, ...REQUIRED_CONFIG_CHANGES])].join('|');
  return androidManifest;
}

function withAndroidConfigChanges(config) {
  return withAndroidManifest(config, (config) => {
    config.modResults = addRequiredConfigChanges(config.modResults);
    return config;
  });
}

module.exports = withAndroidConfigChanges;
module.exports.addRequiredConfigChanges = addRequiredConfigChanges;
module.exports.REQUIRED_CONFIG_CHANGES = REQUIRED_CONFIG_CHANGES;

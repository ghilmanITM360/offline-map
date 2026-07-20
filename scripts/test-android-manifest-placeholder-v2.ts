/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

// docs/SECURITY_AUDIT.md finding C2: app.config.js feeds the real (leaked) Google Maps
// API key into Expo's built-in withGoogleMapsApiKey plugin, which bakes it literally into
// AndroidManifest.xml on every `expo prebuild`. The committed manifest's ${googleMapsApiKey}
// placeholder (resolved safely at Gradle build time from .env, never committed) only holds
// until the next `expo prebuild --clean` re-bakes the real key — this plugin closes that gap.

const {
  replaceGoogleMapsApiKeyWithPlaceholder,
  META_API_KEY,
  PLACEHOLDER,
} = require('../plugins/withAndroidManifestGradlePlaceholder.js');

function fakeManifest(apiKeyValue: string) {
  return {
    manifest: {
      application: [
        {
          'meta-data': [
            { $: { 'android:name': META_API_KEY, 'android:value': apiKeyValue } },
            { $: { 'android:name': 'expo.modules.updates.ENABLED', 'android:value': 'false' } },
          ],
        },
      ],
    },
  };
}

// A leaked/real key fed in by app.config.js must always be rewritten to the placeholder,
// regardless of what literal value Expo's built-in plugin wrote first.
const rewritten = replaceGoogleMapsApiKeyWithPlaceholder(fakeManifest('AIzaSyREAL_LEAKED_KEY_VALUE'));
const rewrittenEntry = rewritten.manifest.application[0]['meta-data'].find(
  (item: any) => item.$['android:name'] === META_API_KEY,
);
assert.equal(rewrittenEntry.$['android:value'], PLACEHOLDER, 'A literal API key value must be rewritten to the Gradle placeholder');

// Idempotent: running it again (e.g. already-placeholder manifest) must not change anything.
const alreadyPlaceholder = replaceGoogleMapsApiKeyWithPlaceholder(fakeManifest(PLACEHOLDER));
const idempotentEntry = alreadyPlaceholder.manifest.application[0]['meta-data'].find(
  (item: any) => item.$['android:name'] === META_API_KEY,
);
assert.equal(idempotentEntry.$['android:value'], PLACEHOLDER, 'Plugin must be idempotent on an already-placeholder manifest');

// Must not throw or drop other meta-data entries when the API key entry is entirely absent.
const noKeyManifest = {
  manifest: { application: [{ 'meta-data': [{ $: { 'android:name': 'expo.modules.updates.ENABLED', 'android:value': 'false' } }] }] },
};
const untouched = replaceGoogleMapsApiKeyWithPlaceholder(noKeyManifest as any);
assert.equal(untouched.manifest.application[0]['meta-data'].length, 1, 'Plugin must not crash or mutate manifests with no API key meta-data entry');

// Registration: app.json must list the plugin (after the implicit built-in Google Maps
// plugin, i.e. anywhere in the plugins array — Expo applies built-in static-config mods
// before user plugins), and app.config.js must still feed the real key into
// android.config.googleMaps.apiKey for Gradle's manifestPlaceholders to have a value.
const appJson = JSON.parse(readFileSync('app.json', 'utf8'));
const plugins: unknown[] = appJson.expo.plugins ?? [];
const hasPlugin = plugins.some(
  (p) => p === './plugins/withAndroidManifestGradlePlaceholder.js' || (Array.isArray(p) && p[0] === './plugins/withAndroidManifestGradlePlaceholder.js'),
);
assert(hasPlugin, 'app.json must register ./plugins/withAndroidManifestGradlePlaceholder.js in its plugins array');

const appConfig = readFileSync('app.config.js', 'utf8');
assert(appConfig.includes('androidGoogleMapsApiKey'), 'app.config.js must still feed the real key into android.config.googleMaps.apiKey (Gradle needs a real value to resolve the placeholder against)');

// The committed manifest itself must already use the placeholder, not a literal key.
const manifestXml = readFileSync('android/app/src/main/AndroidManifest.xml', 'utf8');
assert(manifestXml.includes(`android:value="${PLACEHOLDER}"`), 'Committed AndroidManifest.xml must reference the Gradle placeholder, not a literal API key');

console.log('Android manifest placeholder v2 checks passed.');

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

const { withAndroidManifest } = require('@expo/config-plugins');

const META_API_KEY = 'com.google.android.geo.API_KEY';
const PLACEHOLDER = '${googleMapsApiKey}';

/**
 * Expo's built-in withGoogleMapsApiKey plugin (@expo/config-plugins/build/android/GoogleMapsApiKey.js)
 * bakes app.config.js's real `android.config.googleMaps.apiKey` value literally into
 * AndroidManifest.xml's com.google.android.geo.API_KEY meta-data on every `expo prebuild`.
 * android/app/build.gradle already resolves the real key at build time from .env via
 * `manifestPlaceholders = [googleMapsApiKey: ...]` and expects the manifest to reference
 * `${googleMapsApiKey}`, not a literal value — so this plugin runs after Expo's built-in
 * one (it must be listed last in app.config.js's plugins array) and rewrites the meta-data
 * back to the placeholder, making that safety survive `expo prebuild --clean` instead of
 * only holding until the next prebuild re-bakes the real key.
 */
function replaceGoogleMapsApiKeyWithPlaceholder(androidManifest) {
  const mainApplication = androidManifest.manifest.application?.[0];
  const metaData = mainApplication?.['meta-data'];
  if (!Array.isArray(metaData)) return androidManifest;

  const entry = metaData.find((item) => item.$?.['android:name'] === META_API_KEY);
  if (entry) {
    entry.$['android:value'] = PLACEHOLDER;
  }

  return androidManifest;
}

function withAndroidManifestGradlePlaceholder(config) {
  return withAndroidManifest(config, (config) => {
    config.modResults = replaceGoogleMapsApiKeyWithPlaceholder(config.modResults);
    return config;
  });
}

module.exports = withAndroidManifestGradlePlaceholder;
module.exports.replaceGoogleMapsApiKeyWithPlaceholder = replaceGoogleMapsApiKeyWithPlaceholder;
module.exports.META_API_KEY = META_API_KEY;
module.exports.PLACEHOLDER = PLACEHOLDER;

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// The one Expo config plugin for this SDK. In app.json:
//   "plugins": [["@muslim-ummah/offline-navigation", { "locationPermissionText": "...", "languages": ["en", "ur"] }]]
// It applies, in order: expo-location (foreground location only: Android permissions and the iOS usage string), the MapLibre plugin,
// the iOS language declarations, and the two Android settings the journey needs (MainActivity keeps running when the font or display
// size changes; React Native re-measures text when the font scale changes). Do not also list expo-location or the MapLibre plugin.
const { createRunOncePlugin, withInfoPlist, withStaticPlugin } = require('expo/config-plugins');
const pkg = require('../package.json');
const withAndroidConfigChanges = require('./androidConfigChanges');
const withAndroidFontScale = require('./androidFontScale');

const NAME = pkg.name;
const DEFAULT_LOCATION_TEXT = 'This app uses your location only while it is open, to follow your progress along a route.';
const KNOWN = ['locationPermissionText', 'languages', 'maplibre', 'androidFontScaleFix'];

class OfflineNavigationPluginError extends Error {
  constructor(message) {
    super(`[${NAME}] ${message}`);
    this.name = 'OfflineNavigationPluginError';
  }
}

/** Validates and completes the plugin options; throws for anything unknown so a typo cannot silently turn a setting off. */
function resolveOptions(props = {}) {
  if (typeof props !== 'object' || props === null || Array.isArray(props)) throw new OfflineNavigationPluginError('options must be an object');
  for (const key of Object.keys(props)) {
    if (!KNOWN.includes(key)) throw new OfflineNavigationPluginError(`unknown option "${key}"; supported options: ${KNOWN.join(', ')}`);
  }
  const { locationPermissionText = DEFAULT_LOCATION_TEXT, languages = ['en'], maplibre = true, androidFontScaleFix = true } = props;
  if (typeof locationPermissionText !== 'string' || locationPermissionText.trim() === '') throw new OfflineNavigationPluginError('"locationPermissionText" must be a non-empty string (it is the iOS permission prompt text)');
  if (!Array.isArray(languages) || languages.length === 0 || languages.some((l) => typeof l !== 'string' || !/^[A-Za-z]{2,3}(-[A-Za-z0-9]+)*$/.test(l))) {
    throw new OfflineNavigationPluginError('"languages" must be a non-empty list of language codes such as ["en", "ur"]');
  }
  for (const [name, value] of [['maplibre', maplibre], ['androidFontScaleFix', androidFontScaleFix]]) {
    if (typeof value !== 'boolean') throw new OfflineNavigationPluginError(`"${name}" must be true or false`);
  }
  return { locationPermissionText, languages: [...new Set(languages)], maplibre, androidFontScaleFix };
}

/** A peer the plugin applies must be installed in the app: say so plainly instead of a resolver stack trace. */
function requireInstalled(projectRoot, name, why) {
  try {
    require.resolve(`${name}/package.json`, { paths: [projectRoot] });
  } catch {
    throw new OfflineNavigationPluginError(`${why} needs "${name}" installed in the app (npx expo install ${name})`);
  }
}

function withOfflineNavigation(config, props) {
  const options = resolveOptions(props);
  const projectRoot = config._internal?.projectRoot ?? process.cwd();

  requireInstalled(projectRoot, 'expo-location', 'live navigation');
  config = withStaticPlugin(config, {
    projectRoot,
    plugin: ['expo-location', {
      locationWhenInUsePermission: options.locationPermissionText,
      locationAlwaysPermission: false,
      locationAlwaysAndWhenInUsePermission: false,
    }],
  });
  if (options.maplibre) {
    requireInstalled(projectRoot, '@maplibre/maplibre-react-native', 'the ready-made map');
    config = withStaticPlugin(config, { projectRoot, plugin: '@maplibre/maplibre-react-native' });
  }
  config = withInfoPlist(config, (mod) => {
    mod.modResults.CFBundleLocalizations = [...new Set([...(mod.modResults.CFBundleLocalizations ?? []), ...options.languages])];
    return mod;
  });
  config = withAndroidConfigChanges(config);
  return options.androidFontScaleFix ? withAndroidFontScale(config) : config;
}

module.exports = createRunOncePlugin(withOfflineNavigation, NAME, pkg.version);
module.exports.resolveOptions = resolveOptions;
module.exports.OfflineNavigationPluginError = OfflineNavigationPluginError;

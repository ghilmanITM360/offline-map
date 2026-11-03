/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// The host app takes the same native lifecycle fixes as the SDK's Expo plugin: the activity keeps running through font and display size
// changes, and React Native re-measures text when the font scale changes.
const withConfigChanges = require('../packages/offline-navigation/plugin/androidConfigChanges');
const withFontScale = require('../packages/offline-navigation/plugin/androidFontScale');

module.exports = (config) => withFontScale(withConfigChanges(config));
module.exports.addRequiredConfigChanges = withConfigChanges.addRequiredConfigChanges;
module.exports.REQUIRED_CONFIG_CHANGES = withConfigChanges.REQUIRED_CONFIG_CHANGES;

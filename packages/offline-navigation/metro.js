/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Metro setting for the offline map and venue packs: register their file types as assets. It adds to the config's own list; nothing else changes.
//   const { getDefaultConfig } = require('expo/metro-config');
//   module.exports = require('@muslim-ummah/offline-navigation/metro').withOfflineNavigation(getDefaultConfig(__dirname));
const ASSET_EXTENSIONS = ['pmtiles', 'packfile'];

function withOfflineNavigation(config) {
  const current = config?.resolver?.assetExts;
  if (!Array.isArray(current)) throw new Error('[@muslim-ummah/offline-navigation] pass a Metro config that has resolver.assetExts (for example the result of getDefaultConfig)');
  return { ...config, resolver: { ...config.resolver, assetExts: [...new Set([...current, ...ASSET_EXTENSIONS])] } };
}

module.exports = { withOfflineNavigation, ASSET_EXTENSIONS };

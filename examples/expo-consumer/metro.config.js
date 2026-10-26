// Stock Expo Metro config on purpose: the packed SDK must need no resolver, transformer or watchFolders tweaks.
// The one host setting is the app's own asset type: the bundled offline basemap archive.
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
config.resolver.assetExts = [...config.resolver.assetExts, 'pmtiles'];

module.exports = config;

// Stock Expo Metro config on purpose: the packed SDK must need no resolver, transformer or watchFolders tweaks.
// The one host setting is the app's own asset types: the bundled offline basemap archive and the venue-pack files.
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
config.resolver.assetExts = [...config.resolver.assetExts, 'pmtiles', 'packfile']; // packfile: bundled venue-pack files, copied byte-for-byte

module.exports = config;

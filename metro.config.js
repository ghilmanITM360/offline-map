const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
config.resolver.sourceExts = ['tsx', 'ts', 'jsx', 'js', 'json'];
// Bundled offline basemap archive (#140): shipped as an app asset, copied to app-private storage at first launch.
config.resolver.assetExts = [...config.resolver.assetExts, 'pmtiles'];

module.exports = config;

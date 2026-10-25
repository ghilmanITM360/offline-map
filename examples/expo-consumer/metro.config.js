// Stock Expo Metro config on purpose: the packed SDK must need no resolver, transformer or watchFolders tweaks.
const { getDefaultConfig } = require('expo/metro-config');

module.exports = getDefaultConfig(__dirname);

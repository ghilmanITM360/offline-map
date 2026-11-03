// Stock Expo Metro config plus the SDK's one helper, which registers the offline basemap (pmtiles) and venue-pack files (packfile) as assets.
const { getDefaultConfig } = require('expo/metro-config');
const { withOfflineNavigation } = require('@muslim-ummah/offline-navigation/metro');

module.exports = withOfflineNavigation(getDefaultConfig(__dirname));

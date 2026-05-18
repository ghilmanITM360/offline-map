const base = require('./app.json');

const androidGoogleMapsApiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_API_KEY;
const iosGoogleMapsApiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_IOS_API_KEY;

module.exports = {
  ...base,
  expo: {
    ...base.expo,
    android: {
      ...base.expo.android,
      ...(androidGoogleMapsApiKey
        ? {
            config: {
              googleMaps: {
                apiKey: androidGoogleMapsApiKey,
              },
            },
          }
        : {}),
    },
    ios: {
      ...base.expo.ios,
      ...(iosGoogleMapsApiKey
        ? {
            config: {
              googleMapsApiKey: iosGoogleMapsApiKey,
            },
          }
        : {}),
    },
    extra: {
      ...(base.expo.extra ?? {}),
      googleMapsAndroidApiKey: androidGoogleMapsApiKey ?? null,
      googleMapsIosApiKey: iosGoogleMapsApiKey ?? null,
      hasAndroidGoogleMapsKey: Boolean(androidGoogleMapsApiKey),
      hasIosGoogleMapsKey: Boolean(iosGoogleMapsApiKey),
    },
  },
};

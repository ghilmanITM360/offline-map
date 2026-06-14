const fs = require('fs');
const path = require('path');
const base = require('./app.json');

function loadLocalEnvIntoProcess() {
  ['.env', '.env.local'].forEach((fileName) => {
    const filePath = path.join(__dirname, fileName);
    if (!fs.existsSync(filePath)) return;

    const contents = fs.readFileSync(filePath, 'utf8');
    contents.split(/\r?\n/).forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;

      const normalized = trimmed.startsWith('export ') ? trimmed.slice(7) : trimmed;
      const separatorIndex = normalized.indexOf('=');
      if (separatorIndex <= 0) return;

      const key = normalized.slice(0, separatorIndex).trim();
      if (!key || process.env[key]?.trim()) return;

      let value = normalized.slice(separatorIndex + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }

      process.env[key] = value;
    });
  });
}

loadLocalEnvIntoProcess();

const androidGoogleMapsApiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_API_KEY;
const iosGoogleMapsApiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_IOS_API_KEY;
const androidPackageName = 'com.aicrafted.karachiijtema';

module.exports = {
  ...base,
  expo: {
    ...base.expo,
    android: {
      ...base.expo.android,
      package: androidPackageName,
      config: {
        ...(base.expo.android?.config ?? {}),
        googleMaps: {
          apiKey: androidGoogleMapsApiKey,
        },
      },
    },
    ios: {
      ...base.expo.ios,
      config: {
        ...(base.expo.ios?.config ?? {}),
        googleMapsApiKey: iosGoogleMapsApiKey,
      },
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

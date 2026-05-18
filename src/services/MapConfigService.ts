/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import Constants from 'expo-constants';
import { Platform } from 'react-native';

function hasConfiguredKey(): boolean {
  const expoConfig = Constants.expoConfig;
  if (!expoConfig) return false;

  if (Platform.OS === 'android') {
    return Boolean(expoConfig.android?.config?.googleMaps?.apiKey);
  }

  if (Platform.OS === 'ios') {
    return Boolean(expoConfig.ios?.config?.googleMapsApiKey);
  }

  return false;
}

export class MapConfigService {
  static isGoogleMapsKeyConfigured(): boolean {
    return hasConfiguredKey();
  }

  static getMissingGoogleMapsMessage(): string {
    if (Platform.OS === 'android') {
      return 'Google Maps API key missing. Base map may be limited until EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_API_KEY is configured.';
    }

    return 'Google Maps API key missing. Base map may be limited until EXPO_PUBLIC_GOOGLE_MAPS_IOS_API_KEY is configured.';
  }
}

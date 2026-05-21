/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import Constants from 'expo-constants';
import { Platform } from 'react-native';
import {
  getGoogleMapsRuntimeStatusFromInputs,
  GOOGLE_MAPS_KEY_NOT_CONFIGURED_MESSAGE,
  GOOGLE_MAPS_LOAD_FAILED_MESSAGE,
  GoogleMapsRuntimeStatus,
  RuntimePlatform,
} from './MapConfigResolver';

let didLogDevDiagnostics = false;

function resolvePlatform(value: string): RuntimePlatform {
  if (value === 'android' || value === 'ios') return value;
  return 'other';
}

function logDevDiagnostics(status: GoogleMapsRuntimeStatus): void {
  if (!__DEV__ || didLogDevDiagnostics || status.platform !== 'android') return;
  didLogDevDiagnostics = true;
  const envLoaded =
    typeof process.env.EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_API_KEY !== 'undefined' ||
    typeof process.env.EXPO_PUBLIC_GOOGLE_MAPS_IOS_API_KEY !== 'undefined';
  console.log('[MapConfig] .env loaded:', envLoaded);
  console.log('[MapConfig] Android Maps key present:', status.keyPresent);
  console.log('[MapConfig] Android package:', status.packageName ?? 'unknown');
  if (status.keyPreview) {
    console.log('[MapConfig] Android key preview:', status.keyPreview);
  }
}

export class MapConfigService {
  static isGoogleMapsKeyConfigured(): boolean {
    const status = this.getRuntimeStatus();
    return status.keyPresent;
  }

  static getRuntimeStatus(): GoogleMapsRuntimeStatus {
    const status = getGoogleMapsRuntimeStatusFromInputs({
      platform: resolvePlatform(Platform.OS),
      expoConfig: Constants.expoConfig,
      env: process.env,
    });
    logDevDiagnostics(status);
    return status;
  }

  static getMissingGoogleMapsMessage(): string {
    return GOOGLE_MAPS_KEY_NOT_CONFIGURED_MESSAGE;
  }

  static getMapLoadFailedMessage(): string {
    return GOOGLE_MAPS_LOAD_FAILED_MESSAGE;
  }
}

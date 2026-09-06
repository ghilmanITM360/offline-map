/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type RuntimePlatform = 'android' | 'ios' | 'other';
export type RuntimeStatusSource = 'expo_config' | 'env' | 'none';

export type ExpoConfigLike = {
  android?: {
    package?: string;
    config?: {
      googleMaps?: {
        apiKey?: string;
      };
    };
  };
  ios?: {
    config?: {
      googleMapsApiKey?: string;
    };
  };
  extra?: {
    googleMapsAndroidApiKey?: string | null;
    googleMapsIosApiKey?: string | null;
    hasAndroidGoogleMapsKey?: boolean;
    hasIosGoogleMapsKey?: boolean;
  };
};

export type RuntimeEnv = {
  [key: string]: string | undefined;
  EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_API_KEY?: string;
  EXPO_PUBLIC_GOOGLE_MAPS_IOS_API_KEY?: string;
};

export type GoogleMapsRuntimeStatus = {
  platform: RuntimePlatform;
  expectedEnvVariable: string;
  keyPresent: boolean;
  source: RuntimeStatusSource;
  packageName: string | null;
};

/** Product copy only — never mention keys, SDKs, or cloud console config to end users. */
export const GOOGLE_MAPS_KEY_NOT_CONFIGURED_MESSAGE =
  'Base map unavailable. Offline venue map still works.';
export const GOOGLE_MAPS_LOAD_FAILED_MESSAGE =
  'Base map unavailable. Offline venue map still works.';

function hasEnvKey(value: string | undefined): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

function resolveExpectedEnvVariable(platform: RuntimePlatform): string {
  return platform === 'ios'
    ? 'EXPO_PUBLIC_GOOGLE_MAPS_IOS_API_KEY'
    : 'EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_API_KEY';
}

function resolveExpoConfigKey(platform: RuntimePlatform, expoConfig: ExpoConfigLike | null | undefined): string | undefined {
  if (platform === 'android') {
    return expoConfig?.android?.config?.googleMaps?.apiKey ?? expoConfig?.extra?.googleMapsAndroidApiKey ?? undefined;
  }
  if (platform === 'ios') {
    return expoConfig?.ios?.config?.googleMapsApiKey ?? expoConfig?.extra?.googleMapsIosApiKey ?? undefined;
  }
  return undefined;
}

function resolveEnvKey(platform: RuntimePlatform, env: RuntimeEnv): string | undefined {
  if (platform === 'ios') {
    return env.EXPO_PUBLIC_GOOGLE_MAPS_IOS_API_KEY;
  }
  return env.EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_API_KEY;
}

export function getGoogleMapsRuntimeStatusFromInputs(params: {
  platform: RuntimePlatform;
  expoConfig?: ExpoConfigLike | null;
  env?: RuntimeEnv;
}): GoogleMapsRuntimeStatus {
  const platform = params.platform;
  const expoConfig = params.expoConfig ?? null;
  const env = params.env ?? {};
  const expectedEnvVariable = resolveExpectedEnvVariable(platform);
  const configKey = resolveExpoConfigKey(platform, expoConfig);
  const envKey = resolveEnvKey(platform, env);
  const configHasKey = hasEnvKey(configKey);
  const envHasKey = hasEnvKey(envKey);
  const source: RuntimeStatusSource = configHasKey ? 'expo_config' : envHasKey ? 'env' : 'none';
  const packageName = platform === 'android' ? (expoConfig?.android?.package ?? null) : null;

  return {
    platform,
    expectedEnvVariable,
    keyPresent: configHasKey || envHasKey,
    source,
    packageName,
  };
}

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Linking, Platform } from 'react-native';
import * as Location from 'expo-location';
import { Coordinate, LocationSource } from '../models/types';

const DEVICE_LAST_KNOWN_MAX_AGE_MS = 30_000;
const DEVICE_LAST_KNOWN_REQUIRED_ACCURACY_M = 50;
// expo-location's getCurrentPositionAsync exposes no app-level timeout (#89): observed native
// settlement time ranges from ~30s (emulator) to 58s+ (field device). Bound it so a fresh-fix
// attempt can never leave the caller waiting indefinitely.
const CURRENT_POSITION_TIMEOUT_MS = 15_000;

export type LocationPermissionPrecision = 'fine' | 'coarse' | 'none';
export type LocationServicesState = 'enabled' | 'disabled' | 'unknown';

export interface LocationPermissionState {
  granted: boolean;
  canAskAgain: boolean;
  status: Location.PermissionStatus;
  /** Android permission precision (fine/coarse/none). Independent of fix accuracy in meters. */
  precision: LocationPermissionPrecision;
  /** True only when servicesState === 'enabled'; kept for callers that only need a yes/no gate. */
  servicesEnabled: boolean;
  /** 'unknown' when the platform query itself failed — never collapsed into 'enabled'. */
  servicesState: LocationServicesState;
}

export function derivePrecision(permission: Location.LocationPermissionResponse): LocationPermissionPrecision {
  if (permission.status !== 'granted') return 'none';
  const androidAccuracy = (permission as { android?: { accuracy?: LocationPermissionPrecision } }).android?.accuracy;
  if (Platform.OS === 'android') return androidAccuracy === 'fine' || androidAccuracy === 'coarse' ? androidAccuracy : 'none';
  // Installed Expo 19 exposes iOS scope, not precision. Scope cannot prove precise authorization.
  return 'none';
}

async function queryServicesState(): Promise<LocationServicesState> {
  try {
    const enabled = await Location.hasServicesEnabledAsync();
    return enabled ? 'enabled' : 'disabled';
  } catch {
    return 'unknown';
  }
}

export interface LocationResolveResult {
  ok: boolean;
  coordinate: Coordinate | null;
  source: Exclude<LocationSource, 'remembered' | 'manual'> | null;
  permissionState: LocationPermissionState;
  message: string | null;
}

export class LocationAccessService {
  static async getPermissionState(): Promise<LocationPermissionState> {
    const permission = await Location.getForegroundPermissionsAsync();
    const servicesState = await queryServicesState();
    const granted = permission.status === 'granted';
    return {
      granted,
      canAskAgain: permission.canAskAgain,
      status: permission.status,
      precision: derivePrecision(permission),
      servicesEnabled: servicesState === 'enabled',
      servicesState,
    };
  }

  static async resolveCurrentLocation(allowPrompt = true): Promise<LocationResolveResult> {
    try {
      let permission = await Location.getForegroundPermissionsAsync();
      if (permission.status !== 'granted' && permission.canAskAgain && allowPrompt) {
        permission = await Location.requestForegroundPermissionsAsync();
      }

      const servicesState = await queryServicesState();

      const permissionState: LocationPermissionState = {
        granted: permission.status === 'granted',
        canAskAgain: permission.canAskAgain,
        status: permission.status,
        precision: derivePrecision(permission),
        servicesEnabled: servicesState === 'enabled',
        servicesState,
      };
      if (!permissionState.granted) {
        return {
          ok: false,
          coordinate: null,
          source: null,
          permissionState,
          message: permissionState.canAskAgain
            ? 'Allow location to see where you are.'
            : 'Location is off for this app. Turn it on in Settings.',
        };
      }

      // Only 'disabled' is a confirmed off-state worth short-circuiting on. 'unknown' means the
      // platform query itself failed — fall through and let getCurrentPositionAsync prove it one
      // way or the other rather than falsely claiming services are off.
      if (permissionState.servicesState === 'disabled') {
        return {
          ok: false,
          coordinate: null,
          source: null,
          permissionState,
          message: "Your phone's location is off. Turn it on, then try again.",
        };
      }

      try {
        let timeoutId: ReturnType<typeof setTimeout> | undefined;
        const current = await Promise.race([
          Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
          new Promise<never>((_, reject) => {
            timeoutId = setTimeout(() => reject(new Error('timeout')), CURRENT_POSITION_TIMEOUT_MS);
          }),
        ]).finally(() => {
          if (timeoutId !== undefined) clearTimeout(timeoutId);
        });
        return {
          ok: true,
          coordinate: {
            latitude: current.coords.latitude,
            longitude: current.coords.longitude,
            heading: current.coords.heading == null || current.coords.heading < 0 ? undefined : current.coords.heading,
            accuracy: current.coords.accuracy ?? undefined,
            ...(current.timestamp == null ? {} : { observedAtMs: current.timestamp }),
          },
          source: 'live',
          permissionState,
          message: null,
        };
      } catch {
        const lastKnown = await Location.getLastKnownPositionAsync({
          maxAge: DEVICE_LAST_KNOWN_MAX_AGE_MS,
          requiredAccuracy: DEVICE_LAST_KNOWN_REQUIRED_ACCURACY_M,
        });
        if (lastKnown) {
          return {
            ok: true,
            coordinate: {
              latitude: lastKnown.coords.latitude,
              longitude: lastKnown.coords.longitude,
              heading: lastKnown.coords.heading == null || lastKnown.coords.heading < 0 ? undefined : lastKnown.coords.heading,
              accuracy: lastKnown.coords.accuracy ?? undefined,
              ...(lastKnown.timestamp == null ? {} : { observedAtMs: lastKnown.timestamp }),
            },
            source: 'device_last_known',
            permissionState,
            message: "We can't find you right now. Showing where you were earlier.",
          };
        }
        return {
          ok: false,
          coordinate: null,
          source: null,
          permissionState,
          message: "We can't find you. Choose where you're starting from.",
        };
      }
    } catch {
      const permissionState: LocationPermissionState = {
        granted: false,
        canAskAgain: true,
        status: Location.PermissionStatus.DENIED,
        precision: 'none',
        servicesEnabled: false,
        servicesState: 'unknown',
      };
      return {
        ok: false,
        coordinate: null,
        source: null,
        permissionState,
        message: "We can't find your location right now. Please try again.",
      };
    }
  }

  static async openAppSettings(): Promise<boolean> {
    try {
      await Linking.openSettings();
      return true;
    } catch {
      return false;
    }
  }

  static async openLocationSettings(): Promise<boolean> {
    try {
      if (Platform.OS === 'android') {
        await Linking.sendIntent('android.settings.LOCATION_SOURCE_SETTINGS');
        return true;
      }
      await Linking.openSettings();
      return true;
    } catch {
      return this.openAppSettings();
    }
  }
}

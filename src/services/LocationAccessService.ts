/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Linking, Platform } from 'react-native';
import * as Location from 'expo-location';
import { Coordinate, LocationSource } from '../models/types';
import { OnboardingStatusService } from './OnboardingStatusService';

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

function derivePrecision(permission: Location.LocationPermissionResponse): LocationPermissionPrecision {
  if (permission.status !== 'granted') return 'none';
  const androidAccuracy = (permission as { android?: { accuracy?: LocationPermissionPrecision } }).android?.accuracy;
  return androidAccuracy ?? 'fine';
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
    // A mere status check that finds permission already granted still supersedes a stale skip
    // (e.g. Settings' re-request flow re-checks after the OS prompt closes).
    await OnboardingStatusService.clearSkippedLocationPermissionOnGrant(granted);
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
    console.log(`ROUTE89:B resolveCurrentLocation entered t=${Date.now()}`);
    try {
      let permission = await Location.getForegroundPermissionsAsync();
      if (permission.status !== 'granted' && allowPrompt) {
        permission = await Location.requestForegroundPermissionsAsync();
      }
      console.log(`ROUTE89:C permission resolved status=${permission.status} t=${Date.now()}`);

      const servicesState = await queryServicesState();
      console.log(`ROUTE89:D servicesState=${servicesState} t=${Date.now()}`);

      const permissionState: LocationPermissionState = {
        granted: permission.status === 'granted',
        canAskAgain: permission.canAskAgain,
        status: permission.status,
        precision: derivePrecision(permission),
        servicesEnabled: servicesState === 'enabled',
        servicesState,
      };
      // Covers both surfaces that route through here (Home/Recenter, Directions
      // current-location) with a single call — whether this pass just prompted for and
      // received a fresh grant, or found permission already granted from a prior launch.
      await OnboardingStatusService.clearSkippedLocationPermissionOnGrant(permissionState.granted);

      if (!permissionState.granted) {
        return {
          ok: false,
          coordinate: null,
          source: null,
          permissionState,
          message: permissionState.canAskAgain
            ? 'Location permission is required to use your current position.'
            : 'Location permission is denied. Open app settings to allow location access.',
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
          message: 'Device location is turned off. Enable location services and try again.',
        };
      }

      try {
        console.log(`ROUTE89:H getCurrentPositionAsync started t=${Date.now()}`);
        const current = await Promise.race([
          Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
          new Promise<never>((_, reject) => {
            setTimeout(() => reject(new Error('timeout')), CURRENT_POSITION_TIMEOUT_MS);
          }),
        ]);
        console.log(`ROUTE89:I getCurrentPositionAsync resolved accuracy=${current.coords.accuracy} age=${Date.now() - current.timestamp} t=${Date.now()}`);
        return {
          ok: true,
          coordinate: {
            latitude: current.coords.latitude,
            longitude: current.coords.longitude,
            heading: current.coords.heading == null || current.coords.heading < 0 ? undefined : current.coords.heading,
            accuracy: current.coords.accuracy ?? 0,
            ...(current.timestamp == null ? {} : { observedAtMs: current.timestamp }),
          },
          source: 'live',
          permissionState,
          message: null,
        };
      } catch (err) {
        console.log(`ROUTE89:J getCurrentPositionAsync rejected err=${(err as Error)?.message ?? 'unknown'} t=${Date.now()}`);
        console.log(`ROUTE89:F lastKnown lookup started t=${Date.now()}`);
        const lastKnown = await Location.getLastKnownPositionAsync({
          maxAge: DEVICE_LAST_KNOWN_MAX_AGE_MS,
          requiredAccuracy: DEVICE_LAST_KNOWN_REQUIRED_ACCURACY_M,
        });
        console.log(`ROUTE89:G lastKnown lookup finished found=${Boolean(lastKnown)} t=${Date.now()}`);
        if (lastKnown) {
          return {
            ok: true,
            coordinate: {
              latitude: lastKnown.coords.latitude,
              longitude: lastKnown.coords.longitude,
              heading: lastKnown.coords.heading == null || lastKnown.coords.heading < 0 ? undefined : lastKnown.coords.heading,
              accuracy: lastKnown.coords.accuracy ?? 0,
              ...(lastKnown.timestamp == null ? {} : { observedAtMs: lastKnown.timestamp }),
            },
            source: 'device_last_known',
            permissionState,
            message: 'Using device last known location because live GPS is unavailable.',
          };
        }
        return {
          ok: false,
          coordinate: null,
          source: null,
          permissionState,
          message: 'Current location is unavailable. Choose start manually.',
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
        message: 'Location service is temporarily unavailable. Please try again.',
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

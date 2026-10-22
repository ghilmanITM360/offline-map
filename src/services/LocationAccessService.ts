/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { AppState, Linking, Platform } from 'react-native';
import * as Location from 'expo-location';
import { Coordinate, LocationSource } from '../models/types';
import { t } from '../i18n';

import { invalidateIOSPrecisionReads, readIOSLocationSnapshot, subscribeIOSLocationAuthorization } from './IOSLocationPrecision';

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
  /** Verified permission precision (fine/coarse/none), independent of fix accuracy in meters. */
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
    return permissionFacts(permission, servicesState);
  }

  static async resolveCurrentLocation(allowPrompt = true): Promise<LocationResolveResult> {
    try {
      let permission = await Location.getForegroundPermissionsAsync();
      if (permission.status !== 'granted' && permission.canAskAgain && allowPrompt) {
        permission = await Location.requestForegroundPermissionsAsync();
      }

      const servicesState = await queryServicesState();

      let permissionState = await permissionFacts(permission, servicesState);
      if (!permissionState.granted) {
        return {
          ok: false,
          coordinate: null,
          source: null,
          permissionState,
          message: permissionState.canAskAgain ? t('errors.locationAllowToSee') : t('errors.locationOffForApp'),
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
          message: t('errors.phoneLocationOff'),
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
        if (Platform.OS === 'ios') permissionState = await this.getPermissionState();
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
          if (Platform.OS === 'ios') permissionState = await this.getPermissionState();
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
            message: t('errors.locationEarlier'),
          };
        }
        return {
          ok: false,
          coordinate: null,
          source: null,
          permissionState,
          message: t('errors.locationNotFound'),
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
        message: t('errors.locationNotFoundTryAgain'),
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

async function permissionFacts(permission: Location.LocationPermissionResponse, servicesState: LocationServicesState): Promise<LocationPermissionState> {
  let granted = permission.status === 'granted';
  let precision = derivePrecision(permission);
  if (Platform.OS === 'ios') {
    const native = await readIOSLocationSnapshot();
    const foreground = native?.authorization === 'whenInUse' || native?.authorization === 'always';
    granted = granted && foreground;
    if (native?.servicesEnabled === false) servicesState = 'disabled';
    if (granted && servicesState === 'enabled' && native?.servicesEnabled === true) {
      precision = native.precision === 'full' ? 'fine' : native.precision === 'reduced' ? 'coarse' : 'none';
    }
  }
  return { granted, canAskAgain: permission.canAskAgain, status: permission.status, precision,
    servicesState, servicesEnabled: servicesState === 'enabled' };
}

/** Root-owned iOS refresh, independent of GPS-watch ownership. Never starts navigation. */
export function observeIOSLocationPermission(onFacts: (facts: LocationPermissionState) => void): () => void {
  if (Platform.OS !== 'ios') return () => {};
  let disposed = false;
  let generation = 0;
  let active = AppState.currentState === 'active';
  const clear = () => onFacts({ granted: false, canAskAgain: false, status: Location.PermissionStatus.UNDETERMINED,
    precision: 'none', servicesEnabled: false, servicesState: 'unknown' });
  const refresh = () => {
    if (disposed) return;
    const request = ++generation;
    invalidateIOSPrecisionReads();
    clear();
    if (!active || disposed) return;
    void LocationAccessService.getPermissionState().then((facts) => {
      if (!disposed && active && request === generation) onFacts(facts);
    }).catch(() => { /* The cleared capability remains fail-closed. */ });
  };
  const removeNative = subscribeIOSLocationAuthorization(refresh);
  const appState = AppState.addEventListener('change', (state) => {
    active = state === 'active';
    refresh();
  });
  refresh();
  return () => {
    disposed = true;
    generation += 1;
    invalidateIOSPrecisionReads();
    removeNative();
    appState.remove();
  };
}

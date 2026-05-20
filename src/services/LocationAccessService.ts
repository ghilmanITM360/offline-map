/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Linking, Platform } from 'react-native';
import * as Location from 'expo-location';
import { Coordinate, LocationSource } from '../models/types';

export interface LocationPermissionState {
  granted: boolean;
  canAskAgain: boolean;
  status: Location.PermissionStatus;
  servicesEnabled: boolean;
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
    let servicesEnabled = true;
    try {
      servicesEnabled = await Location.hasServicesEnabledAsync();
    } catch {
      servicesEnabled = true;
    }
    return {
      granted: permission.status === 'granted',
      canAskAgain: permission.canAskAgain,
      status: permission.status,
      servicesEnabled,
    };
  }

  static async resolveCurrentLocation(allowPrompt = true): Promise<LocationResolveResult> {
    let permission = await Location.getForegroundPermissionsAsync();
    if (permission.status !== 'granted' && allowPrompt) {
      permission = await Location.requestForegroundPermissionsAsync();
    }

    let servicesEnabled = true;
    try {
      servicesEnabled = await Location.hasServicesEnabledAsync();
    } catch {
      servicesEnabled = true;
    }

    const permissionState: LocationPermissionState = {
      granted: permission.status === 'granted',
      canAskAgain: permission.canAskAgain,
      status: permission.status,
      servicesEnabled,
    };

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

    if (!permissionState.servicesEnabled) {
      return {
        ok: false,
        coordinate: null,
        source: null,
        permissionState,
        message: 'Device location is turned off. Enable location services and try again.',
      };
    }

    try {
      const current = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      return {
        ok: true,
        coordinate: {
          latitude: current.coords.latitude,
          longitude: current.coords.longitude,
          heading: current.coords.heading ?? 0,
          accuracy: current.coords.accuracy ?? 0,
        },
        source: 'live',
        permissionState,
        message: null,
      };
    } catch {
      const lastKnown = await Location.getLastKnownPositionAsync();
      if (lastKnown) {
        return {
          ok: true,
          coordinate: {
            latitude: lastKnown.coords.latitude,
            longitude: lastKnown.coords.longitude,
            heading: lastKnown.coords.heading ?? 0,
            accuracy: lastKnown.coords.accuracy ?? 0,
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
        await Linking.openURL('android.settings.LOCATION_SOURCE_SETTINGS');
        return true;
      }
      await Linking.openSettings();
      return true;
    } catch {
      return this.openAppSettings();
    }
  }
}

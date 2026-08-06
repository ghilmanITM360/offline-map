/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Linking, Platform } from 'react-native';
import * as Location from 'expo-location';
import { Coordinate, LocationSource } from '../models/types';
import { OnboardingStatusService } from './OnboardingStatusService';

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
    const granted = permission.status === 'granted';
    // A mere status check that finds permission already granted still supersedes a stale skip
    // (e.g. Settings' re-request flow re-checks after the OS prompt closes).
    await OnboardingStatusService.clearSkippedLocationPermissionOnGrant(granted);
    return {
      granted,
      canAskAgain: permission.canAskAgain,
      status: permission.status,
      servicesEnabled,
    };
  }

  static async resolveCurrentLocation(allowPrompt = true): Promise<LocationResolveResult> {
    try {
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
            heading: current.coords.heading == null || current.coords.heading < 0 ? undefined : current.coords.heading,
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
              heading: lastKnown.coords.heading == null || lastKnown.coords.heading < 0 ? undefined : lastKnown.coords.heading,
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
    } catch {
      const permissionState: LocationPermissionState = {
        granted: false,
        canAskAgain: true,
        status: Location.PermissionStatus.DENIED,
        servicesEnabled: true,
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

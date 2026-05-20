/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import { Alert } from 'react-native';
import * as Location from 'expo-location';
import { UserSettings } from '../models/types';
import { LocationAccessService, LocationPermissionState } from '../services/LocationAccessService';
import { OfflineDataService } from '../services/OfflineDataService';

export function useSettingsViewModel() {
  const {
    settings,
    updateSettings,
    setHasLocationPermission,
  } = useAppStore();
  const [locationPermissionState, setLocationPermissionState] = useState<LocationPermissionState | null>(null);

  const handleToggle = (key: keyof UserSettings) => {
    const currentValue = settings[key];
    if (typeof currentValue === 'boolean') {
      updateSettings({ [key]: !currentValue });
    }
  };

  const updateSettingValue = (key: keyof UserSettings, value: any) => {
    updateSettings({ [key]: value });
  };

  const handleRedownloadMap = async (navigateToDownload?: () => void) => {
    try {
      await OfflineDataService.deleteAllMapData();
      navigateToDownload?.();
    } catch (err) {
      console.error(err);
      Alert.alert('Could not update map', 'Map data could not be cleared. Please try again.');
    }
  };

  const handleDeleteMap = async (navigateToDownload?: () => void) => {
    try {
      await OfflineDataService.deleteAllMapData();
      Alert.alert('Map data deleted', 'Offline map data was removed from this device.');
      navigateToDownload?.();
    } catch (err) {
      console.error(err);
      Alert.alert('Could not delete map data', 'Offline map data could not be removed. Please try again.');
    }
  };

  const refreshLocationPermissionState = useCallback(async () => {
    const state = await LocationAccessService.getPermissionState();
    setLocationPermissionState(state);
    setHasLocationPermission(state.granted);
    return state;
  }, [setHasLocationPermission]);

  const handleReRequestPermission = async () => {
    const state = await refreshLocationPermissionState();
    if (state.granted && !state.servicesEnabled) {
      const opened = await LocationAccessService.openLocationSettings();
      if (!opened) {
        Alert.alert('Location services are off', 'Open device location settings and turn location on.');
      }
      return;
    }

    if (state.granted) {
      const opened = await LocationAccessService.openAppSettings();
      if (!opened) {
        Alert.alert('Location enabled', 'Location permission is granted. Manage it from Android app settings.');
      }
      return;
    }

    if (state.canAskAgain) {
      const asked = await Location.requestForegroundPermissionsAsync();
      const granted = asked.status === 'granted';
      setHasLocationPermission(granted);
      await refreshLocationPermissionState();
      if (!granted) {
        Alert.alert('Location permission required', 'Please allow location to use current-position navigation.');
      }
      return;
    }

    const opened = await LocationAccessService.openAppSettings();
    if (!opened) {
      Alert.alert(
        'Unable to open settings',
        'Open Android app settings manually and allow location permission for this app.',
      );
    }
  };

  return {
    settings,
    handleToggle,
    updateSettingValue,
    handleRedownloadMap,
    handleDeleteMap,
    handleReRequestPermission,
    locationPermissionState,
    refreshLocationPermissionState,
  };
}

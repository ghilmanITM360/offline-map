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

export function useSettingsViewModel() {
  const {
    settings,
    updateSettings,
    setHasLocationPermission,
    setLocationPermissionPrecision,
    clearRecentSearches,
    clearSavedLocation,
    clearUnfinishedJourney,
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

  // #145: targeted, confirmed clears. Favorites, settings and offline venue data are never touched here.
  const LOCAL_DATA_CLEARS = {
    recentSearches: { title: 'Clear recent searches?', message: 'Your recent search list will be emptied.', run: clearRecentSearches },
    savedLocation: { title: 'Clear saved location?', message: 'Your saved location will be deleted from this phone. While location is on, it is saved again.', run: clearSavedLocation },
    navigationRecovery: { title: 'Clear the unfinished trip reminder?', message: 'The reminder about an unfinished trip will be removed.', run: clearUnfinishedJourney },
  } as const;
  const handleClearLocalData = (kind: keyof typeof LOCAL_DATA_CLEARS) => {
    const { title, message, run } = LOCAL_DATA_CLEARS[kind];
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear', style: 'destructive', onPress: run },
    ]);
  };

  const refreshLocationPermissionState = useCallback(async () => {
    const state = await LocationAccessService.getPermissionState();
    setLocationPermissionState(state);
    setHasLocationPermission(state.granted);
    setLocationPermissionPrecision(state.precision);
    return state;
  }, [setHasLocationPermission, setLocationPermissionPrecision]);

  const handleReRequestPermission = async () => {
    try {
      const state = await refreshLocationPermissionState();
      if (state.granted && state.servicesState === 'disabled') {
        const opened = await LocationAccessService.openLocationSettings();
        if (!opened) {
          Alert.alert("Your phone's location is off", 'Open Settings and turn location on.');
        }
        return;
      }

      if (state.granted) {
        const opened = await LocationAccessService.openAppSettings();
        if (!opened) {
          Alert.alert('Location is on', "You can change this in your phone's Settings.");
        }
        return;
      }

      if (state.canAskAgain) {
        const asked = await Location.requestForegroundPermissionsAsync();
        const granted = asked.status === 'granted';
        setHasLocationPermission(granted);
        await refreshLocationPermissionState();
        if (!granted) {
          Alert.alert('Allow location', 'Allow location to get directions from where you are.');
        }
        return;
      }

      const opened = await LocationAccessService.openAppSettings();
      if (!opened) {
        Alert.alert(
          "Can't open Settings",
          "Open your phone's Settings and allow location for this app.",
        );
      }
    } catch {
      Alert.alert("Can't open Settings", 'Please try again.');
    }
  };

  return {
    settings,
    handleToggle,
    updateSettingValue,
    handleClearLocalData,
    handleReRequestPermission,
    locationPermissionState,
    refreshLocationPermissionState,
  };
}

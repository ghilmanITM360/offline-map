/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import { Alert } from 'react-native';
import * as Location from 'expo-location';
import { UserSettings } from '../models/types';
import { t } from '../i18n';
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
    recentSearches: { titleKey: 'settings.clearRecentConfirmTitle', messageKey: 'settings.clearRecentConfirmBody', run: clearRecentSearches },
    savedLocation: { titleKey: 'settings.clearSavedConfirmTitle', messageKey: 'settings.clearSavedConfirmBody', run: clearSavedLocation },
    navigationRecovery: { titleKey: 'settings.clearJourneyConfirmTitle', messageKey: 'settings.clearJourneyConfirmBody', run: clearUnfinishedJourney },
  } as const;
  const handleClearLocalData = (kind: keyof typeof LOCAL_DATA_CLEARS) => {
    const { titleKey, messageKey, run } = LOCAL_DATA_CLEARS[kind];
    Alert.alert(t(titleKey), t(messageKey), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.clear'), style: 'destructive', onPress: run },
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
          Alert.alert(t('settings.phoneLocationOffTitle'), t('settings.phoneLocationOffBody'));
        }
        return;
      }

      if (state.granted) {
        const opened = await LocationAccessService.openAppSettings();
        if (!opened) {
          Alert.alert(t('settings.locationOnTitle'), t('settings.locationOnBody'));
        }
        return;
      }

      if (state.canAskAgain) {
        const asked = await Location.requestForegroundPermissionsAsync();
        const granted = asked.status === 'granted';
        setHasLocationPermission(granted);
        await refreshLocationPermissionState();
        if (!granted) {
          Alert.alert(t('settings.allowLocationTitle'), t('settings.allowLocationBody'));
        }
        return;
      }

      const opened = await LocationAccessService.openAppSettings();
      if (!opened) {
        Alert.alert(t('settings.cantOpenSettingsTitle'), t('settings.cantOpenSettingsBody'));
      }
    } catch {
      Alert.alert(t('settings.cantOpenSettingsTitle'), t('settings.cantOpenSettingsRetry'));
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

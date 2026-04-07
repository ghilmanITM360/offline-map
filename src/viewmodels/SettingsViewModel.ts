/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useAppStore } from '../store/useAppStore';
import { OfflineMapService } from '../services/OfflineMapService';
import * as Location from 'expo-location';
import { UserSettings } from '../models/types';

export function useSettingsViewModel() {
  const {
    settings,
    updateSettings,
    setOfflineMapAvailable,
    setHasLocationPermission,
    resetDownloadState,
    updateOfflineData,
  } = useAppStore();

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
      await OfflineMapService.deleteMapData();
      setOfflineMapAvailable(false);
      updateOfflineData({ isDownloaded: false, sizeMB: 0, downloadDate: undefined });
      resetDownloadState();
      navigateToDownload?.();
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteMap = async (navigateToDownload?: () => void) => {
    try {
      await OfflineMapService.deleteMapData();
      setOfflineMapAvailable(false);
      updateOfflineData({ isDownloaded: false, sizeMB: 0, downloadDate: undefined });
      resetDownloadState();
      navigateToDownload?.();
    } catch (err) {
      console.error(err);
    }
  };

  const handleReRequestPermission = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status === 'granted') {
      setHasLocationPermission(true);
    }
  };

  return {
    settings,
    handleToggle,
    updateSettingValue,
    handleRedownloadMap,
    handleDeleteMap,
    handleReRequestPermission,
  };
}

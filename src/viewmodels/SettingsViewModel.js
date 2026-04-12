/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { useAppStore } from '../store/useAppStore';
import { OfflineMapService } from '../services/OfflineMapService';
import { Alert, Linking } from 'react-native';
import * as Location from 'expo-location';
export function useSettingsViewModel() {
    const { settings, updateSettings, setOfflineMapAvailable, setHasLocationPermission, resetDownloadState, updateOfflineData, } = useAppStore();
    const handleToggle = (key) => {
        const currentValue = settings[key];
        if (typeof currentValue === 'boolean') {
            updateSettings({ [key]: !currentValue });
        }
    };
    const updateSettingValue = (key, value) => {
        updateSettings({ [key]: value });
    };
    const handleRedownloadMap = async (navigateToDownload) => {
        try {
            await OfflineMapService.deleteMapData();
            setOfflineMapAvailable(false);
            updateOfflineData({ isDownloaded: false, sizeMB: 0, downloadDate: undefined });
            resetDownloadState();
            navigateToDownload?.();
        }
        catch (err) {
            console.error(err);
        }
    };
    const handleDeleteMap = async (navigateToDownload) => {
        try {
            await OfflineMapService.deleteMapData();
            setOfflineMapAvailable(false);
            updateOfflineData({ isDownloaded: false, sizeMB: 0, downloadDate: undefined });
            resetDownloadState();
            navigateToDownload?.();
        }
        catch (err) {
            console.error(err);
        }
    };
    const handleReRequestPermission = async () => {
        const { status, canAskAgain } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
            setHasLocationPermission(true);
            return;
        }
        if (!canAskAgain) {
            Alert.alert('Location permission required', 'Enable location access in Settings to use navigation.', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Open Settings', onPress: () => { void Linking.openSettings(); } },
            ]); // fixed: direct permanently denied users to OS settings
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

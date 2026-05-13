/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { useState } from 'react';
import { Alert, Linking } from 'react-native';
import * as Location from 'expo-location';
import { useAppStore } from '../store/useAppStore';
import { OfflineMapService } from '../services/OfflineMapService';
import { ConnectivityService } from '../services/ConnectivityService';
export function usePermissionViewModel() {
    const { setHasLocationPermission } = useAppStore();
    const [loading, setLoading] = useState(false);
    const navigateNext = async (navigation) => {
        const [mapStatus, isConnected] = await Promise.all([
            OfflineMapService.getMapStatus(),
            ConnectivityService.isConnected(),
        ]);
        if (mapStatus.isDownloaded || !isConnected) {
            navigation.replace('Main');
            return;
        }
        navigation.replace('DownloadMap');
    };
    const requestPermission = async (navigation) => {
        setLoading(true);
        try {
            const { status } = await Location.requestForegroundPermissionsAsync();
            if (status === 'granted') {
                setHasLocationPermission(true);
                await navigateNext(navigation);
            }
            else {
                const permission = await Location.getForegroundPermissionsAsync(); // fixed: inspect whether the permission can still be requested in-app
                if (!permission.canAskAgain) {
                    Alert.alert('Location permission required', 'Enable location access in Settings to use navigation.', [
                        { text: 'Cancel', style: 'cancel' },
                        { text: 'Open Settings', onPress: () => { void Linking.openSettings(); } },
                    ]); // fixed: route permanently denied users to the system settings app
                }
                else {
                    Alert.alert('Location permission is required for navigation.'); // fixed: use platform alert instead of global alert()
                }
            }
        }
        catch (error) {
            console.error(error);
        }
        finally {
            setLoading(false);
        }
    };
    const skipPermission = async (navigation) => {
        await navigateNext(navigation);
    };
    return {
        loading,
        requestPermission,
        skipPermission,
    };
}

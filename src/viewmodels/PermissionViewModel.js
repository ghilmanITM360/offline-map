/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { useState } from 'react';
import { Alert, Linking } from 'react-native';
import * as Location from 'expo-location';
import { useAppStore } from '../store/useAppStore';
export function usePermissionViewModel() {
    const { setHasLocationPermission } = useAppStore();
    const [loading, setLoading] = useState(false);
    const requestPermission = async (navigation) => {
        setLoading(true);
        try {
            const { status } = await Location.requestForegroundPermissionsAsync();
            if (status === 'granted') {
                setHasLocationPermission(true);
                navigation.navigate('DownloadMap');
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
    const skipPermission = (navigation) => {
        navigation.navigate('DownloadMap');
    };
    return {
        loading,
        requestPermission,
        skipPermission,
    };
}

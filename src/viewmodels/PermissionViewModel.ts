/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import * as Location from 'expo-location';
import { useAppStore } from '../store/useAppStore';

export function usePermissionViewModel() {
  const { setHasLocationPermission } = useAppStore();
  const [loading, setLoading] = useState(false);

  const requestPermission = async (navigation: any) => {
    setLoading(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        setHasLocationPermission(true);
        navigation.navigate('DownloadMap');
      } else {
        alert('Location permission is required for navigation.');
      }
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const skipPermission = (navigation: any) => {
    navigation.navigate('DownloadMap');
  };

  return {
    loading,
    requestPermission,
    skipPermission,
  };
}

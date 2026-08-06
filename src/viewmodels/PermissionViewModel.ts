/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useRef, useState } from 'react';
import { Alert, Linking } from 'react-native';
import * as Location from 'expo-location';
import { useAppStore } from '../store/useAppStore';
import { OfflineMapService } from '../services/OfflineMapService';
import { ConnectivityService } from '../services/ConnectivityService';
import { OfflineMapStatusService } from '../services/OfflineMapStatusService';
import { OnboardingStatusService } from '../services/OnboardingStatusService';

export function usePermissionViewModel() {
  const { setHasLocationPermission, setOfflineMapStatus } = useAppStore();
  const [loading, setLoading] = useState(false);
  // A ref, not state, so a second confirmation fired before the first's setLoading(true) has
  // committed still sees the in-flight latch synchronously (React state updates are async).
  const skipInFlightRef = useRef(false);

  const navigateNext = async (navigation: any) => {
    const [mapStatus, statusValidation, isConnected] = await Promise.all([
      OfflineMapService.getMapStatus(),
      OfflineMapStatusService.validateAtStartup(),
      ConnectivityService.isConnected(),
    ]);

    setOfflineMapStatus(statusValidation.status, statusValidation.reason ?? null);

    if (statusValidation.status === 'downloaded' || mapStatus.isDownloaded || !isConnected) {
      navigation.replace('Main');
      return;
    }

    navigation.replace('DownloadMap');
  };

  const requestPermission = async (navigation: any) => {
    setLoading(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        setHasLocationPermission(true);
        // Supersede any earlier "Continue Without Location" choice now that real permission
        // is confirmed granted, so a later revocation is treated as fresh next launch.
        await OnboardingStatusService.clearSkippedLocationPermissionOnGrant(true);
        await navigateNext(navigation);
      } else {
        const permission = await Location.getForegroundPermissionsAsync(); // fixed: inspect whether the permission can still be requested in-app
        if (!permission.canAskAgain) {
          Alert.alert('Location permission required', 'Enable location access in Settings to use navigation.', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Open Settings', onPress: () => { void Linking.openSettings(); } },
          ]); // fixed: route permanently denied users to the system settings app
        } else {
          Alert.alert(
            "Location isn't on yet",
            'We need this to show your position on the map and guide you to your destination. You can allow it below, or continue without it for now.',
            [{ text: 'OK' }],
          );
        }
      }
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const confirmSkipPermission = async (navigation: any) => {
    if (skipInFlightRef.current) return; // rapid repeated confirmation — first attempt is already in flight
    skipInFlightRef.current = true;
    setLoading(true);
    try {
      await OnboardingStatusService.setSkippedLocationPermission(true);
      await navigateNext(navigation);
    } catch (error) {
      // Persistence (or the map-status checks navigateNext depends on) failed — stay on this
      // screen and say so rather than navigating on as if the skip choice had been saved.
      console.error('[usePermissionViewModel] Failed to save the "Continue Without Location" choice.', error);
      Alert.alert(
        "Couldn't save your choice",
        'Something went wrong and your choice was not saved. Please try again.',
        [{ text: 'OK' }],
      );
    } finally {
      skipInFlightRef.current = false;
      setLoading(false);
    }
  };

  const skipPermission = (navigation: any) => {
    Alert.alert(
      'Continue without location?',
      'You can still explore the map, but live navigation will not work until location is enabled. You can turn it on anytime from Settings.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Continue Without Location',
          onPress: () => {
            // Persist only on this confirmation action, not on the initial button press —
            // Cancel must leave no trace of a skip decision. Named async handler (not a bare
            // IIFE) so a persistence rejection is caught inside it instead of becoming an
            // unhandled promise rejection.
            void confirmSkipPermission(navigation);
          },
        },
      ],
    );
  };

  return {
    loading,
    requestPermission,
    skipPermission,
  };
}

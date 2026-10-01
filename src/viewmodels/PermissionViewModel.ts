/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useRef, useState } from 'react';
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
  const mountedRef = useRef(true);
  // Incremented per confirmSkipPermission() attempt. Combined with mountedRef, this lets a
  // still-in-flight attempt recognize it has been superseded — either by the screen unmounting
  // or (defensively, should skipInFlightRef's latch ever be loosened) by a newer attempt — so
  // its eventual settle can't write loading/navigation state on behalf of an attempt that is
  // no longer the one the user is looking at.
  const skipRequestIdRef = useRef(0);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // `isStillCurrent` defaults to always-true for requestPermission's call site below, which is
  // out of this guard's scope — only confirmSkipPermission passes its own isCurrentAttempt
  // check, since navigateNext's own Promise.all is itself an await this attempt must survive
  // before it's still safe to write store state or navigate.
  const navigateNext = async (navigation: any, isStillCurrent: () => boolean = () => true) => {
    const [mapStatus, statusValidation, isConnected] = await Promise.all([
      OfflineMapService.getMapStatus(),
      OfflineMapStatusService.validateAtStartup(),
      ConnectivityService.isConnected(),
    ]);

    if (!isStillCurrent()) return;

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
          Alert.alert('Location access is off', 'Enable location access in Settings to use navigation.', [
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
      Alert.alert(
        "Couldn't check location permission",
        'Something went wrong. Please try again, or continue without location for now.',
        [{ text: 'OK' }],
      );
    } finally {
      setLoading(false);
    }
  };

  const confirmSkipPermission = async (navigation: any) => {
    if (skipInFlightRef.current) return; // rapid repeated confirmation — first attempt is already in flight
    skipInFlightRef.current = true;
    const requestId = ++skipRequestIdRef.current;
    // Re-checked after every await below: an unmount (screen popped/replaced while the
    // persistence write or navigateNext's own awaits are still pending) or a newer attempt
    // taking over must stop this attempt from writing loading state, showing a retry Alert, or
    // navigating on behalf of a screen the user is no longer looking at. The persistence call
    // itself is still allowed to finish in the background — only its effect on this hook's
    // React state/navigation is guarded.
    const isCurrentAttempt = () => mountedRef.current && skipRequestIdRef.current === requestId;

    setLoading(true);
    try {
      await OnboardingStatusService.setSkippedLocationPermission(true);
      if (!isCurrentAttempt()) return;
      await navigateNext(navigation, isCurrentAttempt);
    } catch (error) {
      if (!isCurrentAttempt()) return;
      // Persistence (or the map-status checks navigateNext depends on) failed — stay on this
      // screen and say so rather than navigating on as if the skip choice had been saved.
      console.error('[usePermissionViewModel] Failed to save the "Continue Without Location" choice.', error);
      Alert.alert(
        "Couldn't save your choice",
        'Something went wrong and your choice was not saved. Please try again.',
        [{ text: 'OK' }],
      );
    } finally {
      if (isCurrentAttempt()) {
        skipInFlightRef.current = false;
        setLoading(false);
      }
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

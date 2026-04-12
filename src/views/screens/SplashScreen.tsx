/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { Map as MapIcon } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import * as Location from 'expo-location';
import { useAppStore } from '../../store/useAppStore';
import { ConnectivityService } from '../../services/ConnectivityService';
import { OfflineMapService } from '../../services/OfflineMapService';

export function SplashScreen() {
  const navigation = useNavigation<any>();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const { updateOfflineData, setHasLocationPermission } = useAppStore();
  const isMountedRef = useRef(true); // fixed: guard navigation and state writes after unmount
  const minVisibleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null); // fixed: cancel the splash delay on unmount

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 1200,
      useNativeDriver: true,
    }).start();

    const checkStatus = async () => {
      // Minimum visible time so the logo is seen
      const minVisibleMs = new Promise<void>((resolve) => {
        minVisibleTimeoutRef.current = setTimeout(resolve, 1500); // fixed: keep a handle so the delay can be cancelled on unmount
      });

      // Run all checks in parallel
      const [mapStatus, permissionResult, isConnected] = await Promise.all([
        OfflineMapService.getMapStatus(),
        Location.getForegroundPermissionsAsync(),
        ConnectivityService.isConnected(),
        minVisibleMs,
      ]);

      const permissionGranted = permissionResult.status === 'granted';
      if (!isMountedRef.current) {
        return; // fixed: stop after async work if the splash screen already unmounted
      }

      const { downloadState, setDownloadState } = useAppStore.getState(); // fixed: reconcile persisted download progress with actual disk state on cold start
      if (downloadState.phase === 'downloading' || downloadState.phase === 'connecting') {
        setDownloadState({
          phase: 'paused',
          resumable: (downloadState.downloadedTiles ?? 0) > 0,
        }); // fixed: prevent the app from showing a phantom active download after a force-quit
      }

      // Sync real map status into persisted Zustand state
      if (mapStatus.isDownloaded) {
        updateOfflineData({
          isDownloaded: true,
          downloadDate: mapStatus.downloadDate ?? undefined,
          sizeMB: mapStatus.sizeMB,
        });
      }

      setHasLocationPermission(permissionGranted);

      // Routing logic — check permission and map independently
      if (!permissionGranted) {
        navigation.replace('Permission');
        return;
      }

      if (mapStatus.isDownloaded) {
        navigation.replace('Main');
        return;
      }

      if (!isConnected) {
        // No internet AND no map — go to Main in graph-only mode
        navigation.replace('Main');
        return;
      }

      // Have internet, no map yet — go to download
      navigation.replace('DownloadMap');
    };

    void checkStatus();

    return () => {
      isMountedRef.current = false; // fixed: mark splash work as cancelled on unmount
      if (minVisibleTimeoutRef.current) {
        clearTimeout(minVisibleTimeoutRef.current); // fixed: cancel the pending splash timeout
      }
    };
  }, [fadeAnim, navigation, setHasLocationPermission, updateOfflineData]);

  return (
    <View style={styles.container}>
      <Animated.View style={[styles.content, { opacity: fadeAnim }]}>
        <View style={styles.logoContainer}>
          <MapIcon size={60} color="#FFFFFF" />
        </View>
        <Text style={styles.title}>Ijtema Map</Text>
        <Text style={styles.urduTitle}>اجتماع میپ</Text>
        <Text style={styles.subtitle}>Offline Navigation Guide</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#2E7D32',
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    alignItems: 'center',
  },
  logoContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#FFFFFF',
    letterSpacing: 1,
  },
  urduTitle: {
    fontSize: 22,
    color: '#E8F5E9',
    marginTop: 4,
    letterSpacing: 0.5,
  },
  subtitle: {
    fontSize: 15,
    color: '#A5D6A7',
    marginTop: 8,
  },
});

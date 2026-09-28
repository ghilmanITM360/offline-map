/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { Map as MapIcon } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import * as Location from 'expo-location';
import { useAppStore, waitForStoreHydration, type HydrationWaitOutcome } from '../../store/useAppStore';
import { ConnectivityService } from '../../services/ConnectivityService';
import { OfflineMapService } from '../../services/OfflineMapService';
import { OfflineMapStatusService } from '../../services/OfflineMapStatusService';
import { OnboardingStatusService } from '../../services/OnboardingStatusService';
import { StartupManager } from '../../services/StartupManager';
import { RootStackParamList } from '../../navigation/RootNavigator';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { staticColors } from '../../theme';

export const SPLASH_BACKGROUND_COLOR = staticColors.arrivalGreen;

export function SplashScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const { updateOfflineData, setHasLocationPermission, setOfflineMapStatus } = useAppStore();
  const isMountedRef = useRef(true); // fixed: guard navigation and state writes after unmount
  const minVisibleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null); // fixed: cancel the splash delay on unmount
  const hydrationAbortControllerRef = useRef<AbortController | null>(null);
  const hydrationOutcomeRef = useRef<HydrationWaitOutcome | null>(null); // null until Promise.all resolves — lets cleanup distinguish "still waiting" (genuine abort) from "already settled" (ordinary unmount)

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 1200,
      useNativeDriver: true,
    }).start();

    const checkStatus = async () => {
      const hydrationAbortController = new AbortController();
      hydrationAbortControllerRef.current = hydrationAbortController;

      // Minimum visible time so the logo is seen
      const minVisibleMs = new Promise<void>((resolve) => {
        minVisibleTimeoutRef.current = setTimeout(resolve, 1500); // fixed: keep a handle so the delay can be cancelled on unmount
      });

      // Each of these normalizes its own failure independently, with a conservative fallback
      // and a specific diagnostic — a rejection from any single startup dependency must never
      // take down the whole Promise.all below and force a hardcoded route. StartupManager
      // remains the only place that decides the route; these fallbacks only decide what
      // StartupManager sees when a read genuinely failed.
      let onboardingStatusReadFailed = false;
      const hasSeenWelcomePromise = OnboardingStatusService.hasSeenWelcome().catch((error) => {
        console.error('[SplashScreen] Failed to read welcome status — assuming onboarding is not complete.', error);
        onboardingStatusReadFailed = true;
        return false;
      });

      const permissionGrantedPromise = Location.getForegroundPermissionsAsync()
        .then((result) => result.status === 'granted')
        .catch((error) => {
          console.error('[SplashScreen] Failed to read location permission status — assuming not granted.', error);
          return false;
        });

      const skippedLocationPermissionPromise = OnboardingStatusService.hasSkippedLocationPermission().catch((error) => {
        console.error('[SplashScreen] Failed to read the skipped-location-permission preference — assuming not skipped.', error);
        return false;
      });

      const startupStatusPromise = OfflineMapStatusService.validateAtStartup().catch((error) => {
        console.error('[SplashScreen] Failed to validate offline map status — assuming the map is not downloaded.', error);
        return { status: 'not_downloaded' as const, manifest: null, reason: 'Map status check failed' };
      });

      const isConnectedPromise = ConnectivityService.isConnected().catch((error) => {
        console.error('[SplashScreen] Failed to read connectivity status — assuming offline.', error);
        return false;
      });

      const graphOnlyModeEnabledPromise = OfflineMapStatusService.isGraphOnlyModeEnabled().catch((error) => {
        console.error('[SplashScreen] Failed to read the graph-only-mode preference — assuming disabled.', error);
        return false;
      });

      const skippedOnlineModeEnabledPromise = OfflineMapStatusService.isSkippedOnlineModeEnabled().catch((error) => {
        console.error('[SplashScreen] Failed to read the skipped-online-mode preference — assuming disabled.', error);
        return false;
      });

      // Run all checks in parallel
      const [mapStatus, startupStatus, permissionGranted, isConnected, graphOnlyModeEnabled, skippedOnlineModeEnabled, hasSeenWelcome, skippedLocationPermission, , hydrationResult] = await Promise.all([
        OfflineMapService.getMapStatus(),
        startupStatusPromise,
        permissionGrantedPromise,
        isConnectedPromise,
        graphOnlyModeEnabledPromise,
        skippedOnlineModeEnabledPromise,
        hasSeenWelcomePromise,
        skippedLocationPermissionPromise,
        minVisibleMs,
        // Persisted-store hydration gate (pre-APK correction) — StartupManager/
        // MapStartupController must never see default (unhydrated) persisted values.
        // HomeScreen only mounts after this Promise.all resolves and navigation.replace()
        // below runs, so this transitively guards every persisted read (hasSeenMapOverview,
        // lastKnownLocation, settings, ...) downstream of Splash too. A known rehydration
        // failure resolves this immediately (see waitForStoreHydration); only a genuine hang
        // rides out the full timeout. Either way startup proceeds with whatever the store
        // currently holds — in-memory defaults on failure/timeout, persisted values on success
        // (persisted values can still reach startup after a bounded timeout too, if the read
        // simply hadn't finished yet — 'timeout' does not imply the data is unavailable, only
        // that this particular wait gave up on it).
        waitForStoreHydration(undefined, hydrationAbortController.signal),
      ]);
      hydrationOutcomeRef.current = hydrationResult.outcome;

      if (!isMountedRef.current) {
        return; // fixed: stop after async work if the splash screen already unmounted
      }

      // Explicit, Splash-scoped acknowledgement of the degraded-startup outcome (in addition
      // to the generation-scoped failure/timeout logs already emitted from inside
      // waitForStoreHydration itself) — startup below proceeds identically for every outcome
      // ('success' | 'failure' | 'timeout'; 'aborted' cannot reach here, see the isMountedRef
      // check above), but this line makes that a deliberate, observable decision rather than
      // a silently-discarded Promise.all slot.
      if (hydrationResult.outcome !== 'success') {
        console.warn(`[SplashScreen] Continuing startup with outcome="${hydrationResult.outcome}" persisted-state hydration — using in-memory defaults for any key not yet confirmed from storage.`);
      }

      const { downloadState, setDownloadState } = useAppStore.getState(); // fixed: reconcile persisted download progress with actual disk state on cold start
      if (downloadState.phase === 'downloading' || downloadState.phase === 'connecting') {
        setDownloadState({ phase: 'idle' }); // fixed: clear stale in-memory downloading state after cold start
      }

      // Sync real map status into persisted Zustand state
      if (mapStatus.isDownloaded) {
        updateOfflineData({
          isDownloaded: true,
          downloadDate: mapStatus.downloadDate ?? undefined,
          sizeMB: mapStatus.sizeMB,
        });
      }
      setOfflineMapStatus(startupStatus.status, startupStatus.reason ?? null);

      setHasLocationPermission(permissionGranted);

      // Real permission is confirmed granted — supersede any earlier "Continue Without
      // Location" choice so a later revocation is treated as fresh, not a still-standing
      // skip. Uses the same canonical helper as every other permission-entry surface
      // (Permission screen, Settings, Home/Recenter, Directions). `effectiveSkippedLocationPermission`
      // is already computed above and does not depend on this write landing, and this call
      // is wrapped in its own try/catch (on top of the helper's own internal one) so a
      // cleanup failure can never fall through and override StartupManager's route
      // resolution — see the "permission-skip cleanup is isolated from route resolution"
      // tests in SplashScreen.test.tsx.
      const effectiveSkippedLocationPermission = permissionGranted ? false : skippedLocationPermission;
      if (permissionGranted && skippedLocationPermission) {
        try {
          await OnboardingStatusService.clearSkippedLocationPermissionOnGrant(true);
        } catch (cleanupError) {
          console.error('[SplashScreen] Failed to clear the skipped-location-permission preference — continuing startup with the in-memory decision.', cleanupError);
        }
      }

      const { route } = StartupManager.resolve({
        hasSeenWelcome,
        permissionGranted,
        skippedLocationPermission: effectiveSkippedLocationPermission,
        offlineMapStatus: startupStatus.status,
        graphOnlyModeEnabled,
        skippedOnlineModeEnabled,
        isConnected,
      });
      // StartupManager only routes Splash to 'Permission' when Welcome was already seen,
      // permission is not granted, and the user never chose "Continue Without Location"
      // (a skip bypasses this route). That covers a permission revoked outside the app,
      // but also a first ask interrupted by closing the app on the Permission screen —
      // so `revoked` selects PermissionScreen's hedged "may have been turned off" copy,
      // not a definite revocation claim (#153 Finding 2).
      if (route === 'Permission') {
        navigation.replace(route, { revoked: true });
      } else if (route === 'Welcome' && onboardingStatusReadFailed) {
        navigation.replace(route, { onboardingStatusReadFailed: true });
      } else {
        navigation.replace(route);
      }
    };

    void checkStatus();

    return () => {
      isMountedRef.current = false; // fixed: mark splash work as cancelled on unmount
      if (minVisibleTimeoutRef.current) {
        clearTimeout(minVisibleTimeoutRef.current); // fixed: cancel the pending splash timeout
      }
      if (hydrationOutcomeRef.current === null) {
        // Distinguishable from the failure/timeout logs in useAppStore.ts and the
        // outcome="..." log above — this is the only place an 'aborted' hydration outcome can
        // originate, since SplashScreen unmounting before Promise.all resolves is the only
        // thing that ever calls .abort() on this controller. Deliberately logs only the
        // outcome, never any persisted state.
        console.warn('[SplashScreen] Unmounted before persisted-store hydration settled — aborting the wait (outcome: aborted).');
      }
      hydrationAbortControllerRef.current?.abort(); // let waitForStoreHydration drop its listeners immediately instead of idling out the timeout
    };
  }, [fadeAnim, navigation, setHasLocationPermission, updateOfflineData]);

  return (
    <View style={styles.container}>
      <Animated.View style={[styles.content, { opacity: fadeAnim }]}>
        <View style={styles.logoContainer}>
          <MapIcon size={60} color={staticColors.white} />
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
    backgroundColor: SPLASH_BACKGROUND_COLOR,
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
    color: staticColors.white,
    letterSpacing: 1,
  },
  urduTitle: {
    fontSize: 22,
    color: staticColors.lightGreenSubtext,
    marginTop: 4,
    letterSpacing: 0.5,
  },
  subtitle: {
    fontSize: 15,
    // SPLASH-UX-001: entryGateBorder (#A5D6A7) on arrivalGreen measured 3.12:1 —
    // below the 4.5:1 WCAG AA floor for normal-size text. lightGreenSubtext is the
    // same token already used for the Urdu title on this exact background and is
    // independently verified at 4.56:1.
    color: staticColors.lightGreenSubtext,
    marginTop: 8,
  },
});

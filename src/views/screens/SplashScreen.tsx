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
import { OnboardingStatusService } from '../../services/OnboardingStatusService';
import { StartupManager } from '../../services/StartupManager';
import { derivePrecision } from '../../services/LocationAccessService';
import { RootStackParamList } from '../../navigation/RootNavigator';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { staticColors } from '../../theme';
import { useI18n } from '../../i18n';

export const SPLASH_BACKGROUND_COLOR = staticColors.arrivalGreen;

export function SplashScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { t } = useI18n();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const { setHasLocationPermission, setLocationPermissionPrecision } = useAppStore();
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

      const permissionPromise = Location.getForegroundPermissionsAsync()
        .then((result) => ({ granted: result.status === 'granted', precision: derivePrecision(result) }))
        .catch((error) => {
          console.error('[SplashScreen] Failed to read location permission status — assuming not granted.', error);
          return { granted: false, precision: 'none' as const };
        });

      // Run all checks in parallel
      const [permission, hasSeenWelcome, , hydrationResult] = await Promise.all([
        permissionPromise,
        hasSeenWelcomePromise,
        minVisibleMs,
        // Persisted-store hydration gate (pre-APK correction) — StartupManager/
        // MapStartupController must never see default (unhydrated) persisted values.
        // HomeScreen only mounts after this Promise.all resolves and navigation.replace()
        // below runs, so this transitively guards every persisted read (lastKnownLocation, settings,
        // recents, the recovery marker, ...) downstream of Splash too. A known rehydration
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

      const permissionGranted = permission.granted;
      setHasLocationPermission(permissionGranted);
      // #307: approximate-only is a launch-time fact, not something to discover on the first Recenter.
      setLocationPermissionPrecision(permission.precision);

      const { route } = StartupManager.resolve({ hasSeenWelcome });
      if (route === 'Welcome' && onboardingStatusReadFailed) {
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
  }, [fadeAnim, navigation, setHasLocationPermission, setLocationPermissionPrecision]);

  return (
    <View style={styles.container}>
      <Animated.View style={[styles.content, { opacity: fadeAnim }]}>
        <View style={styles.logoContainer}>
          <MapIcon size={60} color={staticColors.white} />
        </View>
        <Text style={styles.title}>{t('common.appName')}</Text>
        <Text style={styles.subtitle}>{t('onboarding.splashTagline')}</Text>
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

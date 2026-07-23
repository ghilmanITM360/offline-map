/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Animated, BackHandler } from 'react-native';
import MapView from 'react-native-maps';
import { useAppStore } from '../store/useAppStore';
import { V2MapRenderingService } from '../services/V2MapRenderingService';
import { useNavigationViewModelV2 } from './NavigationViewModelV2';
import { CameraManager } from './useCameraManager';

declare const __DEV__: boolean;

interface Params {
  mapRef: React.RefObject<MapView | null>;
  mapReady: boolean;
  mapZoomLevel: number;
  hasGoogleMapsKey: boolean;
  /** Reuse Home's existing current-location pulse animation instead of starting a second loop. */
  userPulseAnim: Animated.Value;
  cameraManager: CameraManager;
}

/**
 * Live-navigation state + effects for the v2 route, designed to run inside HomeScreen
 * (on the single persistent MapView) instead of a separate NavigationScreen. Safe to call
 * unconditionally — every effect here already no-ops when there's no active v2 route.
 */
export function useNavigationOverlayV2({ mapRef, mapReady, mapZoomLevel, hasGoogleMapsKey, userPulseAnim, cameraManager }: Params) {
  const hasInternet = useAppStore((s) => s.hasInternet);
  const developerMode = useAppStore((s) => s.developerModeEnabled);
  const settings = useAppStore((s) => s.settings);
  const currentLocationSource = useAppStore((s) => s.currentLocationSource);

  const vm = useNavigationViewModelV2();
  const { route, destination, snappedLocation, arrived } = vm;

  const [isAutoFollowing, setIsAutoFollowing] = useState(settings.autoFollowLocation);
  const [initialCameraFitDone, setInitialCameraFitDone] = useState(false);
  // Measured (not guessed) height of NavigationChromeV2's bottom trip-info bar — grows with
  // font scaling/device width, so anything anchored above it (recenter button, HomeScreen's
  // nav zoom/compass cluster, map edgePadding) reads this instead of a hardcoded constant.
  const [bottomBarHeight, setBottomBarHeight] = useState(0);
  const bottomBarHeightRef = useRef(0);
  bottomBarHeightRef.current = bottomBarHeight;

  const mapLayers = useMemo(() => {
    const baseLayers = V2MapRenderingService.getHomeLayers({
      selectedPlaceId: route?.destination.blockId ?? destination?.id,
      selectedPlace: destination,
      developerMode: __DEV__ && developerMode,
      graphOnlyFallback: !hasGoogleMapsKey || !hasInternet,
      zoomLevel: mapZoomLevel,
    });
    // Route-critical-only declutter: active navigation shouldn't render all 42 blocks/
    // every gate/every rasta — narrow to the actual route corridor (+ destination +
    // always-visible major gates). See NAV_CORRIDOR_RADIUS_M.
    if (!route || route.coordinates.length < 2) return baseLayers;
    return { ...baseLayers, ...V2MapRenderingService.getNavigationCorridorLayers(baseLayers, route.coordinates) };
  }, [destination, developerMode, hasGoogleMapsKey, hasInternet, route, mapZoomLevel]);

  useEffect(() => {
    setInitialCameraFitDone(false);
  }, [route?.routeId]);

  useEffect(() => {
    if (!route || !mapReady || initialCameraFitDone || !mapRef.current) return;
    // Bottom padding leaves room for the measured trip-info bar (falls back to the old
    // guessed constant for the rare case a fit runs before the bar has reported a layout).
    if (route.coordinates.length > 1) {
      cameraManager.fitRoute(route.coordinates, {
        top: 90,
        right: 64,
        bottom: (bottomBarHeightRef.current || 140) + 80,
        left: 64,
      });
      setInitialCameraFitDone(true);
      return;
    }
    cameraManager.fitVenueBounds(mapLayers.venueBoundary, {
      top: 48,
      right: 48,
      bottom: (bottomBarHeightRef.current || 140) + 20,
      left: 48,
    });
    setInitialCameraFitDone(true);
  }, [cameraManager, initialCameraFitDone, mapReady, mapRef, mapLayers.venueBoundary, route]);

  useEffect(() => {
    if (!route || !isAutoFollowing || !snappedLocation || !mapRef.current) return;
    // CameraManager.enterNavigationCamera() — follows the user, keeps the route corridor
    // visible via mapLayers above, and holds the tilted navigation perspective.
    cameraManager.enterNavigationCamera(snappedLocation, {
      zoom: 18,
      heading: settings.keepNorthFixed ? 0 : (snappedLocation.heading ?? 0),
      pitch: 30,
      duration: 800,
    });
  }, [cameraManager, isAutoFollowing, mapRef, route, settings.keepNorthFixed, snappedLocation]);

  useEffect(() => {
    if (!route) cameraManager.exitNavigationCamera();
  }, [cameraManager, route]);

  useEffect(() => {
    if (!route) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      // ARRIVAL is a distinct MapMode above NAVIGATION (see useMapMode.ts) — back here
      // mirrors the arrival sheet's own "Done" button (dismiss straight to map), not the
      // mid-trip exit confirmation (nothing to lose by leaving, the trip is already over).
      if (arrived) {
        vm.handleExit();
        return true;
      }
      Alert.alert('Exit navigation?', 'Do you want to stop navigation and return to map?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Exit', style: 'destructive', onPress: () => vm.handleExit() },
      ]);
      return true;
    });
    return () => sub.remove();
  }, [route, arrived, vm.handleExit]);

  const graphOnlyFallbackUsed = (!hasGoogleMapsKey || !hasInternet) && mapLayers.graphOnlyFallbackSupported;

  return {
    ...vm,
    active: !!route,
    mapLayers,
    isAutoFollowing,
    setIsAutoFollowing,
    bottomBarHeight,
    setBottomBarHeight,
    userPulseAnim,
    currentLocationSource,
    settings,
    graphOnlyFallbackUsed,
  };
}

export type NavigationOverlayV2 = ReturnType<typeof useNavigationOverlayV2>;

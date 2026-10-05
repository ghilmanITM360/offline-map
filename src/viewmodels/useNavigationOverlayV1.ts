/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated } from 'react-native';
import type { MapCameraHandle } from '../views/components/mapgl/MapCameraHandle';
import { useAppStore } from '../store/useAppStore';
import { RoutingService } from '../services/RoutingService';
import { IJTEMA_DATA, MAP_BOUNDS } from '../constants/data';
import { useNavigationViewModel } from './NavigationViewModel';
import { CameraManager } from './useCameraManager';
import { useNavigationExitConfirmation } from './useNavigationExitConfirmation';

interface Params {
  mapRef: React.RefObject<MapCameraHandle | null>;
  mapReady: boolean;
  hasBaseMap: boolean;
  /** Reuse Home's existing current-location pulse animation instead of starting a second loop. */
  userPulseAnim: Animated.Value;
  cameraManager: CameraManager;
}

const VENUE_BOUNDARY = [
  { latitude: MAP_BOUNDS.minLat, longitude: MAP_BOUNDS.minLng },
  { latitude: MAP_BOUNDS.minLat, longitude: MAP_BOUNDS.maxLng },
  { latitude: MAP_BOUNDS.maxLat, longitude: MAP_BOUNDS.maxLng },
  { latitude: MAP_BOUNDS.maxLat, longitude: MAP_BOUNDS.minLng },
];

/**
 * Live-navigation state + effects for the legacy v1 route, designed to run inside
 * HomeScreen (on the single persistent MapView) instead of a separate NavigationScreen —
 * mirrors useNavigationOverlayV2's shape. Safe to call unconditionally — every effect
 * here already no-ops when there's no active v1 route.
 */
export function useNavigationOverlayV1({ mapRef, mapReady, hasBaseMap, userPulseAnim, cameraManager }: Params) {
  const settings = useAppStore((s) => s.settings);
  const currentLocationSource = useAppStore((s) => s.currentLocationSource);
  const navigationSessionId = useAppStore((s) => s.navigationSessionId);

  const vm = useNavigationViewModel();
  const { route, snappedLocation, arrived } = vm;
  const navigationExit = useNavigationExitConfirmation({
    active: !!route,
    arrived,
    onExit: vm.handleExit,
  });

  const [isAutoFollowing, setIsAutoFollowing] = useState(true);
  const [initialCameraFitDone, setInitialCameraFitDone] = useState(false);
  // Measured (not guessed) height of NavigationChromeV1's bottom trip-info bar — same
  // reasoning as useNavigationOverlayV2's bottomBarHeight.
  const [bottomBarHeight, setBottomBarHeight] = useState(0);
  const bottomBarHeightRef = useRef(0);
  bottomBarHeightRef.current = bottomBarHeight;

  const mapLayers = useMemo(
    () => ({
      venueBoundary: VENUE_BOUNDARY,
      blocks: Object.values(IJTEMA_DATA.blocks),
      edges: IJTEMA_DATA.edges,
    }),
    [],
  );

  useEffect(() => {
    setIsAutoFollowing(true);
    setInitialCameraFitDone(false);
  }, [navigationSessionId]);

  useEffect(() => {
    if (!route || !mapReady || initialCameraFitDone || !mapRef.current) return;
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
    const snappedInsideVenue = RoutingService.isInsideVenue(snappedLocation);
    if (!snappedInsideVenue && route.coordinates.length > 1) return;
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

  const graphOnlyFallbackUsed = !hasBaseMap;

  return {
    ...vm,
    ...navigationExit,
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

export type NavigationOverlayV1 = ReturnType<typeof useNavigationOverlayV1>;

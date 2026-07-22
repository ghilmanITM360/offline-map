/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Animated, BackHandler } from 'react-native';
import MapView, { Camera } from 'react-native-maps';
import { useAppStore } from '../store/useAppStore';
import { RoutingService } from '../services/RoutingService';
import { IJTEMA_DATA, MAP_BOUNDS } from '../constants/data';
import { useNavigationViewModel } from './NavigationViewModel';

interface Params {
  mapRef: React.RefObject<MapView | null>;
  mapReady: boolean;
  hasGoogleMapsKey: boolean;
  /** Reuse Home's existing current-location pulse animation instead of starting a second loop. */
  userPulseAnim: Animated.Value;
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
export function useNavigationOverlayV1({ mapRef, mapReady, hasGoogleMapsKey, userPulseAnim }: Params) {
  const hasInternet = useAppStore((s) => s.hasInternet);
  const settings = useAppStore((s) => s.settings);
  const currentLocationSource = useAppStore((s) => s.currentLocationSource);

  const vm = useNavigationViewModel();
  const { route, snappedLocation } = vm;

  const [isAutoFollowing, setIsAutoFollowing] = useState(settings.autoFollowLocation);
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
    setInitialCameraFitDone(false);
  }, [route?.id]);

  useEffect(() => {
    if (!route || !mapReady || initialCameraFitDone || !mapRef.current) return;
    if (route.coordinates.length > 1) {
      mapRef.current.fitToCoordinates(route.coordinates, {
        edgePadding: { top: 90, right: 64, bottom: (bottomBarHeightRef.current || 140) + 80, left: 64 },
        animated: true,
      });
      setInitialCameraFitDone(true);
      return;
    }
    mapRef.current.fitToCoordinates(mapLayers.venueBoundary, {
      edgePadding: { top: 48, right: 48, bottom: (bottomBarHeightRef.current || 140) + 20, left: 48 },
      animated: true,
    });
    setInitialCameraFitDone(true);
  }, [initialCameraFitDone, mapReady, mapRef, mapLayers.venueBoundary, route]);

  useEffect(() => {
    if (!route || !isAutoFollowing || !snappedLocation || !mapRef.current) return;
    const snappedInsideVenue = RoutingService.isInsideVenue(snappedLocation);
    if (!snappedInsideVenue && route.coordinates.length > 1) return;
    mapRef.current.animateCamera(
      {
        center: snappedLocation,
        zoom: 18,
        heading: settings.keepNorthFixed ? 0 : (snappedLocation.heading ?? 0),
        pitch: 30,
      } as Camera,
      { duration: 800 },
    );
  }, [isAutoFollowing, mapRef, route, settings.keepNorthFixed, snappedLocation]);

  useEffect(() => {
    if (!route) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      Alert.alert('Exit navigation?', 'Do you want to stop navigation and return to map?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Exit', style: 'destructive', onPress: () => vm.handleExit() },
      ]);
      return true;
    });
    return () => sub.remove();
  }, [route, vm.handleExit]);

  const graphOnlyFallbackUsed = !hasGoogleMapsKey || !hasInternet;

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

export type NavigationOverlayV1 = ReturnType<typeof useNavigationOverlayV1>;

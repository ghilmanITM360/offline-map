/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useRef, useMemo, useEffect, useCallback } from 'react';
import { Alert } from 'react-native';
import type { MapCameraHandle, Region } from '../views/components/mapgl/MapCameraHandle';
import { BottomSheetModal } from '@gorhom/bottom-sheet';
import { useAppStore } from '../store/useAppStore';
import { Place } from '../models/types';
import { GPSManagerService } from '../services/GPSManagerService';
import { RoutingService } from '../services/RoutingService';
import { LocationAccessService } from '../services/LocationAccessService';
import { RoutePointService } from '../services/RoutePointService';
import { EntryGateRoutingService } from '../services/EntryGateRoutingService';
import { MapFeatureFlagsService } from '../services/MapFeatureFlagsService';
import { IJTEMA_MAP_REGION } from '../data/ijtema';
import { DEFAULT_MAP_ZOOM as DEFAULT_HOME_MAP_ZOOM, estimateZoomFromRegion } from '../utils/mapZoom';
import { t, tn } from '../i18n';
import { localizeVenueName } from '../i18n/venueNames';
import type { LocationResolveResult } from '../services/LocationAccessService';
import { useCameraManager, CompassMode } from './useCameraManager';

// The sheet starts springing in as the camera ease is finishing, not after it, so selection feels like one motion.
const SHEET_OVERLAP_FRACTION = 0.6;

declare const __DEV__: boolean;

/** "from 5 minutes ago" as a phrase that slots into the sentence around it (word order differs per language). */
function lastKnownAgePhrase(timestamp: string | null): string {
  const ageMs = timestamp ? Date.now() - new Date(timestamp).getTime() : NaN;
  if (!Number.isFinite(ageMs) || ageMs < 0) return t('map.ageUnknown');
  const minutes = Math.max(1, Math.round(ageMs / 60_000));
  return minutes < 60 ? tn('map.ageMinutes', minutes) : tn('map.ageHours', Math.round(minutes / 60));
}

/** Why a location could not be found, in the chosen language. Chosen from the structured result, not the service's English text. */
function locationFailureMessage({ permissionState }: Pick<LocationResolveResult, 'permissionState'>): string {
  if (!permissionState.granted) return permissionState.canAskAgain ? t('map.locationAllow') : t('map.locationOffForApp');
  if (permissionState.servicesState === 'disabled') return t('map.locationPhoneOff');
  return t('map.cantFindYouBody');
}

function getHomeVenueStatus(coord: { latitude: number; longitude: number }): { insideVenue: boolean; insideBlock: string | null } {
  return MapFeatureFlagsService.useIjtemaV2Map()
    ? EntryGateRoutingService.getVenueStatus(coord)
    : RoutingService.getVenueStatus(coord);
}

function isInsideHomeVenue(coord: { latitude: number; longitude: number }): boolean {
  return MapFeatureFlagsService.useIjtemaV2Map()
    ? EntryGateRoutingService.isInsideIjtemaArea(coord)
    : RoutingService.isInsideVenue(coord);
}

function getHomeSnappedCoordinate(coord: { latitude: number; longitude: number }) {
  if (MapFeatureFlagsService.useIjtemaV2Map()) {
    const resolved = EntryGateRoutingService.resolveRouteStartForUser(coord);
    return resolved.candidateNodes.length > 0 ? resolved.coordinate : coord;
  }

  const nearestNode = RoutingService.findNearestNode(coord);
  return RoutePointService.nodeToCoordinate(nearestNode);
}

export function useHomeViewModel({ isFocused = true }: { isFocused?: boolean } = {}) {
  const mapRef = useRef<MapCameraHandle>(null);
  const bottomSheetRef = useRef<BottomSheetModal>(null);
  // Mirrors HomeScreen's sheetIndex state (-1 = closed) so handlePlaceSelect can decide
  // whether to preserve the current snap height on re-selection — see handlePlaceSelect.
  const lastSheetIndexRef = useRef(-1);
  const handleSheetIndexChange = useCallback((index: number) => {
    lastSheetIndexRef.current = index;
  }, []);
  // Google Maps selection transition: highlight -> camera pan -> sheet spring, in that
  // order (see handlePlaceSelect) — the sheet's present()/snapToIndex is deliberately
  // staggered behind the camera pan via this timer instead of firing in the same tick.
  const sheetPresentTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelPendingSheetPresentation = useCallback(() => {
    if (!sheetPresentTimerRef.current) return;
    clearTimeout(sheetPresentTimerRef.current);
    sheetPresentTimerRef.current = null;
  }, []);
  const cameraManager = useCameraManager({ mapRef });

  const currentLocation = useAppStore((s) => s.currentLocation);
  const lastKnownLocation = useAppStore((s) => s.lastKnownLocation);
  const lastKnownLocationUpdatedAt = useAppStore((s) => s.lastKnownLocationUpdatedAt);
  const hasLocationPermission = useAppStore((s) => s.hasLocationPermission);
  const settings = useAppStore((s) => s.settings);
  const hasInternet = useAppStore((s) => s.hasInternet);
  const selectedPlace = useAppStore((s) => s.selectedPlace);
  // Deliberately the raw store primitive, not MapMode — camera-follow/compass gating below
  // must stay off for the whole isNavigating-bracketed session, even during an emergency
  // EXPO_PUBLIC_USE_IJTEMA_V2_NAVIGATION rollback where MapMode's NAVIGATION chrome is
  // flag-suppressed but the nav runtime (and its own camera ownership) is still live. See the
  // `isNavigating` doc comment in useAppStore.ts and test-navigation-architecture-audit.ts
  // Finding 6.
  const isNavigating = useAppStore((s) => s.isNavigating);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const setCurrentLocation = useAppStore((s) => s.setCurrentLocation);
  const setSnappedLocation = useAppStore((s) => s.setSnappedLocation);
  const setHasLocationPermission = useAppStore((s) => s.setHasLocationPermission);
  const setLocationPermissionPrecision = useAppStore((s) => s.setLocationPermissionPrecision);
  const addRecentSearch = useAppStore((s) => s.addRecentSearch);
  const setSelectedPlace = useAppStore((s) => s.setSelectedPlace);
  const setSearchQuery = useAppStore((s) => s.setSearchQuery);
  const setSearchResults = useAppStore((s) => s.setSearchResults);
  const pendingDirectorySelection = useAppStore((s) => s.pendingDirectorySelection);
  const setPendingDirectorySelection = useAppStore((s) => s.setPendingDirectorySelection);

  const isOffline = !hasInternet;
  const [isMapReady, setIsMapReady] = useState(false);
  const [mapZoomLevel, setMapZoomLevel] = useState(DEFAULT_HOME_MAP_ZOOM);
  // Keep venue status in lockstep with the store's committed location. A returning launch
  // commits fresh GPS before releasing the watcher, so an effect or watcher-only update
  // would expose one render with a new location and stale outside-venue UI.
  const venueStatus = useMemo(
    () => currentLocation ? getHomeVenueStatus(currentLocation) : { insideVenue: false, insideBlock: null },
    [currentLocation],
  );
  // Session-only (not persisted, like Google Maps' own compass state) — NORTH_UP is the
  // resting/default state; FOLLOW_HEADING rotates the camera bearing to match the device
  // compass on every GPS tick, via cameraManager.rotateToHeading, until toggled off.
  const [compassMode, setCompassMode] = useState<CompassMode>('NORTH_UP');

  const devLogControl = (pressed: string, action: string, details?: Record<string, unknown>) => {
    if (!__DEV__) return;
    console.log('[HomeControl]', { pressed, action, ...(details ?? {}) });
  };

  const snapPoints = useMemo(() => ['15%', '50%', '92%'], []);

  const initialRegion: Region = {
    latitude: IJTEMA_MAP_REGION.latitude,
    longitude: IJTEMA_MAP_REGION.longitude,
    latitudeDelta: 0.01,
    longitudeDelta: 0.01,
  };
  const shouldTrackLiveLocation = hasLocationPermission && isMapReady && !isNavigating;

  const handleGPS = useCallback(
    (coord: { latitude: number; longitude: number; heading?: number }) => {
      // Continue tracking while CameraManager is in FOLLOWING_USER mode (tap-to-recenter
      // flow below) or while the persisted "always auto-center" setting is on — either
      // one re-engages the camera, dragging the map (HomeScreen's onPanDrag) exits
      // FOLLOWING_USER but doesn't touch the persisted setting.
      if ((cameraManager.mode === 'FOLLOWING_USER' || settings.autoFollowLocation) && !isNavigating) {
        cameraManager.followUser(coord);
      }
      // Compass FOLLOW_HEADING mode — rotate bearing to match device heading on each
      // tick. Skipped during active navigation, which already owns camera bearing via
      // cameraManager.enterNavigationCamera (untouched by this fix).
      if (compassMode === 'FOLLOW_HEADING' && !isNavigating && typeof coord.heading === 'number' && coord.heading >= 0) {
        cameraManager.rotateToHeading(coord.heading);
      }
    },
    [cameraManager, compassMode, isNavigating, settings.autoFollowLocation],
  );

  useEffect(() => {
    if (!shouldTrackLiveLocation) return;
    GPSManagerService.addListener(handleGPS, 'follow');
    return () => {
      GPSManagerService.removeListener(handleGPS);
    };
  }, [handleGPS, shouldTrackLiveLocation]);

  // Google Maps re-selection behavior: switching from one selected object to another
  // (Block 1 -> Block 2, Gate 1 -> Gate 2, etc.) while the sheet is already open keeps
  // its current height instead of collapsing back to the default 50% peek. Only a fresh
  // open (sheet was closed) snaps to the default. Tracked via a ref (not state) because
  // HomeScreen's BottomSheetModal onChange is the only writer and handlePlaceSelect
  // itself must read the pre-selection value synchronously.
  const isSheetOpenForReselection = Boolean(selectedPlace) && lastSheetIndexRef.current >= 1;
  const handlePlaceSelect = (place: Place, opts?: { cameraAlreadyThere?: boolean }) => {
    const nextSnapIndex = isSheetOpenForReselection ? lastSheetIndexRef.current : 1;
    // 1. Selection highlight — set synchronously, before camera/sheet move, so the tapped
    // object's isSelected styling (RastaLayer/SpecialRouteLayer/BlockLayer/GateLayer) updates
    // immediately regardless of how long the camera pan or sheet spring take.
    setSelectedPlace(place);
    addRecentSearch(place);
    setSearchQuery('');
    setSearchResults([]);
    cancelPendingSheetPresentation();
    const openSheet = () => {
      sheetPresentTimerRef.current = null;
      bottomSheetRef.current?.present();
      bottomSheetRef.current?.snapToIndex(nextSnapIndex);
    };
    if (!place.coordinate) {
      // Nothing for the camera to pan to — open the sheet right away so the
      // "place unavailable" info/alert isn't itself delayed.
      const name = localizeVenueName(place.name);
      Alert.alert(
        t('map.placeUnavailableTitle'),
        place.unavailableReason ? t('map.placeNotReady', { name }) : t('map.placeUnavailableBody', { name }),
      );
      openSheet();
      return;
    }
    // 2. Camera pans toward the place, offset for whichever sheet height it's about to
    // reopen at (or keep, on re-selection) — see useCameraManager.animateToPlace.
    const snapPercent = parseFloat(snapPoints[nextSnapIndex] ?? '50%');
    const sheetCoverageFraction = (Number.isFinite(snapPercent) ? snapPercent : 50) / 100;
    const cameraDurationMs = cameraManager.animateToPlace(place, sheetCoverageFraction, opts?.cameraAlreadyThere ? 0 : undefined);
    // 3. Sheet springs in once the (short) camera pan has landed, instead of racing it.
    sheetPresentTimerRef.current = setTimeout(openSheet, Math.round(cameraDurationMs * SHEET_OVERLAP_FRACTION));
  };

  // Consumes a destination handed off by the Locations Directory screen (a RootStack
  // sibling reached before/pushed on top of Main) through the exact same selection
  // pipeline as a map tap or search result — no parallel selection path. The field is
  // cleared the instant it's consumed so it never re-fires on a later unrelated render.
  // Held until Home is focused again, i.e. after the Directory has finished popping, so the
  // sheet never presents over the screen that is still on top (#190).
  const earlyFocusedRef = useRef<Place | null>(null);
  useEffect(() => {
    // Destination outranks every other camera intent: while the Directory is still closing over the map, jump
    // (the map is not visible yet) so the reveal lands on the place instead of the venue overview. The sheet and
    // the selection still wait for focus, below.
    if (pendingDirectorySelection?.coordinate && !isFocused && earlyFocusedRef.current !== pendingDirectorySelection) {
      earlyFocusedRef.current = pendingDirectorySelection;
      cameraManager.animateToPlace(pendingDirectorySelection, 0.5, 0);
    }
    if (!pendingDirectorySelection || !isFocused) return;
    const jumpedEarly = earlyFocusedRef.current === pendingDirectorySelection;
    earlyFocusedRef.current = null;
    handlePlaceSelect(pendingDirectorySelection, { cameraAlreadyThere: jumpedEarly });
    setPendingDirectorySelection(null);
  }, [pendingDirectorySelection, isFocused, handlePlaceSelect, setPendingDirectorySelection, cameraManager]);

  const handleRecenter = useCallback(async (): Promise<boolean> => {
    const recenterTo = (location: typeof currentLocation) => {
      if (!location) return false;
      if (!mapRef.current) return false;
      // Google-Maps-style: tap recenter -> animate to user -> enable follow mode ->
      // handleGPS above keeps tracking every subsequent GPS tick until the user drags
      // the map away (HomeScreen's onPanDrag calls cameraManager.stopFollowing()).
      cameraManager.followUser(location);
      setSnappedLocation(getHomeSnappedCoordinate(location));
      return true;
    };

    try {
      const resolved = await LocationAccessService.resolveCurrentLocation(true);
      setHasLocationPermission(resolved.permissionState.granted);
      setLocationPermissionPrecision(resolved.permissionState.precision);

      if (resolved.ok && resolved.coordinate) {
        setCurrentLocation(resolved.coordinate, resolved.source ?? 'live');
        devLogControl('recenter', 'location_resolved', {
          source: resolved.source ?? 'live',
          insideVenue: isInsideHomeVenue(resolved.coordinate),
        });
        const centered = recenterTo(resolved.coordinate);
        if (!centered) {
          Alert.alert(t('map.mapLoadingTitle'), t('map.mapLoadingBody'));
        }

        if (!isInsideHomeVenue(resolved.coordinate)) {
          Alert.alert(t('map.outsideTitle'), t('map.outsideBody'));
        } else if (resolved.source === 'device_last_known') {
          Alert.alert(t('map.earlierTitle'), t('map.earlierMessage'));
        }
        return centered;
      }

      const canUseRemembered = lastKnownLocation
        && (MapFeatureFlagsService.useIjtemaV2Map() || isInsideHomeVenue(lastKnownLocation));
      const actions = [
        {
          text: t('map.chooseStartTitle'),
          style: 'default' as const,
          onPress: () => {
            Alert.alert(t('map.chooseStartTitle'), t('map.chooseStartBody'));
          },
        },
        ...(!resolved.permissionState.canAskAgain && !resolved.permissionState.granted
          ? [{
              text: t('map.openSettings'),
              onPress: () => {
                void (async () => {
                  const opened = await LocationAccessService.openAppSettings();
                  if (!opened) {
                    Alert.alert(t('map.cantOpenSettingsTitle'), t('map.cantOpenSettingsBody'));
                  }
                })();
              },
            }]
          : []),
        ...(canUseRemembered
          ? [{
              text: t('map.useEarlierLocation'),
              onPress: () => {
                setCurrentLocation(lastKnownLocation, 'remembered');
                const centered = recenterTo(lastKnownLocation);
                if (!centered) {
                  Alert.alert(t('map.mapLoadingTitle'), t('map.mapLoadingBody'));
                  return;
                }
                if (!isInsideHomeVenue(lastKnownLocation)) {
                  Alert.alert(
                    t('map.earlierTitle'),
                    t('map.earlierShownOutside', { age: lastKnownAgePhrase(lastKnownLocationUpdatedAt) }),
                  );
                  return;
                }
                Alert.alert(t('map.earlierTitle'), t('map.earlierShown', { age: lastKnownAgePhrase(lastKnownLocationUpdatedAt) }));
              },
            }]
          : []),
        { text: t('map.ok'), style: 'cancel' as const },
      ];

      Alert.alert(t('map.cantFindYouTitle'), locationFailureMessage(resolved), actions);
      devLogControl('recenter', 'location_unavailable', {
        message: resolved.message ?? 'unavailable',
        canAskAgain: resolved.permissionState.canAskAgain,
        granted: resolved.permissionState.granted,
      });
      return false;
    } catch {
      devLogControl('recenter', 'location_error');
      Alert.alert(t('map.cantFindYouTitle'), t('map.tryAgainBody'));
      return false;
    }
  }, [cameraManager, lastKnownLocation, lastKnownLocationUpdatedAt, setCurrentLocation, setHasLocationPermission, setLocationPermissionPrecision, setSnappedLocation]);

  // Compass button: NORTH_UP <-> FOLLOW_HEADING toggle (Google Maps compass model).
  // NORTH_UP -> tap -> lock bearing to north-up (unchanged Phase 11 behavior).
  // FOLLOW_HEADING -> tap -> reset to north-up and stop tracking heading.
  const handleCompassToggle = useCallback(() => {
    if (compassMode === 'FOLLOW_HEADING') {
      setCompassMode('NORTH_UP');
      cameraManager.resetCompass();
      updateSettings({ keepNorthFixed: true });
      devLogControl('compass', 'north_up_reset');
      return;
    }
    setCompassMode('FOLLOW_HEADING');
    updateSettings({ keepNorthFixed: false });
    if (typeof currentLocation?.heading === 'number' && currentLocation.heading >= 0) {
      cameraManager.rotateToHeading(currentLocation.heading);
    }
    devLogControl('compass', 'heading_follow_enabled');
  }, [cameraManager, compassMode, currentLocation, updateSettings]);

  const handleZoomIn = () => {
    cameraManager.nudgeZoom(1, setMapZoomLevel);
  };

  const handleZoomOut = () => {
    cameraManager.nudgeZoom(-1, setMapZoomLevel);
  };

  const handleMapRegionChangeComplete = useCallback((region: Region) => {
    setMapZoomLevel(estimateZoomFromRegion(region));
  }, []);

  // Defensive reset of leftover search-store state (searchQuery/searchResults have no
  // UI surface on Home anymore — LocationsDirectoryScreen owns discovery — but the
  // store fields remain, so anything still holding a stale query/results gets cleared).
  const clearSearch = () => {
    setSearchQuery('');
    setSearchResults([]);
  };

  // Unmount safety: cancel a pending stagger timer so a navigate-away mid-timer (e.g.
  // tap Block, then immediately leave Home before the 260ms sheet-open fires) can't
  // run its callback against a torn-down screen.
  useEffect(() => {
    return () => {
      cancelPendingSheetPresentation();
    };
  }, [cancelPendingSheetPresentation]);

  return {
    mapRef,
    bottomSheetRef,
    cameraManager,
    currentLocation,
    selectedPlace,
    isMapReady,
    snapPoints,
    initialRegion,
    isOffline,
    settings,
    mapZoomLevel,
    updateSettings,
    venueStatus,
    // Pure predicate for 'is this coordinate inside the Ijtema', for views that must not import routing services.
    isInsideVenue: isInsideHomeVenue,
    compassMode,
    setIsMapReady,
    handlePlaceSelect,
    cancelPendingSheetPresentation,
    handleSheetIndexChange,
    handleRecenter,
    handleCompassToggle,
    handleZoomIn,
    handleZoomOut,
    handleMapRegionChangeComplete,
    clearSearch,
    setSelectedPlace,
  };
}

/** Developer diagnostics belong to the ViewModel boundary. */
export const getHomeRouteDiagnostics = () => RoutingService.runRouteDiagnostics();

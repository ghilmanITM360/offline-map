/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  ScrollView,
  Platform,
  StatusBar,
  KeyboardAvoidingView,
  Alert,
  Keyboard,
  BackHandler,
  Animated,
  ActivityIndicator,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import MapView, { Marker, Polygon, Polyline, PROVIDER_GOOGLE, LocalTile } from 'react-native-maps';
import {
  Menu,
  Navigation,
  MapPin,
  ChevronRight,
  WifiOff,
  X,
  Clock,
  ArrowLeft,
} from 'lucide-react-native';
import { BottomSheetModal, BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { useNavigation, DrawerActions, CompositeNavigationProp } from '@react-navigation/native';
import { DrawerNavigationProp } from '@react-navigation/drawer';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useHomeViewModel } from '../../viewmodels/HomeViewModel';
import {
  computeMapControlsInset,
  computeMapContentInsets,
  computeNavControlsInset,
  resolveNavBarHeight,
  resolveOverlayExtent,
  OverlayState,
} from '../../viewmodels/useOverlayInsets';
import { useTheme } from '../../services/useTheme';
import { SHEET_CORNER_RADIUS } from '../components/common/SheetHeader';
import { markerColors, markerSizes, shadows, staticColors } from '../../theme';
import { getDistance } from 'geolib';
import { GRAPH_VALIDATION, IJTEMA_DATA, LANDMARK_PLACES, MAP_BOUNDS } from '../../constants/data';
import { Coordinate, Place, RoutePreview, SearchResult } from '../../models/types';
import { PlaceDetailService } from '../../services/PlaceDetailService';
import { FavoriteService } from '../../services/FavoriteService';
import { useAppStore } from '../../store/useAppStore';
import { RoutePointService } from '../../services/RoutePointService';
import { Paths } from 'expo-file-system';
import { DrawerParamList, RootStackParamList } from '../../navigation/RootNavigator';
import { RoutingService } from '../../services/RoutingService';
import { MapConfigService } from '../../services/MapConfigService';
import { resolveBaseMapMode } from '../../services/BaseMapModeResolver';
import { MapFeatureFlagsService } from '../../services/MapFeatureFlagsService';
import { MapStartupController } from '../../services/MapStartupController';
import { LocationAccessService } from '../../services/LocationAccessService';
import { V2MapRenderingService, MEDIUM_ZOOM, HIGH_ZOOM } from '../../services/V2MapRenderingService';
import { V2NavigationAdapter } from '../../services/V2NavigationAdapter';
import { RoutingServiceV2 } from '../../services/RoutingServiceV2';
import { destinationFromPlace } from '../../services/V2DirectionsService';
import { MapLocalizationService } from '../../services/MapLocalizationService';
import { V2PlaceAdapter } from '../../services/V2PlaceAdapter';
import { IJTEMA_MAP_BOUNDS, IJTEMA_MAP_REGION } from '../../data/ijtema';
import { VenueBoundary } from '../components/map/VenueBoundary';
import { SatelliteDimOverlay } from '../components/map/SatelliteDimOverlay';
import { RastaLayer } from '../components/map/RastaLayer';
import { SpecialRouteLayer } from '../components/map/SpecialRouteLayer';
import { BlockLayer } from '../components/map/BlockLayer';
import { GateLayer } from '../components/map/GateLayer';
import { FacilityLayer } from '../components/map/FacilityLayer';
import { MapLabelOverlay, MapLabelItem, MapLabelOverlayHandle } from '../components/map/MapLabelOverlay';
import { MapControls, MapControlsRecenter } from '../components/map/MapControls';
import { LayersSheet } from '../components/map/LayersSheet';
import { useNavigationOverlayV2 } from '../../viewmodels/useNavigationOverlayV2';
import { useNavigationOverlayV1 } from '../../viewmodels/useNavigationOverlayV1';
import { useMapMode } from '../../viewmodels/useMapMode';
import { NavigationMapLayersV2 } from '../components/navigation/NavigationMapLayersV2';
import { OutsideRoutePolyline } from '../components/navigation/OutsideRoutePolyline';
import { NavigationChromeV2 } from '../components/navigation/NavigationChromeV2';
import { NavigationMapLayersV1 } from '../components/navigation/NavigationMapLayersV1';
import { NavigationChromeV1 } from '../components/navigation/NavigationChromeV1';
import { LocationSheet } from '../components/map/LocationSheet';
import { UserLocationMarker } from '../components/map/UserLocationMarker';
import { resolveMapMarkerOwnership } from '../components/map/MapMarkerOwnership';
import { LocationTutorialTooltip } from '../components/map/LocationTutorialTooltip';
import { resolveTapCandidate, TapCandidate } from '../../services/TapDisambiguationService';
import { Z } from '../styles/zLayers';

declare const __DEV__: boolean;

type HomeScreenNavigationProp = CompositeNavigationProp<
  DrawerNavigationProp<DrawerParamList, 'Home'>,
  NativeStackNavigationProp<RootStackParamList>
>;

const getTilePath = (): string => `${Paths.document.uri}tiles/{z}_{x}_{y}.png`;

// Static — derived only from the fixed MAP_BOUNDS constant, so it never needs to be
// recomputed per render.
const VENUE_BOUNDARY = [
  { latitude: MAP_BOUNDS.minLat, longitude: MAP_BOUNDS.minLng },
  { latitude: MAP_BOUNDS.minLat, longitude: MAP_BOUNDS.maxLng },
  { latitude: MAP_BOUNDS.maxLat, longitude: MAP_BOUNDS.maxLng },
  { latitude: MAP_BOUNDS.maxLat, longitude: MAP_BOUNDS.minLng },
];

// Phase 11 (task #38): padded 50% beyond the venue bounds so the satellite dim scrim also
// covers the approach streets/gates just outside the venue, not only the interior.
const SATELLITE_DIM_LAT_PAD = (IJTEMA_MAP_BOUNDS.maxLat - IJTEMA_MAP_BOUNDS.minLat) * 0.5;
const SATELLITE_DIM_LNG_PAD = (IJTEMA_MAP_BOUNDS.maxLng - IJTEMA_MAP_BOUNDS.minLng) * 0.5;
const SATELLITE_DIM_BOUNDARY = [
  { latitude: IJTEMA_MAP_BOUNDS.minLat - SATELLITE_DIM_LAT_PAD, longitude: IJTEMA_MAP_BOUNDS.minLng - SATELLITE_DIM_LNG_PAD },
  { latitude: IJTEMA_MAP_BOUNDS.minLat - SATELLITE_DIM_LAT_PAD, longitude: IJTEMA_MAP_BOUNDS.maxLng + SATELLITE_DIM_LNG_PAD },
  { latitude: IJTEMA_MAP_BOUNDS.maxLat + SATELLITE_DIM_LAT_PAD, longitude: IJTEMA_MAP_BOUNDS.maxLng + SATELLITE_DIM_LNG_PAD },
  { latitude: IJTEMA_MAP_BOUNDS.maxLat + SATELLITE_DIM_LAT_PAD, longitude: IJTEMA_MAP_BOUNDS.minLng - SATELLITE_DIM_LNG_PAD },
];

function isPlace(item: Place | SearchResult): item is Place {
  return 'name' in item;
}

function getDisplayName(item: Place | SearchResult): string {
  return isPlace(item) ? item.name : item.title;
}

function getSecondaryDisplayName(item: Place | SearchResult): string | undefined {
  if (!isPlace(item)) return undefined;
  return MapLocalizationService.getSecondaryLabel({ en: item.name, ur: item.urduName });
}

type V2PreviewRoute = Extract<RoutePreview, { sourceVersion: 'v2' }> & {
  startLabel: string;
  destinationLabel: string;
  startResolution?: {
    mode: 'inside' | 'outside';
    coordinate: { latitude: number; longitude: number };
    gate?: { id: string; name: { en: string } };
  };
  outsideLegCoordinateCount?: number;
  outsideLegSanityCapExceeded?: boolean;
};

function isV2PreviewRoute(route: unknown): route is V2PreviewRoute {
  return Boolean(
    route &&
    typeof route === 'object' &&
    'startResolution' in route &&
    'destinationLabel' in route &&
    !('routeId' in route),
  );
}

export function HomeScreen() {
  const nav = useNavigation<HomeScreenNavigationProp>();
  const currentLocation = useAppStore((s) => s.currentLocation);
  const currentLocationSource = useAppStore((s) => s.currentLocationSource);
  const hasLocationPermission = useAppStore((s) => s.hasLocationPermission);
  const hasSeenMapOverview = useAppStore((s) => s.hasSeenMapOverview);
  const setHasSeenMapOverview = useAppStore((s) => s.setHasSeenMapOverview);
  const setCurrentLocation = useAppStore((s) => s.setCurrentLocation);
  const hasSeenLocationTutorial = useAppStore((s) => s.hasSeenLocationTutorial);
  const setHasSeenLocationTutorial = useAppStore((s) => s.setHasSeenLocationTutorial);
  const activeRoute = useAppStore((s) => s.activeRoute);
  const offlineMapStatus = useAppStore((s) => s.offlineMapStatus);
  const clearRoutePlanner = useAppStore((s) => s.clearRoutePlanner);
  const favorites = useAppStore((s) => s.favorites);
  // Deliberately the raw store primitive, not `mode` — used only below to null out
  // activePreviewRoute once a real nav session starts, and `mode` is itself derived FROM
  // activePreviewRoute (see useMapMode() below), so reading `mode` here would be circular. See
  // the `isNavigating` doc comment in useAppStore.ts and test-navigation-architecture-audit.ts
  // Finding 6.
  const isNavigating = useAppStore((s) => s.isNavigating);
  const routePlannerDest = useAppStore((s) => s.routePlannerDest);
  const routePlannerOrigin = useAppStore((s) => s.routePlannerOrigin);
  const showGraphNodes = useAppStore((s) => s.showGraphNodes);
  const setShowGraphNodes = useAppStore((s) => s.setShowGraphNodes);
  const showRastaNames = useAppStore((s) => s.showRastaNames);
  const setShowRastaNames = useAppStore((s) => s.setShowRastaNames);
  const showBlockPolygons = useAppStore((s) => s.showBlockPolygons);
  const setShowBlockPolygons = useAppStore((s) => s.setShowBlockPolygons);
  const showGatesLayer = useAppStore((s) => s.showGatesLayer);
  const setShowGatesLayer = useAppStore((s) => s.setShowGatesLayer);
  const showRastasLayer = useAppStore((s) => s.showRastasLayer);
  const setShowRastasLayer = useAppStore((s) => s.setShowRastasLayer);
  const showSpecialRoutesLayer = useAppStore((s) => s.showSpecialRoutesLayer);
  const setShowSpecialRoutesLayer = useAppStore((s) => s.setShowSpecialRoutesLayer);
  const showRouteDiagnostics = useAppStore((s) => s.showRouteDiagnostics);
  const setShowRouteDiagnostics = useAppStore((s) => s.setShowRouteDiagnostics);
  const developerModeEnabled = useAppStore((s) => s.developerModeEnabled);
  const startNavigation = useAppStore((s) => s.startNavigation);
  const [selectedEntryIdx, setSelectedEntryIdx] = useState(0);
  const [directionsDestination, setDirectionsDestination] = useState<Place | null>(null);
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const searchInputRef = useRef<TextInput>(null);
  const mapLabelOverlayRef = useRef<MapLabelOverlayHandle>(null);
  // Startup camera ownership (see onMapReady below) fires once per mount only. Returning
  // launches resolve fresh GPS asynchronously, so the request/intent refs keep late results
  // from stealing camera ownership after a newer user action.
  const startupCameraRequestStartedRef = useRef(false);
  const startupCameraCommittedRef = useRef(false);
  const startupCameraRequestGenerationRef = useRef(0);
  const startupCameraIntentGenerationRef = useRef(0);
  const startupMapReadyReleasedRef = useRef(false);
  const mapReadyRef = useRef(false);
  const mountedRef = useRef(true);
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const mapRuntimeStatus = MapConfigService.getRuntimeStatus();
  const hasGoogleMapsKey = mapRuntimeStatus.keyPresent;
  const useV2Map = MapFeatureFlagsService.useIjtemaV2Map();
  const [outsideBannerDismissed, setOutsideBannerDismissed] = useState(false);
  const [layersSheetVisible, setLayersSheetVisible] = useState(false);
  const [mapReady, setMapReadyState] = useState(false);
  const [googleBaseMapLoaded, setGoogleBaseMapLoaded] = useState(false);
  const [mapLoadFailed, setMapLoadFailed] = useState(false);
  const [topOverlayHeight, setTopOverlayHeight] = useState(0);
  const [isMapDragging, setIsMapDragging] = useState(false);
  const [recenterState, setRecenterState] = useState<'idle' | 'loading' | 'success' | 'failure'>('idle');
  const [showLocationTutorial, setShowLocationTutorial] = useState(false);
  const [detailsExpanded, setDetailsExpanded] = useState(false);
  // -1 = closed. Tracked (not derived from mode) because PLACE_SELECTED/ROUTE_PREVIEW
  // cover two distinct snap heights (15%/50% peek vs preview) that mode alone can't
  // distinguish — see onChange below and useOverlayInsets.computeMapControlsInset.
  const [sheetIndex, setSheetIndex] = useState(-1);
  const { height: windowHeight } = useWindowDimensions();
  const searchFocusAnim = useRef(new Animated.Value(0)).current;
  const warningAnim = useRef(new Animated.Value(0)).current;
  const userPulseAnim = useRef(new Animated.Value(0)).current;
  const chipsAnim = useRef(new Animated.Value(1)).current;

  const dismissSearchOverlay = useCallback(() => {
    setIsSearchFocused(false);
    searchInputRef.current?.blur();
    Keyboard.dismiss();
  }, []);

  // MapMode actions — the only sanctioned way to move the map surface between modes.
  // selectPlace/showRoutePreview/startNavigation already exist as handlePlaceSelect/
  // handleOpenDirections/handleStartPreviewNavigation below; they aren't re-wrapped here
  // to avoid two names for the same entry point.
  const logHomeControl = useCallback((pressed: string, action: string) => {
    if (__DEV__) {
      console.log(`[HomeControl] pressed=${pressed} action=${action}`);
    }
  }, []);

  const {
    mapRef,
    bottomSheetRef,
    cameraManager,
    mapType,
    searchQuery,
    searchResults,
    selectedPlace,
    recentSearches,
    snapPoints,
    initialRegion,
    isOffline,
    offlineData,
    activeCategory,
    categoryChips,
    searchPlaceholder,
    suggestedPlaces,
    mapZoomLevel,
    venueStatus,
    compassMode,
    setIsMapReady,
    handleSearch,
    handlePlaceSelect,
    cancelPendingSheetPresentation,
    handleSheetIndexChange,
    handleRecenter,
    handleCompassToggle,
    handleZoomIn,
    handleZoomOut,
    handleMapRegionChangeComplete,
    clearSearch,
    handleCategoryPress,
    setSelectedPlace,
    updateSettings,
    settings,
  } = useHomeViewModel();

  const releaseStartupMapReady = useCallback(() => {
    if (!mapReadyRef.current || startupMapReadyReleasedRef.current) return;
    startupMapReadyReleasedRef.current = true;
    setIsMapReady(true);
  }, [setIsMapReady]);

  const invalidateStartupCameraIntent = useCallback(() => {
    startupCameraIntentGenerationRef.current += 1;
    if (startupCameraRequestStartedRef.current && !startupCameraCommittedRef.current) {
      releaseStartupMapReady();
    }
  }, [releaseStartupMapReady]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      mapReadyRef.current = false;
      startupCameraIntentGenerationRef.current += 1;
      startupCameraRequestGenerationRef.current += 1;
    };
  }, []);

  const baseMapMode = resolveBaseMapMode({
    hasGoogleMapsKey,
    hasInternet: !isOffline,
    googleMapLoadFailed: mapLoadFailed,
    offlineDataDownloaded: offlineData.isDownloaded,
    offlineMapStatus,
  });
  const graphOnlyFallbackUsed = baseMapMode === 'GRAPH_ONLY';
  const hasBaseMap = baseMapMode !== 'GRAPH_ONLY';

  const showDetails = useCallback(() => {
    setDetailsExpanded(true);
    bottomSheetRef.current?.snapToIndex(2);
  }, [bottomSheetRef]);

  const closeDetails = useCallback(() => {
    setDetailsExpanded(false);
    bottomSheetRef.current?.snapToIndex(1);
  }, [bottomSheetRef]);

  // Tap disambiguation: react-native-maps dispatches one onPress per native shape
  // that a tap actually hits, independently per layer — a tap landing where a
  // widened gate hit-area overlaps a rasta hit-corridor can fire both in the same
  // gesture. Candidates are collected for one animation frame (imperceptible delay,
  // well under the 100ms Google-Maps-parity target) and resolved to a single winner
  // via TapDisambiguationService instead of whichever layer happened to register
  // last winning by accident. The overwhelmingly common case (exactly one shape hit)
  // resolves on the very next frame with no user-visible difference from calling
  // handlePlaceSelect directly.
  const tapCandidatesRef = useRef<TapCandidate<Place>[]>([]);
  const tapFlushScheduledRef = useRef(false);
  const selectedPlaceIdRef = useRef<string | undefined>(undefined);
  selectedPlaceIdRef.current = selectedPlace?.id;

  const handlePlaceSelectWithCameraIntent = useCallback((place: Place) => {
    invalidateStartupCameraIntent();
    handlePlaceSelect(place);
  }, [handlePlaceSelect, invalidateStartupCameraIntent]);

  const collectTapCandidate = useCallback((candidate: TapCandidate<Place>) => {
    invalidateStartupCameraIntent();
    tapCandidatesRef.current.push(candidate);
    if (tapFlushScheduledRef.current) return;
    tapFlushScheduledRef.current = true;
    requestAnimationFrame(() => {
      const candidates = tapCandidatesRef.current;
      tapCandidatesRef.current = [];
      tapFlushScheduledRef.current = false;
      const winner = resolveTapCandidate(candidates, selectedPlaceIdRef.current);
      if (!winner) return;
      dismissSearchOverlay();
      handlePlaceSelectWithCameraIntent(winner.payload);
    });
  }, [dismissSearchOverlay, handlePlaceSelectWithCameraIntent, invalidateStartupCameraIntent]);

  const navOverlay = useNavigationOverlayV2({
    mapRef,
    mapReady,
    mapZoomLevel,
    hasBaseMap,
    userPulseAnim,
    cameraManager,
  });
  const showNavOverlay = navOverlay.active && MapFeatureFlagsService.useIjtemaV2Navigation();

  // Legacy (v1) destinations navigate in-place too now — no separate NavigationScreen.
  // v1's activeRoute and v2's are mutually exclusive by construction (one global
  // `activeRoute`/`isNavigating` pair in the store), so at most one of these is ever active.
  const navOverlayV1 = useNavigationOverlayV1({
    mapRef,
    mapReady,
    hasBaseMap,
    userPulseAnim,
    cameraManager,
  });
  const showAnyNavOverlay = showNavOverlay || navOverlayV1.active;
  const handleNavigationPan = useCallback(() => {
    if (showNavOverlay) {
      navOverlay.setIsAutoFollowing(false);
    } else if (navOverlayV1.active) {
      navOverlayV1.setIsAutoFollowing(false);
    }
    cameraManager.stopFollowing();
  }, [cameraManager, navOverlay, navOverlayV1, showNavOverlay]);
  // Real GPS-arrival signal (V2NavigationRuntimeService-backed distance check for v2,
  // inline distance check for v1) — feeds MapMode.ARRIVAL directly instead of a separate,
  // never-set local flag, so "destination reached" actually flips NAVIGATION -> ARRIVAL.
  const arrived = navOverlay.arrived || navOverlayV1.arrived;

  const activePreviewRoute = useMemo(() => {
    if (isNavigating) return null;
    if (!routePlannerDest || !destinationFromPlace(routePlannerDest)) return null;
    return isV2PreviewRoute(activeRoute) ? activeRoute : null;
  }, [activeRoute, isNavigating, routePlannerDest]);

  // CameraManager.fitRoute() — camera frames origin + destination + full route whenever a
  // route preview opens (or a different route is chosen), instead of leaving the camera
  // wherever it happened to be when the user picked a destination.
  useEffect(() => {
    if (!activePreviewRoute || activePreviewRoute.coordinates.length < 2) return;
    invalidateStartupCameraIntent();
    const sheetExtent = resolveOverlayExtent({ kind: 'sheet', windowHeight, snapPoints, sheetIndex });
    cameraManager.fitRoute(activePreviewRoute.coordinates, {
      top: 90,
      right: 64,
      bottom: sheetExtent + Math.max(insets.bottom, 16) + 32,
      left: 64,
    });
  }, [activePreviewRoute, cameraManager, insets.bottom, invalidateStartupCameraIntent, windowHeight, snapPoints, sheetIndex]);

  // Single source of truth for "what is the map surface showing right now" — every
  // render/behavior gate below reads `mode`, never the raw isSearchFocused/arrived/etc
  // inputs directly, so nothing can drift out of sync with the priority chain in
  // deriveMapMode (e.g. isSearchFocused=true no longer implies "search is showing" if
  // arrived or showNavOverlay also happen to be true — mode already resolves that).
  const mode = useMapMode({
    arrived,
    showNavOverlay: showAnyNavOverlay,
    isSearchFocused,
    detailsExpanded,
    directionsDestination,
    activePreviewRoute,
    selectedPlace,
  });
  const modeRef = useRef<typeof mode>('EXPLORE');
  modeRef.current = mode;

  const startupCameraStillOwnsIntent = useCallback((requestGeneration: number, cameraIntentGeneration: number) => (
    mountedRef.current &&
    mapReadyRef.current &&
    startupCameraRequestGenerationRef.current === requestGeneration &&
    startupCameraIntentGenerationRef.current === cameraIntentGeneration &&
    !startupCameraCommittedRef.current &&
    modeRef.current === 'EXPLORE'
  ), []);

  const commitStartupVenueBounds = useCallback((
    venueBoundary: Coordinate[],
    reason: 'first_overview' | 'no_gps',
    requestGeneration: number,
    cameraIntentGeneration: number,
  ) => {
    if (!startupCameraStillOwnsIntent(requestGeneration, cameraIntentGeneration)) return;
    startupCameraCommittedRef.current = true;
    cameraManager.fitVenueBounds(venueBoundary);
    if (reason === 'first_overview') setHasSeenMapOverview(true);
    releaseStartupMapReady();
  }, [cameraManager, releaseStartupMapReady, setHasSeenMapOverview, startupCameraStillOwnsIntent]);

  const commitStartupLiveLocation = useCallback((
    coordinate: typeof currentLocation,
    requestGeneration: number,
    cameraIntentGeneration: number,
  ) => {
    if (!coordinate) return;
    if (!startupCameraStillOwnsIntent(requestGeneration, cameraIntentGeneration)) return;
    startupCameraCommittedRef.current = true;
    setCurrentLocation(coordinate, 'live');
    cameraManager.animateToUser(coordinate);
    releaseStartupMapReady();
  }, [cameraManager, releaseStartupMapReady, setCurrentLocation, startupCameraStillOwnsIntent]);

  const beginStartupCameraDecision = useCallback((venueBoundary: Coordinate[]) => {
    if (startupCameraRequestStartedRef.current) return;
    startupCameraRequestStartedRef.current = true;
    const requestGeneration = startupCameraRequestGenerationRef.current + 1;
    startupCameraRequestGenerationRef.current = requestGeneration;
    const cameraIntentGeneration = startupCameraIntentGenerationRef.current;

    if (!mountedRef.current || !mapReadyRef.current || modeRef.current !== 'EXPLORE') {
      releaseStartupMapReady();
      return;
    }

    if (!hasSeenMapOverview) {
      commitStartupVenueBounds(venueBoundary, 'first_overview', requestGeneration, cameraIntentGeneration);
      return;
    }

    void MapStartupController.resolveReturningLaunchCamera(
      { hasSeenMapOverview, hasLocationPermission },
      () => LocationAccessService.resolveCurrentLocation(false),
    ).then((decision) => {
      if (decision.action === 'ANIMATE_TO_USER') {
        commitStartupLiveLocation(decision.coordinate, requestGeneration, cameraIntentGeneration);
        return;
      }
      commitStartupVenueBounds(venueBoundary, decision.reason, requestGeneration, cameraIntentGeneration);
    });
  }, [
    commitStartupLiveLocation,
    commitStartupVenueBounds,
    hasLocationPermission,
    hasSeenMapOverview,
    releaseStartupMapReady,
  ]);

  useEffect(() => {
    if (mode === 'ROUTE_PREVIEW' || mode === 'NAVIGATION' || mode === 'ARRIVAL') {
      invalidateStartupCameraIntent();
    }
  }, [invalidateStartupCameraIntent, mode]);

  const hasNavigationUserLocation = Boolean(
    showNavOverlay
      ? navOverlay.snappedLocation
      : navOverlayV1.active
        ? navOverlayV1.snappedLocation
        : null,
  );
  const markerOwnership = resolveMapMarkerOwnership(mode, hasNavigationUserLocation);

  type SheetDismissalReason = 'state-reset' | 'start-navigation' | 'replacement';
  const sheetRouteDestination = directionsDestination ?? (activePreviewRoute ? routePlannerDest : null);
  const sheetIdentity = sheetRouteDestination
    ? `route:${sheetRouteDestination.id}`
    : selectedPlace
      ? `place:${selectedPlace.id}`
      : null;
  const currentSheetIdentityRef = useRef<string | null>(sheetIdentity);
  currentSheetIdentityRef.current = sheetIdentity;
  const closingSheetIdentityRef = useRef<string | null>(null);
  const programmaticSheetDismissRef = useRef<{ identity: string | null; reason: SheetDismissalReason } | null>(null);
  const sheetDismissHandledRef = useRef(false);

  const prepareProgrammaticSheetDismiss = useCallback((reason: SheetDismissalReason) => {
    programmaticSheetDismissRef.current = { identity: currentSheetIdentityRef.current, reason };
    cancelPendingSheetPresentation();
  }, [cancelPendingSheetPresentation]);

  const resetDismissedSheetState = useCallback((clearPlanner: boolean) => {
    cancelPendingSheetPresentation();
    if (clearPlanner) clearRoutePlanner();
    setDirectionsDestination(null);
    setDetailsExpanded(false);
    setSelectedEntryIdx(0);
    setSelectedPlace(null);
    setSheetIndex(-1);
    handleSheetIndexChange(-1);
  }, [cancelPendingSheetPresentation, clearRoutePlanner, handleSheetIndexChange, setSelectedPlace]);

  const wasNavigatingRef = useRef(isNavigating);
  useEffect(() => {
    const navigationEnded = wasNavigatingRef.current && !isNavigating;
    wasNavigatingRef.current = isNavigating;
    if (!navigationEnded) return;
    // Canonical navigation exit (arrival Done or confirmed mid-trip Exit) already
    // clears route/runtime state in the store. Retire Home-owned selection/planner
    // and transient search state here so Explore cannot resurrect destination or
    // search-result browse pins.
    clearSearch();
    resetDismissedSheetState(true);
  }, [clearSearch, isNavigating, resetDismissedSheetState]);

  const closeSearch = useCallback(() => {
    clearSearch();
    dismissSearchOverlay();
  }, [clearSearch, dismissSearchOverlay]);

  const openSearch = useCallback(() => {
    invalidateStartupCameraIntent();
    const currentIdentity = currentSheetIdentityRef.current;
    if (currentIdentity) {
      prepareProgrammaticSheetDismiss('replacement');
      resetDismissedSheetState(currentIdentity.startsWith('route:'));
      bottomSheetRef.current?.close();
    }
    setIsSearchFocused(true);
  }, [bottomSheetRef, invalidateStartupCameraIntent, prepareProgrammaticSheetDismiss, resetDismissedSheetState]);

  const selectCategory = useCallback((category: string) => {
    const currentIdentity = currentSheetIdentityRef.current;
    if (currentIdentity) {
      prepareProgrammaticSheetDismiss('state-reset');
      resetDismissedSheetState(currentIdentity.startsWith('route:'));
      bottomSheetRef.current?.close();
    }
    handleCategoryPress(category);
  }, [bottomSheetRef, handleCategoryPress, prepareProgrammaticSheetDismiss, resetDismissedSheetState]);

  const handleSheetDismiss = useCallback(() => {
    cancelPendingSheetPresentation();
    if (sheetDismissHandledRef.current) return;

    const dismissedIdentity = closingSheetIdentityRef.current ?? currentSheetIdentityRef.current;
    const programmaticDismiss = programmaticSheetDismissRef.current;
    closingSheetIdentityRef.current = null;
    programmaticSheetDismissRef.current = null;
    sheetDismissHandledRef.current = true;
    setSheetIndex(-1);
    handleSheetIndexChange(-1);

    if (!dismissedIdentity) return;
    if (programmaticDismiss?.identity === dismissedIdentity) return;
    // Portal dismissal can finish after a rapid re-selection. Only the identity that
    // actually began closing may be reset; a newer selection owns the shared sheet now.
    if (currentSheetIdentityRef.current !== dismissedIdentity) return;
    resetDismissedSheetState(dismissedIdentity.startsWith('route:'));
  }, [cancelPendingSheetPresentation, handleSheetIndexChange, resetDismissedSheetState]);

  useEffect(() => {
    setSelectedEntryIdx(0);
  }, [selectedPlace?.id]);


  const entryPoints = useMemo(
    () => (selectedPlace?.category === 'Block' && selectedPlace.sourceVersion !== 'v2'
      ? PlaceDetailService.getEntryPoints(selectedPlace.id)
      : []),
    [selectedPlace],
  );
  const blockGates = useMemo(
    () => (selectedPlace?.category === 'Block' && selectedPlace.sourceVersion !== 'v2'
      ? PlaceDetailService.getBlockGates(selectedPlace.id)
      : []),
    [selectedPlace],
  );

  const selectedPlaceMarkerCoordinate = useMemo(() => {
    if (!selectedPlace) return null;
    if (selectedPlace.sourceVersion === 'v2') {
      return V2PlaceAdapter.getMarkerCoordinate(selectedPlace);
    }
    if (selectedPlace.category === 'Block' && entryPoints[selectedEntryIdx]) {
      return RoutePointService.nodeToCoordinate(entryPoints[selectedEntryIdx].nodeId) ?? selectedPlace.coordinate;
    }
    return RoutePointService.getDestinationCoordinate(selectedPlace);
  }, [selectedPlace, entryPoints, selectedEntryIdx]);
  const overlayPlaces = useMemo(
    () => searchResults.filter((item) => (item as any).coordinate && (item as any).id !== selectedPlace?.id),
    [searchResults, selectedPlace],
  );

  const { outside: previewOutsideLegCoordinates, inside: previewInsideLegCoordinates } = useMemo(
    () => V2MapRenderingService.splitOutsideInsideCoordinates(
      activePreviewRoute?.coordinates ?? [],
      activePreviewRoute?.outsideLegCoordinateCount,
    ),
    [activePreviewRoute],
  );
  const previewDestination = activePreviewRoute ? routePlannerDest : null;
  // Single route-preview surface: whichever of the two ways a route preview can start
  // (explicit "Directions" tap -> directionsDestination, or a v2 route already resolved
  // in the store, e.g. restored on relaunch -> activePreviewRoute/previewDestination)
  // resolves to the same destination shown in the same LocationSheet routePreview mode.
  const routePreviewSheetDestination = directionsDestination ?? previewDestination;
  const previewDestinationCoordinate = previewDestination
    ? V2PlaceAdapter.getMarkerCoordinate(previewDestination) ?? activePreviewRoute?.coordinates[activePreviewRoute.coordinates.length - 1] ?? null
    : null;
  const previewStartCoordinate = activePreviewRoute
    ? routePlannerOrigin
      ? V2PlaceAdapter.getMarkerCoordinate(routePlannerOrigin) ?? activePreviewRoute.coordinates[0] ?? null
      : activePreviewRoute.startResolution?.coordinate ?? activePreviewRoute.coordinates[0] ?? null
    : null;
  const showPreviewStartMarker = Boolean(
    activePreviewRoute &&
    routePlannerOrigin &&
    previewStartCoordinate
  );
  const previewEntryGateId = activePreviewRoute?.startResolution?.mode === 'outside'
    ? activePreviewRoute.startResolution.gate?.id ?? null
    : null;
  const v2MapLayers = useMemo(
    () => V2MapRenderingService.getHomeLayers({
      selectedPlaceId: selectedPlace?.id,
      selectedPlace,
      developerMode: __DEV__ && developerModeEnabled,
      graphOnlyFallback: graphOnlyFallbackUsed,
      zoomLevel: mapZoomLevel,
      mapFilter: activeCategory,
      showGatesLayer,
      showRastasLayer,
      showSpecialRoutesLayer,
      // PLACE_SELECTED: dot-suppress (not hide) other blocks/gates competing with the
      // selected marker for attention — see PLACE_SELECTED_COMPETING_RADIUS_M.
      suppressCompetingMarkers: mode === 'PLACE_SELECTED',
    }),
    [
      activeCategory,
      developerModeEnabled,
      graphOnlyFallbackUsed,
      mapZoomLevel,
      mode,
      selectedPlace,
      showGatesLayer,
      showRastasLayer,
      showSpecialRoutesLayer,
    ],
  );
  // ROUTE_PREVIEW: hide unrelated blocks/gates/rastas/special-routes entirely — only the
  // destination, the resolved entry gate (outside-start routes), current location, and
  // the route line itself stay visible. Sourced from v2MapLayers.blocks/gates (the
  // unfiltered arrays) rather than the zoom-LOD visible* fields so the destination/entry
  // gate can't be dropped by an unrelated LOD/collision rule.
  // Declutter only once an actual route exists to preview — not while directionsDestination
  // alone is set (still picking a start point), since ROUTE_PREVIEW now covers both.
  const routePreviewDeclutterActive = mode === 'ROUTE_PREVIEW' && !directionsDestination && !!activePreviewRoute;
  const previewVisibleBlocks = routePreviewDeclutterActive
    ? v2MapLayers.blocks.filter((block) => block.isSelected)
    : v2MapLayers.visibleBlocks;
  const previewVisibleGateMarkers = routePreviewDeclutterActive
    ? v2MapLayers.gates.filter((gate) => gate.isSelected || gate.id === previewEntryGateId)
    : v2MapLayers.visibleGateMarkers;
  const previewVisibleRastas = routePreviewDeclutterActive ? [] : v2MapLayers.visibleRastas;
  const previewVisibleSpecialRoutes = routePreviewDeclutterActive ? [] : v2MapLayers.specialRoutes;

  // Feeds the single shared MapLabelOverlay (see docs/TARGETED_FIX_SPRINT_REPORT.md
  // Phase 5 for why label text moved out of Marker children). LOD text logic mirrors
  // what GateLayer computed inline before the refactor.
  const mapLabelItems = useMemo<MapLabelItem[]>(() => {
    if (showNavOverlay) {
      return navOverlay.mapLayers.gates.map((gate) => ({
        id: `nav_gate_${gate.id}`,
        coordinate: gate.coordinate,
        text: gate.label.replace('Gate ', 'G'),
        kind: 'gate' as const,
        navPreview: true,
        needsConnectorVerification: gate.needsConnectorVerification,
        zPriority: 12,
      }));
    }
    // Legacy (v1) navigation never had a label overlay — its map layers are plain
    // Polygon/Polyline elements, not v2MapLayers, so v2's gate/block/rasta labels
    // would be visually mismatched if rendered on top of a v1 nav session.
    if (navOverlayV1.active) return [];
    if (!useV2Map) return [];

    const items: MapLabelItem[] = [];
    const gateFocused = v2MapLayers.activeMapFilter === 'gates';
    for (const gate of v2MapLayers.visibleGateMarkers) {
      if (gate.labelSuppressed && !gate.isSelected) continue;
      const gateNum = gate.label.replace('Gate ', '');
      const showFull = gate.isSelected || mapZoomLevel >= HIGH_ZOOM;
      const showCompact = !showFull && mapZoomLevel >= MEDIUM_ZOOM;
      const displayLabel = showFull ? gate.label : showCompact ? `G${gateNum}` : gateNum;
      items.push({
        id: `gate_${gate.id}`,
        coordinate: gate.coordinate,
        text: displayLabel,
        secondaryText: showFull ? MapLocalizationService.getSecondaryLabel(gate.name) : undefined,
        kind: 'gate',
        variant: showFull ? 'full' : showCompact ? 'compact' : 'number',
        isSelected: gate.isSelected,
        focused: gateFocused,
        needsConnectorVerification: gate.needsConnectorVerification,
        zPriority: gate.isSelected ? 16 : gateFocused ? 14 : 12,
        onPress: () => {
          const place = V2PlaceAdapter.getPlaceById(gate.id);
          if (!place) return;
          dismissSearchOverlay();
          handlePlaceSelectWithCameraIntent(place);
        },
      });
    }

    const blockFocused = v2MapLayers.activeMapFilter === 'blocks';
    for (const block of v2MapLayers.visibleBlockLabels) {
      items.push({
        id: `block_${block.id}`,
        coordinate: block.center,
        text: block.label,
        secondaryText: MapLocalizationService.getSecondaryLabel(block.name),
        kind: 'block',
        isSelected: block.isSelected,
        focused: blockFocused,
        zPriority: 8,
        onPress: () => {
          const place = V2PlaceAdapter.getPlaceById(block.id);
          if (!place) return;
          dismissSearchOverlay();
          handlePlaceSelectWithCameraIntent(place);
        },
      });
    }

    const rastaFocused = v2MapLayers.activeMapFilter === 'rastas';
    for (const rasta of v2MapLayers.visibleRastaLabels) {
      items.push({
        id: `rasta_${rasta.id}`,
        coordinate: rasta.labelCoordinate,
        text: rasta.label,
        secondaryText: MapLocalizationService.getSecondaryLabel(rasta.name),
        kind: 'rasta',
        isSelected: rasta.isSelected,
        focused: rastaFocused,
        zPriority: 7,
        onPress: () => {
          const place = V2PlaceAdapter.getPlaceById(rasta.id);
          if (!place) return;
          dismissSearchOverlay();
          handlePlaceSelectWithCameraIntent(place);
        },
      });
    }

    const routeFocused = v2MapLayers.activeMapFilter === 'special_routes';
    for (const route of v2MapLayers.visibleSpecialRouteLabels) {
      items.push({
        id: `route_${route.id}`,
        coordinate: route.labelCoordinate,
        text: route.label,
        secondaryText: MapLocalizationService.getSecondaryLabel(route.name),
        kind: 'route',
        isSelected: route.isSelected,
        focused: routeFocused,
        zPriority: 9,
        onPress: () => {
          const place = V2PlaceAdapter.getPlaceById(route.id);
          if (!place) return;
          dismissSearchOverlay();
          handlePlaceSelectWithCameraIntent(place);
        },
      });
    }

    return items;
  }, [showNavOverlay, navOverlay.mapLayers.gates, navOverlayV1.active, useV2Map, v2MapLayers, mapZoomLevel, dismissSearchOverlay, handlePlaceSelectWithCameraIntent]);

  const effectiveInitialRegion = useV2Map
    ? {
        latitude: IJTEMA_MAP_REGION.latitude,
        longitude: IJTEMA_MAP_REGION.longitude,
        latitudeDelta: IJTEMA_MAP_REGION.latitudeDelta + 0.002,
        longitudeDelta: IJTEMA_MAP_REGION.longitudeDelta + 0.002,
      }
    : initialRegion;

  const walkingTimeMin = (selectedPlace && currentLocation && selectedPlace.sourceVersion !== 'v2')
    ? PlaceDetailService.estimateWalkingTime(
      selectedPlace.category === 'Block'
        ? PlaceDetailService.distanceToBlock(selectedPlace.id, currentLocation)
        : getDistance(currentLocation, selectedPlace.coordinate),
      settings.walkingSpeed ?? 1.4,
    )
    : null;

  const isFav = selectedPlace ? favorites.some((f) => f.placeId === selectedPlace.id) : false;
  const showOutsideBanner = !!currentLocation && !venueStatus.insideVenue && !outsideBannerDismissed && !activePreviewRoute && mode !== 'SEARCH' && searchQuery.length === 0 && !activeCategory;
  const nearestEntryGate = useMemo(() => {
    if (!currentLocation || venueStatus.insideVenue) return null;
    // Destination-aware whenever a place is already selected, so this banner can
    // never disagree with the gate Directions would actually route through for the
    // same position + destination (see RoutingServiceV2.recommendOutsideEntryGate).
    const destination = selectedPlace ? destinationFromPlace(selectedPlace) : null;
    return RoutingServiceV2.recommendOutsideEntryGate(currentLocation, destination) ?? null;
  }, [currentLocation, venueStatus.insideVenue, selectedPlace]);
  const outsideBannerAccessibilityLabel = nearestEntryGate
    ? `Outside Ijtema. Suggested entry through ${nearestEntryGate.name.en}. Final entry gate is confirmed when route preview is calculated.`
    : 'Outside Ijtema. Suggested entry unavailable. Final entry gate is confirmed when route preview is calculated.';
  const showMapWarningBanner = baseMapMode === 'GRAPH_ONLY';
  const topInsetBase = Math.max(insets.top, Platform.OS === 'android' ? StatusBar.currentHeight ?? 0 : 0);
  // bannerStackTop used to be a hardcoded `topInsetBase + 140` guess at the combined
  // search bar + chip row height, which under-measured on some font scales/screen sizes
  // and let the banner overlap the chip row. Now derived from the search+chip overlay's
  // own onLayout height (topOverlayHeight). Falls back to the old constant only for the
  // one frame before the first layout pass reports a height.
  const bannerStackTop = topOverlayHeight > 0 ? topOverlayHeight + 8 : topInsetBase + 140;
  // The full Layers/Compass/Zoom/Recenter cluster is one bottom-anchored stack (see
  // MapControls) instead of two independently-positioned pieces (a top-anchored
  // compass/zoom group and a separately bottom-anchored recenter button). Anchoring
  // everything from this single bottom value means the whole stack moves together and
  // can't collide with itself. Route preview lives inside the same BottomSheetModal as
  // place preview/details/directions (no separate floating card), so this always clears
  // the sheet at whatever snap height it's actually at (see useOverlayInsets.computeMapControlsInset).
  const controlStackOverlay: OverlayState = { kind: 'sheet', windowHeight, snapPoints, sheetIndex };
  const controlStackBottom = computeMapControlsInset(insets.bottom, controlStackOverlay);
  // Keeps block/gate/rasta/route labels from rendering under the search bar/chip
  // row (top) or the layers/compass/zoom/recenter control column (right, widest
  // button is the 56dp recenter circle at right:12/16 — see mapControlStyles.ts)
  // instead of clipping or overlapping those controls when a label's projected
  // point lands near them.
  const activeNavBottomBarHeight = showNavOverlay
    ? navOverlay.bottomBarHeight
    : navOverlayV1.active
      ? navOverlayV1.bottomBarHeight
      : 0;
  const mapLabelEdgeInsets = useMemo(
    () => computeMapContentInsets({
      mode,
      top: topOverlayHeight > 0 ? topOverlayHeight + 8 : 0,
      right: 80,
      bottomSafeArea: insets.bottom,
      windowHeight,
      snapPoints,
      sheetIndex,
      navBarHeight: activeNavBottomBarHeight,
    }),
    [activeNavBottomBarHeight, insets.bottom, mode, sheetIndex, snapPoints, topOverlayHeight, windowHeight],
  );

  useEffect(() => {
    Animated.timing(searchFocusAnim, {
      toValue: mode === 'SEARCH' ? 1 : 0,
      duration: 160,
      useNativeDriver: false,
    }).start();
  }, [mode, searchFocusAnim]);

  useEffect(() => {
    Animated.timing(warningAnim, {
      toValue: showOutsideBanner ? 1 : 0,
      duration: 180,
      useNativeDriver: true,
    }).start();
  }, [showOutsideBanner, warningAnim]);

  // Google-Maps-style: category chip row fades out while the user is actively panning
  // the map (decluttering the view for the map itself) and fades back in once the pan
  // settles, matching handleMapRegionChangeComplete's existing onRegionChangeComplete hook.
  useEffect(() => {
    Animated.timing(chipsAnim, {
      toValue: isMapDragging ? 0 : 1,
      duration: 150,
      useNativeDriver: true,
    }).start();
  }, [isMapDragging, chipsAnim]);

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(userPulseAnim, { toValue: 1, duration: 1100, useNativeDriver: true }),
        Animated.timing(userPulseAnim, { toValue: 0, duration: 0, useNativeDriver: true }),
      ]),
    );
    pulse.start();
    return () => pulse.stop();
  }, [userPulseAnim]);

  // First-time "you are here" education — fires once, the first time the camera
  // actually enters FOLLOWING_USER (cold-launch auto-follow or a recenter tap both
  // qualify as "first successful location follow"). Gated by the persisted flag so
  // it can never show again after this.
  useEffect(() => {
    if (hasSeenLocationTutorial) return;
    if (cameraManager.mode !== 'FOLLOWING_USER' || !currentLocation) return;
    setShowLocationTutorial(true);
    setHasSeenLocationTutorial(true);
  }, [cameraManager.mode, currentLocation, hasSeenLocationTutorial, setHasSeenLocationTutorial]);

  useEffect(() => {
    if (!hasGoogleMapsKey || isOffline) {
      setGoogleBaseMapLoaded(false);
      setMapLoadFailed(false);
      return;
    }
    if (googleBaseMapLoaded) {
      setMapLoadFailed(false);
      return;
    }
    const timeout = setTimeout(() => {
      setMapLoadFailed(true);
    }, 7000);
    return () => clearTimeout(timeout);
  }, [googleBaseMapLoaded, hasGoogleMapsKey, isOffline]);

  const wasOfflineRef = useRef(isOffline);
  useEffect(() => {
    const wasOffline = wasOfflineRef.current;
    wasOfflineRef.current = isOffline;
    if (!wasOffline || isOffline || !hasGoogleMapsKey) return;
    // A connectivity recovery is the one explicit retry boundary. The previous
    // watchdog latch stays stable otherwise, preventing Google/local switching loops.
    setGoogleBaseMapLoaded(false);
    setMapLoadFailed(false);
  }, [hasGoogleMapsKey, isOffline]);

  useEffect(() => {
    if (venueStatus.insideVenue) {
      setOutsideBannerDismissed(false);
    }
  }, [venueStatus.insideVenue]);

  // The route-preview sheet is the single surface for a resolved preview route — no
  // separate floating card. This opens it automatically whenever a route becomes active
  // without the user having explicitly tapped "Directions" (e.g. a promoted/restored
  // route-planner state), the same trigger the old floating card relied on to appear.
  useEffect(() => {
    if (!activePreviewRoute || directionsDestination) return;
    sheetDismissHandledRef.current = false;
    closingSheetIdentityRef.current = null;
    bottomSheetRef.current?.present();
    bottomSheetRef.current?.snapToIndex(1);
  }, [activePreviewRoute, directionsDestination, bottomSheetRef]);

  useEffect(() => {
    if (!showAnyNavOverlay) return;
    if (!programmaticSheetDismissRef.current) prepareProgrammaticSheetDismiss('start-navigation');
    setDirectionsDestination(null);
    bottomSheetRef.current?.close();
  }, [showAnyNavOverlay, bottomSheetRef, prepareProgrammaticSheetDismiss]);

  const recenterResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleRecenterPress = useCallback(async () => {
    if (recenterState === 'loading') return;
    invalidateStartupCameraIntent();
    if (recenterResetTimerRef.current) clearTimeout(recenterResetTimerRef.current);
    logHomeControl('recenter', 'resolve_location_and_center');
    setRecenterState('loading');
    const ok = await handleRecenter();
    setRecenterState(ok ? 'success' : 'failure');
    recenterResetTimerRef.current = setTimeout(() => setRecenterState('idle'), 1200);
  }, [handleRecenter, invalidateStartupCameraIntent, logHomeControl, recenterState]);
  useEffect(() => () => {
    if (recenterResetTimerRef.current) clearTimeout(recenterResetTimerRef.current);
  }, []);

  // Google-Maps-style sustained follow: once the transient tap feedback (loading/
  // success/failure) settles back to idle, the button reflects whether CameraManager
  // is still actively following the user (stays "active" until HomeScreen's onPanDrag
  // calls cameraManager.stopFollowing()) rather than always reverting to a plain idle icon.
  const isFollowingUser = cameraManager.mode === 'FOLLOWING_USER';
  const recenterButtonState: MapControlsRecenter['state'] =
    recenterState !== 'idle' ? recenterState : isFollowingUser ? 'active' : 'idle';

  const handleToggleFav = () => {
    if (!selectedPlace) return;
    FavoriteService.toggleFavorite(selectedPlace);
  };

  const handleOpenDirections = (place: Place) => {
    invalidateStartupCameraIntent();
    const destination =
      place.sourceVersion === 'v2'
        ? place
        : place.category === 'Block' && entryPoints[selectedEntryIdx]
        ? RoutePointService.enrichPlaceWithRoutingNode(place, entryPoints[selectedEntryIdx].nodeId)
        : place;
    setDirectionsDestination(destination);
    bottomSheetRef.current?.present();
    bottomSheetRef.current?.snapToIndex(1);
  };

  const handleCloseDirections = useCallback(() => {
    setDirectionsDestination(null);
  }, []);

  // "Change Destination" (LocationSheet's routePreview mode) — swaps the destination
  // in place instead of exiting route preview like the old onClose-only wiring did.
  // Reuses the exact same directionsDestination state handleOpenDirections already
  // writes to, so useDirectionsViewModel(destination) picks it up and recalculates the
  // route itself (see DirectionsViewModel's `[destination, ...]` effect deps) — no new
  // recalculation path. Camera follow for v2 destinations is likewise already handled
  // by the existing activePreviewRoute -> cameraManager.fitRoute() effect above once the
  // new route lands; nothing here calls the camera directly.
  const handleChangeDestination = useCallback((place: Place) => {
    setDirectionsDestination(place);
  }, []);

  // Full reset to EXPLORE — replaces the two ad hoc `setSelectedPlace(null) +
  // bottomSheetRef.close()` call sites that existed independently before and didn't
  // account for detailsExpanded/arrived/directionsDestination.
  const closeSheet = useCallback(() => {
    prepareProgrammaticSheetDismiss('state-reset');
    resetDismissedSheetState(false);
    bottomSheetRef.current?.close();
  }, [bottomSheetRef, prepareProgrammaticSheetDismiss, resetDismissedSheetState]);

  const handleStartPreviewNavigation = useCallback(() => {
    if (!activePreviewRoute || !previewDestination) return;
    invalidateStartupCameraIntent();
    const startCheck = V2NavigationAdapter.canStartActiveNavigation({
      route: activePreviewRoute as any,
      destination: previewDestination,
    });
    if (!startCheck.canStart) {
      Alert.alert('Cannot start navigation', startCheck.message);
      return;
    }
    const resolvedRoute = V2NavigationAdapter.fromPreview({
      previewRoute: activePreviewRoute as any,
      destination: previewDestination,
      startPlace: routePlannerOrigin,
      currentLocation: routePlannerOrigin ? null : currentLocation,
    });
    prepareProgrammaticSheetDismiss('start-navigation');
    startNavigation(previewDestination, resolvedRoute, resolvedRoute.instructions);
  }, [activePreviewRoute, currentLocation, invalidateStartupCameraIntent, prepareProgrammaticSheetDismiss, previewDestination, routePlannerOrigin, startNavigation]);

  const handleClearPreviewRoute = useCallback(() => {
    Alert.alert('Cancel route?', 'You will need to choose your destination again.', [
      { text: 'Keep route', style: 'cancel' },
      { text: 'Cancel route', style: 'destructive', onPress: () => clearRoutePlanner() },
    ]);
  }, [clearRoutePlanner]);

  // Mode-aware hardware back: steps back through the map surface one mode at a time
  // (Google Maps model — MAP is always the root, back never falls through to the
  // drawer/stack while a sheet mode is open) instead of exiting the screen. NAVIGATION/
  // ARRIVAL are deliberately not handled here — both navigation overlays use the shared
  // navigation-exit owner for hardware Back and visible Exit semantics.
  // Each branch reuses the exact same handler its mode's own visible Close button
  // already calls (see the onClose wiring on RoutePreviewSection/PlaceSection below) —
  // no new close behavior introduced, just extending it to hardware back.
  useEffect(() => {
    const handler = BackHandler.addEventListener('hardwareBackPress', () => {
      if (mode === 'SEARCH') {
        closeSearch();
        return true;
      }
      if (mode === 'DETAILS') {
        closeDetails();
        return true;
      }
      if (mode === 'ROUTE_PREVIEW') {
        if (directionsDestination) handleCloseDirections();
        else handleClearPreviewRoute();
        return true;
      }
      if (mode === 'PLACE_SELECTED') {
        closeSheet();
        return true;
      }
      return false;
    });
    return () => handler.remove();
  }, [mode, closeSearch, closeDetails, directionsDestination, handleCloseDirections, handleClearPreviewRoute, closeSheet]);

  const handleSearchResultSelect = (place: Place) => {
    invalidateStartupCameraIntent();
    clearSearch();
    dismissSearchOverlay();
    handlePlaceSelectWithCameraIntent(place);
  };

  // Phase 5 — shared row renderer for the full-screen search overlay's Recent /
  // Suggestions / Results sections (only the leading icon differs between them).
  const renderResultRow = (item: Place | SearchResult, variant: 'recent' | 'suggestion' | 'result') => (
    <Pressable
      key={(item as any).id}
      testID={`search-result-${(item as any).id}`}
      style={styles.searchResultItem}
      onPress={() => handleSearchResultSelect(item as any)}
      accessibilityRole="button"
      accessibilityLabel={`${getDisplayName(item)}, ${(item as any).category}`}
    >
      <View style={styles.searchResultIcon}>
        {variant === 'recent' ? (
          <Clock size={18} color={staticColors.iconSubtle} />
        ) : (
          <MapPin size={18} color={staticColors.iconSubtle} />
        )}
      </View>
      <View style={styles.searchResultText}>
        <View style={styles.searchResultNameRow}>
          <Text style={styles.searchResultName} numberOfLines={1} ellipsizeMode="tail">
            {getDisplayName(item)}
          </Text>
          {getSecondaryDisplayName(item) && (
            <Text style={styles.searchResultNameUrdu} numberOfLines={1} ellipsizeMode="tail">
              {getSecondaryDisplayName(item)}
            </Text>
          )}
        </View>
        <Text style={styles.searchResultCategory} numberOfLines={1} ellipsizeMode="tail">
          {(item as any).category}
        </Text>
      </View>
      <ChevronRight size={18} color={staticColors.iconFaint} />
    </Pressable>
  );

  const openLayerOptions = () => setLayersSheetVisible(true);

  const handleMapTypeChange = (nextMapType: 'standard' | 'satellite') => {
    if (nextMapType === 'satellite' && baseMapMode !== 'GOOGLE_BASEMAP') {
      Alert.alert('Satellite unavailable offline', 'Satellite requires internet or downloaded satellite tiles.');
      return;
    }
    updateSettings({ mapMode: nextMapType });
  };

  const renderChips = () => {
    return (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.chipsContainer}
        contentContainerStyle={styles.chipsContent}
      >
        {categoryChips.map((cat) => (
          <Pressable
            key={cat.id}
            style={[styles.chip, activeCategory === cat.id && styles.activeChip]}
            onPress={() => {
              logHomeControl('category_chip', `filter_${cat.id}`);
              selectCategory(cat.id);
            }}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel={cat.label}
            accessibilityState={{ selected: activeCategory === cat.id }}
          >
            <Text
              style={[styles.chipText, activeCategory === cat.id && styles.activeChipText]}
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              {cat.label}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.container}>
        <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />

        <MapView
            testID="home-map-view"
            ref={mapRef}
            style={styles.map}
            provider={Platform.OS === 'android' && baseMapMode === 'GOOGLE_BASEMAP' ? PROVIDER_GOOGLE : undefined}
            initialRegion={effectiveInitialRegion}
            mapType={baseMapMode === 'GOOGLE_BASEMAP' ? mapType : 'none'}
            showsUserLocation={false}
            showsMyLocationButton={false}
            showsCompass={false}
            scrollEnabled={!layersSheetVisible}
            zoomEnabled={!layersSheetVisible}
            rotateEnabled={!layersSheetVisible && !settings.keepNorthFixed}
            onMapReady={() => {
              mapReadyRef.current = true;
              setMapReadyState(true);
              handleMapRegionChangeComplete(effectiveInitialRegion);
              mapLabelOverlayRef.current?.requestProjection();

              // Startup camera decision — MapStartupController owns the "what should
              // happen" logic. HomeScreen owns the one-shot guard, stale-result checks,
              // canonical live-location write, and the actual CameraManager calls.
              if (!startupCameraRequestStartedRef.current) {
                const venueBoundary = useV2Map ? v2MapLayers.venueBoundary : VENUE_BOUNDARY;
                beginStartupCameraDecision(venueBoundary);
              }

              if (__DEV__) {
                console.log('[Home][Render]', {
                  mapReady: true,
                  graphOverlayReady: true,
                  selectedMarkerReady: !!selectedPlaceMarkerCoordinate,
                  userMarkerReady: !!currentLocation,
                  searchOverlayCount: overlayPlaces.length,
                  graphOnlyFallbackUsed,
                });
              }
            }}
            onMapLoaded={() => {
              setMapReadyState(true);
              if (baseMapMode === 'GOOGLE_BASEMAP') {
                setGoogleBaseMapLoaded(true);
                setMapLoadFailed(false);
              }
              mapLabelOverlayRef.current?.requestProjection();
            }}
            onRegionChange={() => {
              // Continuous — fires on every camera-move tick including pure-rotation
              // gestures, so label positions stay attached to the map while it's
              // being panned/zoomed/rotated. Internally rAF-coalesced, so calling
              // this on every tick is safe.
              mapLabelOverlayRef.current?.requestProjection();
            }}
            onRegionChangeComplete={(region) => {
              setIsMapDragging(false);
              handleMapRegionChangeComplete(region);
              mapLabelOverlayRef.current?.requestProjection();
            }}
            onPanDrag={() => {
              invalidateStartupCameraIntent();
              handleNavigationPan();
              setIsMapDragging(true);
            }}
            onPress={() => {
              if (mode === 'SEARCH') {
                closeSearch();
                return;
              }
              if (selectedPlace) {
                closeSheet();
              }
            }}
          >
          {baseMapMode === 'LOCAL_TILES' && (
            <LocalTile pathTemplate={getTilePath()} testID="local-base-map-tiles" tileSize={256} zIndex={-1} />
          )}

          {mapType === 'satellite' && baseMapMode === 'GOOGLE_BASEMAP' && <SatelliteDimOverlay bounds={SATELLITE_DIM_BOUNDARY} />}

          <VenueBoundary coordinates={useV2Map ? v2MapLayers.venueBoundary : VENUE_BOUNDARY} />

          {/* ARRIVAL must stay on the nav map layers/chrome — arrived is the highest-priority
              mode input (outranks NAVIGATION itself), so gating on 'NAVIGATION' alone would
              unmount the route/user marker and the arrival sheet the instant GPS detects
              arrival. */}
          {(mode === 'NAVIGATION' || mode === 'ARRIVAL') && <NavigationMapLayersV2 overlay={navOverlay} />}
          {(mode === 'NAVIGATION' || mode === 'ARRIVAL') && <NavigationMapLayersV1 overlay={navOverlayV1} />}

          {mode !== 'NAVIGATION' && mode !== 'ARRIVAL' && (useV2Map ? (
            <React.Fragment key={`v2_layers_${v2MapLayers.activeMapFilter}`}>
              <RastaLayer
                rastas={previewVisibleRastas}
                variant="home"
                focused={v2MapLayers.activeMapFilter === 'rastas'}
                keyPrefix="v2_rasta"
                onPressRasta={(rastaId, coordinate) => {
                  const place = V2PlaceAdapter.getPlaceById(rastaId);
                  if (!place) return;
                  collectTapCandidate({ id: rastaId, kind: 'rasta', coordinate, payload: place });
                }}
              />

              <SpecialRouteLayer
                routes={previewVisibleSpecialRoutes}
                variant="home"
                focused={v2MapLayers.activeMapFilter === 'special_routes'}
                keyPrefix="v2_special"
                onPressRoute={(routeId, coordinate) => {
                  const place = V2PlaceAdapter.getPlaceById(routeId);
                  if (!place) return;
                  collectTapCandidate({ id: routeId, kind: 'route', coordinate, payload: place });
                }}
              />

              <BlockLayer
                blocks={showBlockPolygons ? previewVisibleBlocks : []}
                variant="home"
                focused={v2MapLayers.activeMapFilter === 'blocks'}
                keyPrefix="v2_block"
                onPressBlock={(blockId, coordinate) => {
                  const place = V2PlaceAdapter.getPlaceById(blockId);
                  if (!place) return;
                  collectTapCandidate({ id: blockId, kind: 'block', coordinate, payload: place });
                }}
              />

              <GateLayer
                gates={previewVisibleGateMarkers}
                focused={v2MapLayers.activeMapFilter === 'gates'}
                keyPrefix="v2_gate"
                onPressGate={(gateId, coordinate) => {
                  const place = V2PlaceAdapter.getPlaceById(gateId);
                  if (!place) return;
                  collectTapCandidate({ id: gateId, kind: 'gate', coordinate, payload: place });
                }}
              />

              {activePreviewRoute && activePreviewRoute.coordinates.length > 1 && (
                <>
                  {previewOutsideLegCoordinates.length > 1 && (
                    <OutsideRoutePolyline
                      coordinates={previewOutsideLegCoordinates}
                      roadFollowing={activePreviewRoute.outsideRoute?.roadFollowing ?? false}
                      zIndex={14}
                    />
                  )}
                  <Polyline coordinates={previewInsideLegCoordinates} strokeColor={staticColors.routeCasing} strokeWidth={11} zIndex={16} />
                  <Polyline
                    coordinates={previewInsideLegCoordinates}
                    strokeColor={staticColors.routeInside}
                    strokeWidth={7}
                    zIndex={17}
                  />
                </>
              )}

              {__DEV__ && developerModeEnabled && v2MapLayers.developerLabels.map((label) => (
                <Marker key={`v2_dev_${label.id}`} coordinate={label.coordinate} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false}>
                  <View style={styles.debugNode}>
                    <Text style={styles.debugNodeText}>{label.text}</Text>
                  </View>
                </Marker>
              ))}
            </React.Fragment>
          ) : IJTEMA_DATA.edges.map((edge, idx) => {
            const from = IJTEMA_DATA.nodes[edge.from];
            const to = IJTEMA_DATA.nodes[edge.to];
            if (!from || !to) return null;
            const coordinates = [
              { latitude: from.lat, longitude: from.lng },
              { latitude: to.lat, longitude: to.lng },
            ];
            const isBoundary = edge.type === 'boundary';
            return (
              <React.Fragment key={`edge_${edge.from}_${edge.to}_${idx}`}>
                <Polyline
                  coordinates={coordinates}
                  strokeColor={isBoundary ? 'rgba(60,64,67,0.45)' : 'rgba(60,64,67,0.55)'}
                  strokeWidth={isBoundary ? 7 : 9}
                  zIndex={1}
                />
                <Polyline
                  coordinates={coordinates}
                  strokeColor={isBoundary ? 'rgba(255,255,255,0.72)' : 'rgba(255,255,255,0.92)'}
                  strokeWidth={isBoundary ? 4 : 6}
                  zIndex={2}
                />
              </React.Fragment>
            );
          }))}

          {mode !== 'NAVIGATION' && !useV2Map && showBlockPolygons && Object.entries(IJTEMA_DATA.blocks).map(([id, block]) => {
            const isSelected = selectedPlace?.id === id;
            return block.corners ? (
              <Polygon
                key={id}
                coordinates={block.corners}
                fillColor={isSelected ? 'rgba(26, 115, 232, 0.35)' : 'rgba(46, 125, 50, 0.15)'}
                strokeColor={isSelected ? staticColors.selectedBlock : staticColors.normalBlock}
                strokeWidth={isSelected ? 3 : 1.5}
                tappable
                onPress={() => {
                  dismissSearchOverlay();
                  handlePlaceSelectWithCameraIntent({
                    id: block.id,
                    name: block.name,
                    urduName: block.urduName,
                    category: 'Block',
                    coordinate: block.center,
                    description: `${block.name} of the Karachi Ijtema ground.`,
                    sourceVersion: 'v1',
                  });
                }}
              />
            ) : null;
          })}

          {mode !== 'NAVIGATION' && !useV2Map && showGraphNodes && __DEV__ && developerModeEnabled && Object.entries(IJTEMA_DATA.nodes).map(([nodeId, node]) => {
            const color = nodeId.startsWith('P') ? '#D32F2F' : nodeId.startsWith('S') ? '#00ACC1' : '#616161';
            return (
              <Marker
                key={`node_${nodeId}`}
                coordinate={{ latitude: node.lat, longitude: node.lng }}
                anchor={{ x: 0.5, y: 0.5 }}
                tracksViewChanges={false}
              >
                <View style={[styles.debugNode, { backgroundColor: color }]}>
                  <Text style={styles.debugNodeText}>{nodeId}</Text>
                </View>
              </Marker>
            );
          })}

          {mode !== 'NAVIGATION' && !useV2Map && showRastaNames && __DEV__ && developerModeEnabled && Array.from(new Map(
            IJTEMA_DATA.edges
              .filter((edge) => !!edge.name)
              .map((edge) => [edge.name!, edge]),
          ).values()).map((edge) => {
            const from = IJTEMA_DATA.nodes[edge.from];
            const to = IJTEMA_DATA.nodes[edge.to];
            if (!from || !to || !edge.name) return null;
            const mid = { latitude: (from.lat + to.lat) / 2, longitude: (from.lng + to.lng) / 2 };
            return (
              <Marker key={`rasta_${edge.name}`} coordinate={mid} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false}>
                <View style={styles.rastaLabel}>
                  <Text style={styles.rastaLabelText}>{edge.name}</Text>
                </View>
              </Marker>
            );
          })}

          {mode !== 'NAVIGATION' && mode !== 'ARRIVAL' && (
            <FacilityLayer
              places={LANDMARK_PLACES}
              selectedPlaceId={selectedPlace?.id}
              onPressFacility={(place, coordinate) => {
                collectTapCandidate({ id: place.id, kind: 'facility', coordinate, payload: place });
              }}
            />
          )}

          {mode !== 'NAVIGATION' && mode !== 'ARRIVAL' && overlayPlaces.map((item) => {
            const overlayItem = item as Place | SearchResult;
            const coordinate = overlayItem.coordinate;
            const label = getDisplayName(overlayItem);
            return (
              <Marker
                key={`search_overlay_${overlayItem.id}`}
                testID={`search-map-marker-${overlayItem.id}`}
                coordinate={coordinate}
                anchor={{ x: 0.5, y: 1 }}
                tracksViewChanges={false}
                onPress={() => {
                  if (isPlace(overlayItem)) handleSearchResultSelect(overlayItem);
                }}
              >
                <View style={styles.searchOverlayMarker}>
                  <MapPin size={markerSizes.facility} color={staticColors.white} fill={markerColors.route} />
                  <Text style={styles.searchOverlayText} numberOfLines={1}>{label}</Text>
                </View>
              </Marker>
            );
          })}

          {/* Selected place pin — hidden during route preview to avoid duplicate destination marker */}
          {markerOwnership.showBrowseSelection && selectedPlace && selectedPlaceMarkerCoordinate && !activePreviewRoute && (
            <Marker coordinate={selectedPlaceMarkerCoordinate} tracksViewChanges={false}>
              <View testID="selected-place-marker" style={styles.selectedMarker}>
                <MapPin size={markerSizes.destination} color={staticColors.gateAccent} fill={staticColors.gateAccent} />
              </View>
            </Marker>
          )}

          {/* Route preview destination pin — shown when route is active. */}
          {previewDestinationCoordinate && activePreviewRoute && (
            <Marker coordinate={previewDestinationCoordinate} tracksViewChanges={false}>
              <View style={styles.selectedMarker}>
                <MapPin size={markerSizes.destination} color={staticColors.gateAccent} fill={staticColors.gateAccent} />
              </View>
            </Marker>
          )}

          {markerOwnership.showBrowseUser && currentLocation && (
            <UserLocationMarker
              coordinate={currentLocation}
              accuracy={currentLocation.accuracy}
              heading={currentLocation.heading}
              isFollowing={cameraManager.mode === 'FOLLOWING_USER'}
              pulseAnim={userPulseAnim}
              isRemembered={currentLocationSource === 'remembered'}
            />
          )}

          {showPreviewStartMarker && previewStartCoordinate && (
            <Marker coordinate={previewStartCoordinate} anchor={{ x: 0.5, y: 1 }} tracksViewChanges={false}>
              <View style={styles.previewStartMarker}>
                <Navigation size={13} color={staticColors.white} />
              </View>
            </Marker>
          )}
          </MapView>

        {(mode === 'NAVIGATION' || mode === 'ARRIVAL') && <NavigationChromeV2 overlay={navOverlay} hasBaseMap={hasBaseMap} />}
        {(mode === 'NAVIGATION' || mode === 'ARRIVAL') && <NavigationChromeV1 overlay={navOverlayV1} hasBaseMap={hasBaseMap} />}
        <MapLabelOverlay
          ref={mapLabelOverlayRef}
          mapRef={mapRef}
          items={mapLabelItems}
          disableTouch={isMapDragging}
          edgeInsets={mapLabelEdgeInsets}
        />

        {/* Cold-start: avoid a blank map while MapView mounts/renders its first
            frame. mapLoadFailed's 7s-timeout banner takes over if it never loads. */}
        {baseMapMode === 'GOOGLE_BASEMAP' && !googleBaseMapLoaded && !mapLoadFailed && (
          <View style={styles.mapLoadingOverlay} pointerEvents="none">
            <ActivityIndicator size="small" color={staticColors.recenterBlue} />
            <Text style={styles.mapLoadingText}>Loading map...</Text>
          </View>
        )}

        {mode !== 'NAVIGATION' && !directionsDestination && (
        <SafeAreaView
          style={[styles.topOverlay, mode === 'SEARCH' && styles.topOverlaySearch]}
          pointerEvents="box-none"
          onLayout={(e) => setTopOverlayHeight(e.nativeEvent.layout.height)}
        >
          <Animated.View
            style={[
              styles.searchBarContainer,
              {
                backgroundColor: theme.searchBar,
                borderColor: searchFocusAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: ['rgba(218,220,224,0)', staticColors.info],
                }),
                transform: [{ scale: searchFocusAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.01] }) }],
              },
            ]}
          >
            <Pressable
              onPress={() => {
                if (mode === 'SEARCH') {
                  logHomeControl('search_back', 'dismiss_search');
                  closeSearch();
                  return;
                }
                dismissSearchOverlay();
                logHomeControl('menu', 'open_drawer');
                nav.dispatch(DrawerActions.openDrawer());
              }}
              style={styles.iconButton}
              accessibilityRole="button"
              accessibilityLabel={mode === 'SEARCH' ? 'Back' : 'Open menu'}
            >
              {mode === 'SEARCH' ? <ArrowLeft size={24} color={theme.subtext} /> : <Menu size={24} color={theme.subtext} />}
            </Pressable>
            <TextInput
              ref={searchInputRef}
              style={[styles.searchInput, { color: theme.text }]}
              placeholder={searchPlaceholder}
              placeholderTextColor={theme.placeholder}
              value={searchQuery}
              onChangeText={handleSearch}
              onFocus={openSearch}
              returnKeyType="search"
              onSubmitEditing={Keyboard.dismiss}
              multiline={false}
              numberOfLines={1}
              accessibilityLabel="Search destination: gate, rasta, block"
            />
            {searchQuery.length > 0 ? (
              <Pressable
                onPress={() => {
                  logHomeControl('search_clear', 'clear_query');
                  clearSearch();
                }}
                style={styles.iconButton}
                accessibilityRole="button"
                accessibilityLabel="Clear search"
              >
                <X size={20} color={staticColors.iconMuted} />
              </Pressable>
            ) : (
              <View style={styles.iconButtonSpacer} />
            )}
          </Animated.View>

          {/* Phase 5 — full-screen search overlay. Map stays mounted underneath
              (never unmounted/removed); this content view just covers it with
              a solid background until dismissed via back button or a result
              selection, matching the Google Maps search flow. */}
          {mode === 'SEARCH' && (
            <Animated.View
              style={[
                styles.searchOverlayContent,
                { backgroundColor: theme.card, opacity: searchFocusAnim },
                { transform: [{ translateY: searchFocusAnim.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }] },
              ]}
            >
              <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.searchOverlayScrollContent}>
                {searchQuery.length > 0 ? (
                  searchResults.length > 0 ? (
                    searchResults.map((item) => renderResultRow(item, 'result'))
                  ) : (
                    <Text style={[styles.searchEmptyText, { color: theme.subtext }]}>{`No results for "${searchQuery}"`}</Text>
                  )
                ) : (
                  <>
                    {recentSearches.length > 0 && (
                      <>
                        <Text style={[styles.sectionTitle, { color: theme.subtext }]}>Recent</Text>
                        {recentSearches.map((item) => renderResultRow(item, 'recent'))}
                      </>
                    )}

                    {suggestedPlaces.length > 0 && (
                      <>
                        <Text style={[styles.sectionTitle, { color: theme.subtext }]}>Suggestions</Text>
                        {suggestedPlaces
                          .filter((place) => !recentSearches.some((recent) => (recent as any).id === place.id))
                          .map((item) => renderResultRow(item, 'suggestion'))}
                      </>
                    )}

                    <Text style={[styles.sectionTitle, { color: theme.subtext }]}>Categories</Text>
                    <View style={styles.categoryGrid}>
                      {categoryChips.filter((cat) => cat.id !== 'all').map((cat) => (
                        <Pressable
                          key={cat.id}
                          style={[
                            styles.categoryTile,
                            { backgroundColor: theme.chip, borderColor: theme.border },
                            activeCategory === cat.id && { backgroundColor: theme.chipActive, borderColor: theme.chipActive },
                          ]}
                          onPress={() => {
                            logHomeControl('category_tile', `filter_${cat.id}`);
                            handleCategoryPress(cat.id);
                          }}
                          accessibilityRole="button"
                          accessibilityLabel={cat.label}
                          accessibilityState={{ selected: activeCategory === cat.id }}
                        >
                          <Text
                            style={[
                              styles.categoryTileText,
                              { color: theme.chipText },
                              activeCategory === cat.id && { color: theme.chipActiveText, fontWeight: '700' },
                            ]}
                            numberOfLines={1}
                            ellipsizeMode="tail"
                          >
                            {cat.label}
                          </Text>
                        </Pressable>
                      ))}
                    </View>

                    {activeCategory && (
                      <>
                        <Text style={[styles.sectionTitle, { color: theme.subtext }]}>
                          {categoryChips.find((cat) => cat.id === activeCategory)?.label ?? 'Results'}
                        </Text>
                        {searchResults.length > 0 ? (
                          searchResults.map((item) => renderResultRow(item, 'result'))
                        ) : (
                          <Text style={[styles.searchEmptyText, { color: theme.subtext }]}>No places in this category.</Text>
                        )}
                      </>
                    )}
                  </>
                )}
              </ScrollView>
            </Animated.View>
          )}

          {mode !== 'SEARCH' && (
            <Animated.View style={{ opacity: chipsAnim }} pointerEvents={isMapDragging ? 'none' : 'box-none'}>
              {renderChips()}
            </Animated.View>
          )}
        </SafeAreaView>
        )}

        {mode !== 'NAVIGATION' && (isOffline || showMapWarningBanner || showOutsideBanner) && (
          <View style={[styles.bannerStack, { top: bannerStackTop }]}>
            {isOffline && (
              <View style={[styles.offlineIndicator, styles.bannerStackItem]}>
                <WifiOff size={14} color="#FFFFFF" />
                <Text style={styles.offlineText}>Offline</Text>
              </View>
            )}

            {showMapWarningBanner && (
              <View style={[styles.mapWarningBanner, styles.bannerStackItem]}>
                <Text style={styles.mapWarningText}>
                  {hasGoogleMapsKey && mapLoadFailed
                    ? MapConfigService.getMapLoadFailedMessage()
                    : isOffline
                      ? 'Downloaded background map unavailable. Ijtema routes still work.'
                      : MapConfigService.getMissingGoogleMapsMessage()}
                </Text>
              </View>
            )}

            {showOutsideBanner && (
              <Animated.View
                style={[
                  styles.outsideVenueBanner,
                  styles.bannerStackItem,
                  {
                    opacity: warningAnim,
                    transform: [{ translateY: warningAnim.interpolate({ inputRange: [0, 1], outputRange: [-8, 0] }) }],
                  },
                ]}
              >
                <View
                  accessible
                  accessibilityLabel={outsideBannerAccessibilityLabel}
                  style={styles.outsideVenueTextWrap}
                >
                  <Text style={styles.outsideVenueTitle}>Outside Ijtema</Text>
                  <Text style={styles.outsideVenueSuggestion}>Suggested entry</Text>
                  <Text style={styles.outsideVenueGateText}>
                    {nearestEntryGate?.name.en ?? 'Entry recommendation unavailable'}
                  </Text>
                </View>
                <Pressable
                  style={styles.bannerCloseButton}
                  accessibilityRole="button"
                  accessibilityLabel="Dismiss outside Ijtema entry suggestion"
                  onPress={() => {
                    logHomeControl('outside_banner_close', 'dismissed');
                    setOutsideBannerDismissed(true);
                  }}
                >
                  <X size={16} color="#FFFFFF" />
                </Pressable>
              </Animated.View>
            )}
          </View>
        )}

        {mode !== 'NAVIGATION' && __DEV__ && developerModeEnabled && showRouteDiagnostics && (
          <View style={styles.diagnosticsBanner}>
            <Text style={styles.diagnosticsText}>
              {GRAPH_VALIDATION.isValid ? 'Graph validation: PASS' : 'Graph validation: FAIL'}
            </Text>
            {!GRAPH_VALIDATION.isValid && (
              <Text style={styles.diagnosticsText} numberOfLines={2}>
                {GRAPH_VALIDATION.errors[0]}
              </Text>
            )}
            <Text style={styles.diagnosticsText} numberOfLines={1}>
              {RoutingService.runRouteDiagnostics().map((r) => `${r.from}->${r.to}:${r.success ? 'OK' : 'FAIL'}`).join(' | ')}
            </Text>
          </View>
        )}

        {mode !== 'NAVIGATION' && isOffline && !offlineData.isDownloaded && (
          <View style={styles.emptyOfflineState}>
            <Text style={styles.emptyOfflineTitle}>Background map not downloaded. Ijtema routes still work.</Text>
            <Pressable style={styles.emptyOfflineButton} onPress={() => nav.navigate('DownloadMap')}>
              <Text style={styles.emptyOfflineButtonText}>Download background map</Text>
            </Pressable>
          </View>
        )}

        {mode !== 'NAVIGATION' && mode !== 'SEARCH' && (
          <>
            <View style={[styles.controlStack, { bottom: controlStackBottom }]}>
              <MapControls
                variant="browse"
                compassMode={compassMode}
                onLayers={() => {
                  logHomeControl('layer', 'open_options');
                  openLayerOptions();
                }}
                onCompassToggle={() => {
                  logHomeControl('compass', compassMode === 'FOLLOW_HEADING' ? 'reset_north_up' : 'heading_follow_enabled');
                  handleCompassToggle();
                }}
                onZoomIn={() => {
                  logHomeControl('zoom_in', 'map_zoom_in');
                  handleZoomIn();
                }}
                onZoomOut={() => {
                  logHomeControl('zoom_out', 'map_zoom_out');
                  handleZoomOut();
                }}
                recenter={{ state: recenterButtonState, onPress: () => void handleRecenterPress() }}
              />
            </View>

            {showLocationTutorial && (
              <LocationTutorialTooltip
                bottomOffset={controlStackBottom + 340}
                onDismiss={() => setShowLocationTutorial(false)}
              />
            )}

            {__DEV__ && developerModeEnabled && (
              <View style={styles.debugCard}>
                <Pressable style={styles.debugBtn} onPress={() => setShowGraphNodes(!showGraphNodes)}>
                  <Text style={styles.debugBtnText}>Nodes {showGraphNodes ? 'ON' : 'OFF'}</Text>
                </Pressable>
                <Pressable style={styles.debugBtn} onPress={() => setShowRastaNames(!showRastaNames)}>
                  <Text style={styles.debugBtnText}>Rasta Names {showRastaNames ? 'ON' : 'OFF'}</Text>
                </Pressable>
                <Pressable style={styles.debugBtn} onPress={() => setShowRouteDiagnostics(!showRouteDiagnostics)}>
                  <Text style={styles.debugBtnText}>Diagnostics {showRouteDiagnostics ? 'ON' : 'OFF'}</Text>
                </Pressable>
              </View>
            )}
          </>
        )}

        {mode === 'NAVIGATION' && (
          <View
            style={[
              styles.navControls,
              // Stacks above the recenter button (NavigationChromeV1/V2), which itself
              // stacks above the trip-info bar — same shared calculation both chrome
              // components use for their own recenter button, so the two can't drift apart.
              { bottom: computeNavControlsInset(resolveNavBarHeight(navOverlay.bottomBarHeight, insets.bottom)) },
            ]}
          >
            <MapControls
              variant="nav"
              compassMode={compassMode}
              onCompassToggle={() => {
                logHomeControl('nav_compass', compassMode === 'FOLLOW_HEADING' ? 'reset_north_up' : 'heading_follow_enabled');
                handleCompassToggle();
              }}
              onZoomIn={() => {
                logHomeControl('nav_zoom_in', 'map_zoom_in');
                handleZoomIn();
              }}
              onZoomOut={() => {
                logHomeControl('nav_zoom_out', 'map_zoom_out');
                handleZoomOut();
              }}
            />
          </View>
        )}

        <BottomSheetModal
          ref={bottomSheetRef}
          // BottomSheetModal only renders once present() is called (mount stays false, and
          // unmounts again on close since enablePanDownToClose implies enableDismissOnClose) —
          // `index` here is the position it animates to on that mount, not a live/controlled
          // value, so it must match the snap index every present() caller opens to (1).
          index={1}
          snapPoints={snapPoints}
          enablePanDownToClose
          keyboardBehavior="interactive"
          keyboardBlurBehavior="restore"
          android_keyboardInputMode="adjustResize"
          handleIndicatorStyle={[styles.sheetIndicator, { backgroundColor: theme.border }]}
          backgroundStyle={{
            backgroundColor: theme.card,
            borderTopLeftRadius: SHEET_CORNER_RADIUS,
            borderTopRightRadius: SHEET_CORNER_RADIUS,
            // Separates the sheet from the map behind it — shadows.high's upward
            // offset (Phase 8A shadow scale) matches a bottom sheet's shadow direction.
            ...shadows.high,
          }}
          onChange={(index) => {
            setSheetIndex(index);
            handleSheetIndexChange(index);
            if (index < 0) {
              closingSheetIdentityRef.current ??= currentSheetIdentityRef.current;
            } else {
              sheetDismissHandledRef.current = false;
              closingSheetIdentityRef.current = null;
            }
            // Fully expanding the sheet over a selected place is "show me more" —
            // PLACE_SELECTED (preview) -> DETAILS. Only meaningful outside the directions
            // flow, which has its own distinct content.
            if (index >= 2 && selectedPlace && !directionsDestination) {
              showDetails();
            } else if (index < 2) {
              setDetailsExpanded(false);
            }
          }}
          onDismiss={handleSheetDismiss}
        >
          {routePreviewSheetDestination ? (
            <LocationSheet
              mode="routePreview"
              destination={routePreviewSheetDestination}
              onClose={directionsDestination ? handleCloseDirections : handleClearPreviewRoute}
              onStartNavigation={handleStartPreviewNavigation}
              onCancelRoute={activePreviewRoute ? handleClearPreviewRoute : undefined}
              onChangeDestination={handleChangeDestination}
            />
          ) : selectedPlace ? (
            <LocationSheet
              mode={mode === 'DETAILS' ? 'details' : 'preview'}
              place={selectedPlace}
              theme={theme}
              entryPoints={entryPoints}
              blockGates={blockGates}
              selectedEntryIdx={selectedEntryIdx}
              onSelectEntryIdx={setSelectedEntryIdx}
              walkingTimeMin={walkingTimeMin}
              isFav={isFav}
              onToggleFavorite={handleToggleFav}
              onSelectGate={(gate) => {
                handlePlaceSelectWithCameraIntent({
                  id: gate.id,
                  name: gate.name,
                  urduName: gate.urduName,
                  category: 'Gate',
                  description: `${gate.name} entrance for Block 2 / Member Masjid.`,
                  coordinate: gate.coordinate,
                  routingNodeId: IJTEMA_DATA.nodes[gate.id]?.nearestRoadNode,
                  sourceVersion: 'v1',
                });
              }}
              onOpenDirections={() => handleOpenDirections(selectedPlace)}
              onClose={closeSheet}
              onShowDetails={showDetails}
              onCloseDetails={closeDetails}
              developerModeEnabled={developerModeEnabled}
            />
          ) : (
            <BottomSheetScrollView contentContainerStyle={styles.sheetContent}>
              <View style={styles.emptySheet}>
                <Text style={styles.emptySheetText}>Tap a block or search to see details</Text>
              </View>
            </BottomSheetScrollView>
          )}
        </BottomSheetModal>

        {/* LayersSheet is intentionally not part of MapMode — it's a modal that overlays
            whichever mode is underneath, gated by its own layersSheetVisible flag. Map
            gesture props above are the actual interaction lock; the sheet is a Modal so
            touches can't reach the map underneath either way (see zLayers.ts). */}
        <LayersSheet
          visible={layersSheetVisible}
          onClose={() => setLayersSheetVisible(false)}
          mapType={mapType}
          onMapTypeChange={handleMapTypeChange}
          showBlockPolygons={showBlockPolygons}
          onToggleBlocks={setShowBlockPolygons}
          showGatesLayer={showGatesLayer}
          onToggleGates={setShowGatesLayer}
          showRastasLayer={showRastasLayer}
          onToggleRastas={setShowRastasLayer}
          showSpecialRoutesLayer={showSpecialRoutesLayer}
          onToggleSpecialRoutes={setShowSpecialRoutesLayer}
        />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  map: { ...StyleSheet.absoluteFillObject },
  mapLoadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#F8F9FA',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  mapLoadingText: {
    color: '#5F6368',
    fontSize: 13,
    fontWeight: '600',
  },
  searchOverlayMarker: {
    maxWidth: 120,
    alignItems: 'center',
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: '#1A73E8',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.9)',
    flexDirection: 'row',
    gap: 4,
  },
  searchOverlayText: {
    maxWidth: 82,
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
  },
  topOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0,
    zIndex: Z.mapControls,
  },
  // Phase 5 — stretches the overlay to fill the screen so its full-screen
  // search content (searchOverlayContent, flex: 1) has a bounded height to
  // fill; topOverlay itself has no `bottom` outside SEARCH mode since it's
  // normally sized to its (small) search-bar-only content.
  topOverlaySearch: {
    bottom: 0,
  },
  searchBarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: staticColors.white,
    marginHorizontal: 12,
    marginTop: 8,
    // True pill (height / 2), was 24 against a 52 height — Google Maps search bar
    // is a full capsule, not a slightly-rounded rect.
    borderRadius: 26,
    paddingHorizontal: 8,
    height: 52,
    borderWidth: 1,
    ...shadows.medium,
  },
  iconButton: { padding: 14 },
  iconButtonSpacer: { width: 48, height: 48 },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: staticColors.textPrimary,
    paddingHorizontal: 4,
    height: 52,
    // Prevent multiline overflow that causes "..." artifacts below placeholder
    textAlignVertical: 'center',
  },
  // Phase 5 — full-screen search overlay content (fills topOverlaySearch below
  // the search bar, replacing the old small anchored dropdown).
  searchOverlayContent: {
    flex: 1,
    marginTop: 4,
  },
  searchOverlayScrollContent: {
    paddingBottom: 24,
  },
  searchEmptyText: {
    fontSize: 14,
    paddingHorizontal: 16,
    paddingVertical: 24,
    textAlign: 'center',
  },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 12,
    paddingTop: 8,
    gap: 8,
  },
  categoryTile: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    minWidth: 76,
    alignItems: 'center',
  },
  categoryTileText: {
    fontSize: 13,
    fontWeight: '500',
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#70757A',
    textTransform: 'uppercase',
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  searchResultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F3F4',
  },
  searchResultIcon: { width: 40, alignItems: 'center' },
  searchResultText: { flex: 1, marginLeft: 4, minWidth: 0 },
  searchResultNameRow: { flexDirection: 'row', alignItems: 'baseline' },
  searchResultName: { fontSize: 15, color: '#202124', fontWeight: '500', flexShrink: 1 },
  searchResultNameUrdu: { fontSize: 13, color: '#70757A', marginLeft: 6, flexShrink: 1 },
  searchResultCategory: { fontSize: 13, color: '#70757A', marginTop: 1 },
  chipsContainer: { marginTop: 10 },
  chipsContent: { paddingLeft: 12, paddingRight: 88, paddingBottom: 8 },
  chip: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    marginRight: 8,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#DADCE0',
    minWidth: 64,
    alignItems: 'center',
  },
  activeChip: { backgroundColor: '#1A73E8', borderColor: '#1A73E8' },
  chipText: { fontSize: 13, color: '#3C4043', fontWeight: '500' },
  activeChipText: { color: '#FFFFFF', fontWeight: '700' },
  navControls: { position: 'absolute', right: 16, zIndex: Z.mapControls },
  // Single bottom-anchored Layers/Compass/Zoom/Recenter stack (see MapControls) —
  // replaces the old separately-anchored rightControls (top) + bottomControls
  // (bottom) pair that could collide when a route-preview card shrank the gap
  // between them.
  controlStack: { position: 'absolute', right: 12, zIndex: Z.mapControls },
  bannerStack: { position: 'absolute', left: 0, right: 0, zIndex: Z.mapControls },
  bannerStackItem: { marginBottom: 8 },
  offlineIndicator: {
    alignSelf: 'flex-start',
    marginLeft: 12,
    backgroundColor: 'rgba(32, 33, 36, 0.9)',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
  },
  offlineText: { color: '#FFFFFF', fontSize: 12, fontWeight: '600', marginLeft: 6 },
  mapWarningBanner: {
    marginHorizontal: 12,
    backgroundColor: '#FFF3CD',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  mapWarningText: { color: '#7C4A03', fontSize: 12, fontWeight: '600' },
  outsideVenueBanner: {
    marginLeft: 12,
    marginRight: 76,
    backgroundColor: '#F29900',
    borderRadius: 20,
    paddingLeft: 14,
    paddingRight: 8,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'flex-start',
    minHeight: 40,
    elevation: 3,
  },
  outsideVenueTextWrap: { flex: 1, paddingVertical: 1 },
  outsideVenueTitle: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  outsideVenueSuggestion: { color: '#FFFFFF', fontSize: 12, fontWeight: '600', marginTop: 2 },
  outsideVenueGateText: { color: '#FFFFFF', fontSize: 13, fontWeight: '600', flexShrink: 1 },
  bannerCloseButton: { minWidth: 44, minHeight: 44, marginLeft: 4, alignItems: 'center', justifyContent: 'center' },
  diagnosticsBanner: {
    position: 'absolute',
    top: 260,
    left: 12,
    right: 12,
    backgroundColor: 'rgba(32,33,36,0.9)',
    borderRadius: 8,
    padding: 8,
    zIndex: Z.mapControls,
  },
  diagnosticsText: { color: '#FFFFFF', fontSize: 11, marginBottom: 2 },
  debugNode: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  debugNodeText: { color: '#FFFFFF', fontSize: 9, fontWeight: '700' },
  rastaLabel: {
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  rastaLabelText: { color: '#FFFFFF', fontSize: 10, fontWeight: '600' },
  selectedMarker: { alignItems: 'center', justifyContent: 'center' },
  previewStartMarker: {
    width: markerSizes.userLocation,
    height: markerSizes.userLocation,
    borderRadius: markerSizes.userLocation / 2,
    backgroundColor: markerColors.route,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: staticColors.white,
  },
  debugCard: {
    position: 'absolute',
    bottom: 96,
    left: 12,
    right: 12,
    backgroundColor: 'rgba(32,33,36,0.88)',
    borderRadius: 10,
    padding: 6,
    flexDirection: 'row',
    gap: 6,
    zIndex: Z.mapControls,
  },
  debugBtn: { backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  debugBtnText: { color: '#FFFFFF', fontSize: 11, fontWeight: '600' },
  // Google Maps-style capsule handle — was width-only (36) with no explicit
  // height/radius, relying on the bottom-sheet library's own default bar shape.
  sheetIndicator: { backgroundColor: staticColors.border, width: 36, height: 4, borderRadius: 2 },
  sheetContent: { padding: 20 },
  emptySheet: { alignItems: 'center', padding: 60 },
  emptySheetText: { color: staticColors.iconSubtle, fontSize: 15 },
  emptyOfflineState: {
    position: 'absolute',
    bottom: 100,
    left: 16,
    right: 16,
    backgroundColor: 'rgba(32, 33, 36, 0.9)',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    zIndex: Z.mapControls,
  },
  emptyOfflineTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 12,
  },
  emptyOfflineButton: {
    backgroundColor: '#2E7D32',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  emptyOfflineButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
});

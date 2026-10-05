/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import ReanimatedView, { runOnJS, useAnimatedReaction, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Platform,
  StatusBar,
  KeyboardAvoidingView,
  Alert,
  BackHandler,
  Animated,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import provenance from '../../../assets/offline-map/BASEMAP_PROVENANCE.json';
import { OfflineMapCanvas, type MapFeaturePress } from '../components/mapgl/OfflineMapCanvas';
import { buildHomeVenueOverlay, buildMarkerOverlay, buildRouteOverlay, type OverlaySpec } from '../components/mapgl/overlaySpec';
import { buildNavigationScene, buildNavigationSceneV1 } from '../components/mapgl/navigationScene';
import { useBundledBasemap } from '../components/mapgl/useBundledBasemap';
import { BASEMAP_COLORS } from '../components/mapgl/basemapStyle';
import {
  Menu,
  WifiOff,
  X,
  LayoutGrid,
  Search,
} from 'lucide-react-native';
import {
  BottomSheetModal,
  BottomSheetScrollView,
  type BottomSheetBackgroundProps,
  type BottomSheetFooterProps,
} from '@gorhom/bottom-sheet';
import { useNavigation, useIsFocused, DrawerActions, CompositeNavigationProp } from '@react-navigation/native';
import { DrawerNavigationProp, DrawerStatusContext } from '@react-navigation/drawer';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { getHomeRouteDiagnostics, useHomeViewModel } from '../../viewmodels/HomeViewModel';
import {
  computeMapControlsInset,
  resolveControlStackPlacement,
  computeMapContentInsets,
  computeMaxSheetOcclusionForAttribution,
  computeNavControlsInset,
  insetAwareSnapPoints,
  MIN_TOP_VISIBLE_MAP_FOR_ATTRIBUTION,
  MIN_TOP_VISIBLE_MAP_FOR_ROUTE_PREVIEW,
  resolveNavBarHeight,
  OverlayState,
} from '../../viewmodels/useOverlayInsets';
import { useTheme } from '../../services/useTheme';
import { SHEET_CORNER_RADIUS } from '../components/common/SheetHeader';
import { markerColors, markerSizes, shadows, staticColors } from '../../theme';
import { getDistance } from 'geolib';
import { GRAPH_VALIDATION, IJTEMA_DATA, LANDMARK_PLACES, MAP_BOUNDS } from '../../constants/data';
import { Coordinate, Place } from '../../models/types';
import { PlaceDetailService } from '../../services/PlaceDetailService';
import { FavoriteService } from '../../services/FavoriteService';
import { useAppStore, type DirectoryPurpose } from '../../store/useAppStore';
import { RoutePointService } from '../../services/RoutePointService';
import { DrawerParamList, RootStackParamList } from '../../navigation/RootNavigator';
import { MapFeatureFlagsService } from '../../services/MapFeatureFlagsService';
import { MapStartupController, type EntryCameraPlan } from '../../services/MapStartupController';
import { LocationAccessService } from '../../services/LocationAccessService';
import { V2MapRenderingService, MEDIUM_ZOOM, HIGH_ZOOM } from '../../services/V2MapRenderingService';
import { recommendPreviewEntryGate, startPreviewNavigationV2 } from '../../viewmodels/NavigationViewModelV2';
import type { RoutePreviewV2 } from '../../viewmodels/NavigationViewModelV2';
import { destinationFromPlace } from '../../services/V2DirectionsService';
import { MapLocalizationService } from '../../services/MapLocalizationService';
import { V2PlaceAdapter } from '../../services/V2PlaceAdapter';
import { IJTEMA_MAP_REGION } from '../../data/ijtema';
import { MapLabelOverlay, MapLabelItem, MapLabelOverlayHandle, hangSelectedLabelsBelowPin } from '../components/map/MapLabelOverlay';
import { MapControls, MapControlsRecenter } from '../components/map/MapControls';
import { LayersSheet } from '../components/map/LayersSheet';
import { useNavigationOverlayV2 } from '../../viewmodels/useNavigationOverlayV2';
import { useNavigationOverlayV1 } from '../../viewmodels/useNavigationOverlayV1';
import { useMapMode } from '../../viewmodels/useMapMode';
import { useReducedMotion } from '../../viewmodels/useReducedMotion';
import { useDestinationPulse } from '../../viewmodels/useDestinationPulse';
import { useRerouteRevealKey } from '../components/mapgl/useRerouteRevealKey';
import { placeFocusRegion } from '../../viewmodels/useCameraManager';
import { NavigationChromeV2 } from '../components/navigation/NavigationChromeV2';
import { NavigationChromeV1 } from '../components/navigation/NavigationChromeV1';
import { LocationSheet } from '../components/map/LocationSheet';
import { DirectionsSheetFooter } from '../components/map/DirectionsSheetFooter';
import { resolveMapMarkerOwnership } from '../components/map/MapMarkerOwnership';
import { LocationTutorialTooltip } from '../components/map/LocationTutorialTooltip';
import { OsmAttribution } from '../components/map/OsmAttribution';
import { resolveTapCandidate, TapCandidate } from '../../services/TapDisambiguationService';
import { Z } from '../styles/zLayers';

declare const __DEV__: boolean;

type HomeScreenNavigationProp = CompositeNavigationProp<
  DrawerNavigationProp<DrawerParamList, 'Home'>,
  NativeStackNavigationProp<RootStackParamList>
>;

// Static — derived only from the fixed MAP_BOUNDS constant, so it never needs to be
// recomputed per render.
const VENUE_BOUNDARY = [
  { latitude: MAP_BOUNDS.minLat, longitude: MAP_BOUNDS.minLng },
  { latitude: MAP_BOUNDS.minLat, longitude: MAP_BOUNDS.maxLng },
  { latitude: MAP_BOUNDS.maxLat, longitude: MAP_BOUNDS.maxLng },
  { latitude: MAP_BOUNDS.maxLat, longitude: MAP_BOUNDS.minLng },
];

const ROUTE_FIT_BOTTOM_PADDING = 32;
const routeRevealKey = (coordinates: Coordinate[]) => {
  const first = coordinates[0];
  const last = coordinates[coordinates.length - 1];
  return `${first.latitude},${first.longitude}>${last.latitude},${last.longitude}#${coordinates.length}`;
};
// Get Directions pins its CTA footer (~155 dp) under a ~97 dp header, so the shared
// 50% detent (~252 dp on a 914 dp window) leaves no scroll area and hides both cards.
// 79% (~398 dp) shows the header, the Going to card through its whole destination row, and
// the footer (76% clipped that row by ~11 dp on the 914 dp emulator window), while the map
// keeps ~42% of the window. Same three-detent index contract.
const ROUTE_PREVIEW_SNAP_POINTS = ['15%', '79%', '92%'];
type V2PreviewRoute = RoutePreviewV2;

// gorhom's default sheet background is itself an accessible, "adjustable" View labelled "Bottom Sheet"
// (hard-coded, not overridable by props), so TalkBack lands on an empty full-sheet stop. The background
// is decoration only.
function SheetBackground({ pointerEvents, style }: BottomSheetBackgroundProps) {
  return <View pointerEvents={pointerEvents} style={style} accessible={false} importantForAccessibility="no" />;
}

function isV2PreviewRoute(route: unknown): route is V2PreviewRoute {
  return Boolean(
    route &&
    typeof route === 'object' &&
    'startResolution' in route &&
    'destinationLabel' in route &&
    !('routeId' in route),
  );
}

function outsideRouteProvider(route: unknown): string | null {
  if (!route || typeof route !== 'object' || !('outsideRoute' in route)) return null;
  const outsideRoute = (route as { outsideRoute?: { provider?: unknown } }).outsideRoute;
  return typeof outsideRoute?.provider === 'string' ? outsideRoute.provider : null;
}

// Layers 48 + compass 48 + north-up badge + zoom pair 97 + recenter 56 + gaps; used only until onLayout measures the stack.
const CONTROL_STACK_FALLBACK_HEIGHT = 300;
const CONTROL_STACK_RIGHT = 12; // styles.controlStack.right
const BANNER_CONTROL_GAP = 8;
// Time after onMapReady at which the camera manager is told the initial region should be applied, in case the first
// region-complete never arrives (on a loaded emulator it arrived about 6 s after onMapReady; the manager re-runs
// an early move again when it does).

export function HomeScreen() {
  const nav = useNavigation<HomeScreenNavigationProp>();
  // Home stays mounted under every other screen, and its bottom sheet is portal-hosted above
  // the whole navigator (App.tsx), so it would otherwise stay drawn, touchable and answering
  // hardware Back over the Directory, Settings, Help, About, Download Map or an open drawer
  // (#190). One foreground workflow owns touches, accessibility focus and Back at a time.
  const isHomeFocused = useIsFocused();
  // Read the context directly: useDrawerStatus() throws when there is no drawer above Home.
  const isDrawerOpen = React.useContext(DrawerStatusContext) === 'open';
  const sheetSuppressed = !isHomeFocused || isDrawerOpen;
  const currentLocation = useAppStore((s) => s.currentLocation);
  const currentLocationSource = useAppStore((s) => s.currentLocationSource);
  const hasLocationPermission = useAppStore((s) => s.hasLocationPermission);
  const setHasSeenMapOverview = useAppStore((s) => s.setHasSeenMapOverview);
  const setCurrentLocation = useAppStore((s) => s.setCurrentLocation);
  const hasSeenLocationTutorial = useAppStore((s) => s.hasSeenLocationTutorial);
  const setHasSeenLocationTutorial = useAppStore((s) => s.setHasSeenLocationTutorial);
  const activeRoute = useAppStore((s) => s.activeRoute);
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
  const [selectedEntryIdx, setSelectedEntryIdx] = useState(0);
  const [directionsDestination, setDirectionsDestination] = useState<Place | null>(null);
  const mapLabelOverlayRef = useRef<MapLabelOverlayHandle>(null);
  // Startup camera ownership (see onMapReady below) fires once per mount only. Returning
  // launches resolve fresh GPS asynchronously, so the request/intent refs keep late results
  // from stealing camera ownership after a newer user action.
  const startupCameraRequestStartedRef = useRef(false);
  const startupCameraCommittedRef = useRef(false);
  const startupCameraRequestGenerationRef = useRef(0);
  const startupCameraIntentGenerationRef = useRef(0);
  // The native map applies initialRegion shortly after onMapReady, and a camera command issued before
  // that is dropped (seen on the emulator: the Block 2 opening and a Directory-chosen place both stayed on
  // the overview). The camera manager therefore re-runs an early move when the first region-complete
  // arrives and once more after a short bound; the startup move itself waits for that settle.
  const startupRegionSettledRef = useRef(false);
  const startupRegionWaitingMoveRef = useRef<(() => void) | null>(null);
  const startupRegionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startupMapReadyReleasedRef = useRef(false);
  const mapReadyRef = useRef(false);
  const mountedRef = useRef(true);
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const basemap = useBundledBasemap();
  // A style that fails to load (e.g. an unreadable archive) falls back to the plain canvas so the venue overlays still render.
  const [basemapRejected, setBasemapRejected] = useState(false);
  const useV2Map = MapFeatureFlagsService.useIjtemaV2Map();
  const [outsideBannerDismissed, setOutsideBannerDismissed] = useState(false);
  // #222: set only when the Map opened on the Block 2 anchor because no usable location existed.
  const [fallbackNotice, setFallbackNotice] = useState<string | null>(null);
  const [layersSheetVisible, setLayersSheetVisible] = useState(false);
  const [mapReady, setMapReadyState] = useState(false);
  const [topOverlayHeight, setTopOverlayHeight] = useState(0);
  const [isMapDragging, setIsMapDragging] = useState(false);
  const [recenterState, setRecenterState] = useState<'idle' | 'loading' | 'success' | 'failure'>('idle');
  const [showLocationTutorial, setShowLocationTutorial] = useState(false);
  const [detailsExpanded, setDetailsExpanded] = useState(false);
  // -1 = closed. Tracked (not derived from mode) because PLACE_SELECTED/ROUTE_PREVIEW
  // cover two distinct snap heights (15%/50% peek vs preview) that mode alone can't
  // distinguish — see onChange below and useOverlayInsets.computeMapControlsInset.
  const [sheetIndex, setSheetIndex] = useState(-1);
  const { height: windowHeight, fontScale } = useWindowDimensions();
  const warningAnim = useRef(new Animated.Value(0)).current;
  const userPulseAnim = useRef(new Animated.Value(0)).current;
  const chipsAnim = useRef(new Animated.Value(1)).current;

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
    selectedPlace,
    snapPoints: baseSnapPoints,
    initialRegion,
    isOffline,
    mapZoomLevel,
    venueStatus,
    isInsideVenue,
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
    settings,
  } = useHomeViewModel({ isFocused: isHomeFocused });

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

  // Camera priority: a destination picked in the Directory outranks the launch camera (user location / Block 2).
  const pendingDirectorySelection = useAppStore((s) => s.pendingDirectorySelection);
  useEffect(() => {
    if (pendingDirectorySelection) invalidateStartupCameraIntent();
  }, [pendingDirectorySelection, invalidateStartupCameraIntent]);

  const settleStartupRegion = useCallback(() => {
    // A region-complete that arrives before onMapReady is ignored; the bound timer covers that case.
    if (!mapReadyRef.current) return;
    cameraManager.notifyInitialRegionSettled();
    if (startupRegionSettledRef.current) return;
    startupRegionSettledRef.current = true;
    if (startupRegionTimerRef.current) clearTimeout(startupRegionTimerRef.current);
    startupRegionTimerRef.current = null;
    const move = startupRegionWaitingMoveRef.current;
    startupRegionWaitingMoveRef.current = null;
    move?.();
  }, [cameraManager]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (startupRegionTimerRef.current) clearTimeout(startupRegionTimerRef.current);
      mapReadyRef.current = false;
      startupCameraIntentGenerationRef.current += 1;
      startupCameraRequestGenerationRef.current += 1;
    };
  }, []);

  // #140: the venue basemap ships inside the app, so a base map is always present — there is no
  // download step, Google mode, or graph-only fallback any more.
  const graphOnlyFallbackUsed = false;
  const hasBaseMap = true;

  const showDetails = useCallback(() => {
    setDetailsExpanded(true);
    bottomSheetRef.current?.snapToIndex(2);
  }, [bottomSheetRef]);

  const closeDetails = useCallback(() => {
    setDetailsExpanded(false);
    bottomSheetRef.current?.snapToIndex(1);
  }, [bottomSheetRef]);

  // Tap disambiguation: a map press reports one feature per hit layer (queryRenderedFeatures),
  // independently per layer — a tap landing where a
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

  const activePreviewRoute = useMemo(() => {
    if (isNavigating) return null;
    if (!routePlannerDest || !destinationFromPlace(routePlannerDest)) return null;
    return isV2PreviewRoute(activeRoute) ? activeRoute : null;
  }, [activeRoute, isNavigating, routePlannerDest]);

  type SheetDismissalReason = 'state-reset' | 'start-navigation' | 'replacement';
  const computeSheetIdentity = (routeDestination: Place | null, place: Place | null): string | null =>
    routeDestination ? `route:${routeDestination.id}` : place ? `place:${place.id}` : null;
  const sheetRouteDestination = directionsDestination ?? (activePreviewRoute ? routePlannerDest : null);
  const sheetIdentity = computeSheetIdentity(sheetRouteDestination, selectedPlace);
  const currentSheetIdentityRef = useRef<string | null>(sheetIdentity);
  currentSheetIdentityRef.current = sheetIdentity;
  const closingSheetIdentityRef = useRef<string | null>(null);
  const sheetDismissHandledRef = useRef(false);

  // Single ownership record for an in-flight identity-changing/close transition —
  // knows where the sheet is coming FROM, where it's headed TO (null = closing), and
  // why. `pendingNativeSheetEchoRef` is the actual swallow gate: it goes true the
  // instant we imperatively touch the native sheet (present/snapToIndex/close) and
  // only clears on the native confirmation that the round-trip finished — either the
  // sheet visibly re-presenting (onChange to an open index) for a replace, or its own
  // onDismiss firing for a close. Because it is keyed off "is a native round-trip
  // outstanding" rather than "does this echo's identity match", a later transition
  // (e.g. Change Destination) armed before an earlier one's echo arrives keeps
  // inheriting the same protection instead of the guard silently going stale.
  const activeSheetTransitionRef = useRef<{
    fromIdentity: string | null;
    toIdentity: string | null;
    reason: SheetDismissalReason;
  } | null>(null);
  const pendingNativeSheetEchoRef = useRef(false);

  const armSheetTransition = useCallback((toIdentity: string | null, reason: SheetDismissalReason) => {
    cancelPendingSheetPresentation();
    activeSheetTransitionRef.current = { fromIdentity: currentSheetIdentityRef.current, toIdentity, reason };
  }, [cancelPendingSheetPresentation]);

  const presentSheetForIdentity = useCallback((snapIndex: number) => {
    pendingNativeSheetEchoRef.current = true;
    bottomSheetRef.current?.present();
    bottomSheetRef.current?.snapToIndex(snapIndex);
  }, [bottomSheetRef]);

  const closeSheetNative = useCallback(() => {
    pendingNativeSheetEchoRef.current = true;
    bottomSheetRef.current?.close();
  }, [bottomSheetRef]);

  const handlePlaceSelectWithCameraIntent = useCallback((place: Place) => {
    invalidateStartupCameraIntent();
    armSheetTransition(computeSheetIdentity(null, place), 'replacement');
    // handlePlaceSelect always ends in an imperative present()/snapToIndex — either
    // synchronously (no coordinate) or after its camera-pan setTimeout — so the
    // native echo window opens here, before we know which path it will take.
    pendingNativeSheetEchoRef.current = true;
    handlePlaceSelect(place);
  }, [armSheetTransition, handlePlaceSelect, invalidateStartupCameraIntent]);

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
      handlePlaceSelectWithCameraIntent(winner.payload);
    });
  }, [handlePlaceSelectWithCameraIntent, invalidateStartupCameraIntent]);

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
  // Arrival's Done button hands the user back to the Locations Directory (their next
  // destination) instead of a passive, unexplained map — mid-trip Exit is unaffected, it
  // still just stops navigation. stopNavigation()'s own state reset (isNavigating -> false)
  // already clears selection/planner/search via the wasNavigatingRef effect below.
  const navOverlayForChrome = useMemo(() => ({
    ...navOverlay,
    completeArrivalNavigation: () => {
      navOverlay.completeArrivalNavigation();
      nav.navigate('LocationsDirectory');
    },
  }), [navOverlay, nav]);
  const navOverlayV1ForChrome = useMemo(() => ({
    ...navOverlayV1,
    completeArrivalNavigation: () => {
      navOverlayV1.completeArrivalNavigation();
      nav.navigate('LocationsDirectory');
    },
  }), [navOverlayV1, nav]);

  const showOsmAttribution = outsideRouteProvider(activePreviewRoute ?? activeRoute) === 'offline-osm';
  // Single source of truth for "what is the map surface showing right now" — every
  // render/behavior gate below reads `mode`, never the raw arrived/etc inputs directly,
  // so nothing can drift out of sync with the priority chain in deriveMapMode.
  const mode = useMapMode({
    arrived,
    showNavOverlay: showAnyNavOverlay,
    detailsExpanded,
    directionsDestination,
    activePreviewRoute,
    selectedPlace,
  });
  const modeRef = useRef<typeof mode>('EXPLORE');
  modeRef.current = mode;

  // The search bar/chip row (and its onLayout) only mounts when
  // `mode !== 'NAVIGATION' && !directionsDestination` (see its render below) — so
  // topOverlayHeight would otherwise keep its last measurement indefinitely once the
  // row unmounts, misreporting real headroom to every other mode's mapLabelEdgeInsets
  // (ATTR-001 follow-up: this stale top, combined with a near-full-height LocationSheet,
  // could push the Google logo's reserved band behind where the sheet actually,
  // visually, covers the screen).
  useEffect(() => {
    if (mode === 'NAVIGATION' || directionsDestination) setTopOverlayHeight(0);
  }, [mode, directionsDestination]);

  const startupCameraStillOwnsIntent = useCallback((requestGeneration: number, cameraIntentGeneration: number) => (
    mountedRef.current &&
    mapReadyRef.current &&
    startupCameraRequestGenerationRef.current === requestGeneration &&
    startupCameraIntentGenerationRef.current === cameraIntentGeneration &&
    !startupCameraCommittedRef.current &&
    modeRef.current === 'EXPLORE'
  ), []);

  const commitStartupPlan = useCallback((
    plan: EntryCameraPlan,
    venueBoundary: Coordinate[],
    requestGeneration: number,
    cameraIntentGeneration: number,
  ) => {
    if (!startupCameraStillOwnsIntent(requestGeneration, cameraIntentGeneration)) return;
    startupCameraCommittedRef.current = true;
    const moveCamera = () => {
      // A stronger intent (route, place, pan, unmount) that arrived while the move was waiting wins.
      if (
        !mountedRef.current ||
        startupCameraIntentGenerationRef.current !== cameraIntentGeneration ||
        modeRef.current !== 'EXPLORE'
      ) return;
      // Camera context only: the Block 2 anchor is not written as the user's location.
      if (plan.kind === 'FALLBACK_ANCHOR') cameraManager.animateToUser(plan.anchor.coordinate);
      else cameraManager.fitVenueBounds(venueBoundary);
      // The initial region was already applied before this move ran, so the manager must not replay it.
      cameraManager.cancelEarlyReplay();
    };
    if (startupRegionSettledRef.current) moveCamera();
    else startupRegionWaitingMoveRef.current = moveCamera;
    if (plan.kind === 'FALLBACK_ANCHOR') {
      setFallbackNotice(plan.notice);
    } else {
      if (plan.user) setCurrentLocation(plan.user.coordinate, plan.user.source);
    }
    setHasSeenMapOverview(true);
    releaseStartupMapReady();
  }, [cameraManager, releaseStartupMapReady, setCurrentLocation, setHasSeenMapOverview, startupCameraStillOwnsIntent]);

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

    void MapStartupController.resolveReturningLaunchCamera(
      { hasLocationPermission },
      () => LocationAccessService.resolveCurrentLocation(false),
    ).then((decision) => {
      commitStartupPlan(
        MapStartupController.planEntryCamera(decision, isInsideVenue),
        venueBoundary,
        requestGeneration,
        cameraIntentGeneration,
      );
    });
  }, [
    commitStartupPlan,
    hasLocationPermission,
    releaseStartupMapReady,
    isInsideVenue,
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

  const handleSheetDismiss = useCallback(() => {
    cancelPendingSheetPresentation();
    if (sheetDismissHandledRef.current) return;

    const dismissedIdentity = closingSheetIdentityRef.current ?? currentSheetIdentityRef.current;
    const transition = activeSheetTransitionRef.current;
    closingSheetIdentityRef.current = null;
    sheetDismissHandledRef.current = true;
    setSheetIndex(-1);
    handleSheetIndexChange(-1);

    if (pendingNativeSheetEchoRef.current) {
      // This dismiss was produced by our own present()/close() call — a same-sheet
      // identity replacement still in flight, or an explicit close whose caller
      // already applied its own state change — not a genuine user gesture. A
      // close-type transition (toIdentity null) is fully resolved by its own
      // dismiss; a replace-type transition stays armed until the replacement sheet
      // is observed open (see onChange below), so a still-outstanding echo from an
      // earlier, now-superseded transition (e.g. Change Destination firing before
      // Open Directions' echo lands) keeps being swallowed instead of tearing down
      // the newer identity.
      if (transition?.toIdentity === null) pendingNativeSheetEchoRef.current = false;
      return;
    }

    if (!dismissedIdentity) return;
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
      mapFilter: null,
      showGatesLayer,
      showRastasLayer,
      showSpecialRoutesLayer,
      // PLACE_SELECTED: dot-suppress (not hide) other blocks/gates competing with the
      // selected marker for attention — see PLACE_SELECTED_COMPETING_RADIUS_M.
      suppressCompetingMarkers: mode === 'PLACE_SELECTED',
    }),
    [
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
  // Memoized: both feed mapLabelItems' useMemo deps — a fresh .filter() array per render
  // would rebuild every map label on each HomeScreen render while previewing a route.
  const previewVisibleBlocks = useMemo(
    () => (routePreviewDeclutterActive ? v2MapLayers.blocks.filter((block) => block.isSelected) : v2MapLayers.visibleBlocks),
    [routePreviewDeclutterActive, v2MapLayers.blocks, v2MapLayers.visibleBlocks],
  );
  const previewVisibleGateMarkers = useMemo(
    () =>
      routePreviewDeclutterActive
        ? v2MapLayers.gates.filter((gate) => gate.isSelected || gate.id === previewEntryGateId)
        : v2MapLayers.visibleGateMarkers,
    [routePreviewDeclutterActive, v2MapLayers.gates, v2MapLayers.visibleGateMarkers, previewEntryGateId],
  );
  const previewVisibleRastas = routePreviewDeclutterActive ? [] : v2MapLayers.visibleRastas;
  const previewVisibleSpecialRoutes = routePreviewDeclutterActive ? [] : v2MapLayers.specialRoutes;

  // Feeds the single shared MapLabelOverlay (see docs/ARCHITECTURE.md
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
    // During route-preview declutter, GateLayer/BlockLayer render only
    // previewVisibleGateMarkers/previewVisibleBlocks (selected destination + resolved
    // entry gate), not the zoom-LOD visibleGateMarkers/visibleBlockLabels sets below —
    // iterate the exact same filtered arrays here so every label item this produces has
    // a real marker/polygon underneath it, and vice versa (no orphan label floating with
    // nothing to anchor to, no marker silently missing its only accessible/visual label).
    for (const gate of routePreviewDeclutterActive ? previewVisibleGateMarkers : v2MapLayers.visibleGateMarkers) {
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
        // Full name even at low zoom ("12"/"G12"): this label is the gate's only accessible
        // node — GateLayer drops its Marker label whenever a label item exists.
        accessibilityLabel: gate.label,
        onPress: () => {
          const place = V2PlaceAdapter.getPlaceById(gate.id);
          if (!place) return;
          handlePlaceSelectWithCameraIntent(place);
        },
      });
    }

    const blockFocused = v2MapLayers.activeMapFilter === 'blocks';
    for (const block of routePreviewDeclutterActive ? previewVisibleBlocks : v2MapLayers.visibleBlockLabels) {
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
          handlePlaceSelectWithCameraIntent(place);
        },
      });
    }

    // Declutter hides rastas/special-routes entirely (previewVisibleRastas/
    // previewVisibleSpecialRoutes are forced empty below) — their labels must not
    // outlive their lines, so skip both loops rather than leaving text floating with
    // no polyline underneath it.
    if (!routePreviewDeclutterActive) {
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
            handlePlaceSelectWithCameraIntent(place);
          },
        });
      }
    }

    return items;
  }, [
    showNavOverlay,
    navOverlay.mapLayers.gates,
    navOverlayV1.active,
    useV2Map,
    v2MapLayers,
    mapZoomLevel,
    handlePlaceSelectWithCameraIntent,
    routePreviewDeclutterActive,
    previewVisibleGateMarkers,
    previewVisibleBlocks,
  ]);

  // Camera priority: a destination already handed off by the Directory when the map mounts is where the map STARTS,
  // so the first painted frame is the destination, never the venue overview. (Marker 30% down: clear of the sheet.)
  const initialDestinationRef = useRef<Coordinate | null>(useAppStore.getState().pendingDirectorySelection?.coordinate ?? null);
  const effectiveInitialRegion = useV2Map
    ? initialDestinationRef.current
      ? placeFocusRegion(initialDestinationRef.current, 0.3)
      : {
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
  const showOutsideBanner = !!currentLocation && !venueStatus.insideVenue && !outsideBannerDismissed && !activePreviewRoute;
  const nearestEntryGate = useMemo(() => {
    if (!currentLocation || venueStatus.insideVenue) return null;
    // Destination-aware whenever a place is already selected, so this banner can
    // never disagree with the gate Directions would actually route through for the
    // same position + destination through the ViewModel recommendation.
    return recommendPreviewEntryGate(currentLocation, selectedPlace) ?? null;
  }, [currentLocation, venueStatus.insideVenue, selectedPlace]);
  const outsideBannerAccessibilityLabel = nearestEntryGate
    ? `Outside Ijtema. Suggested entry through ${nearestEntryGate.name.en}. Final entry gate is confirmed when route preview is calculated.`
    : 'Outside Ijtema. Suggested entry unavailable. Final entry gate is confirmed when route preview is calculated.';
  // The Block 2 opening view is a fallback, so the notice goes away as soon as a live location exists or the user moves on.
  const showFallbackNotice = !!fallbackNotice && !(currentLocation && currentLocationSource === 'live') && mode === 'EXPLORE';
  const topInsetBase = Math.max(insets.top, Platform.OS === 'android' ? StatusBar.currentHeight ?? 0 : 0);
  // bannerStackTop used to be a hardcoded `topInsetBase + 140` guess at the combined
  // search bar + chip row height, which under-measured on some font scales/screen sizes
  // and let the banner overlap the chip row. Now derived from the search+chip overlay's
  // own onLayout height (topOverlayHeight). Falls back to the old constant only for the
  // one frame before the first layout pass reports a height.
  // Snap percentages are measured against the sheet's container: the window minus the reserved top
  // band below the overlays (see sheetSnapPoints), running to the window bottom, behind the system
  // navigation bar. The map-control stack must clear the sheet by that real extent: using the window
  // height made it float far above the sheet and, at the larger snaps, leave the screen (#208 F1).
  const sheetContainerHeight = windowHeight - (
    (topOverlayHeight > 0 ? topOverlayHeight + 8 : 0)
    + (mode === 'ROUTE_PREVIEW' ? MIN_TOP_VISIBLE_MAP_FOR_ROUTE_PREVIEW : MIN_TOP_VISIBLE_MAP_FOR_ATTRIBUTION)
  );
  // The sheet is given the inset-lifted snaps and the control stack clears exactly those. mapPadding and label
  // culling still use the declared snaps: they over-reach (window height) and must not grow with the lift.
  const layoutSnapPoints = useMemo(
    () => (mode === 'ROUTE_PREVIEW' ? ROUTE_PREVIEW_SNAP_POINTS : baseSnapPoints),
    [mode, baseSnapPoints],
  );
  const snapPoints = useMemo(
    () => (mode === 'ROUTE_PREVIEW'
      ? layoutSnapPoints
      : insetAwareSnapPoints(layoutSnapPoints, sheetContainerHeight, insets.bottom, fontScale)),
    [mode, layoutSnapPoints, sheetContainerHeight, insets.bottom, fontScale],
  );
  // The reserved top band is applied here, as pixel heights of the sheet's container (window minus the band),
  // instead of as gorhom's `topInset`. gorhom derives its container height from `topInset` only when the sheet
  // mounts and never recomputes it for a later change, so a mode switch while the sheet stays presented
  // (Place preview -> Route Preview: 160 -> 280) left every detent and the pinned footer on the old container:
  // the sheet and footer ended short of (or ran past) the window bottom (#208 F2, #128 D).
  const sheetSnapPoints = useMemo(
    () => snapPoints.map((snap) => Math.round((parseFloat(snap) / 100) * sheetContainerHeight)),
    [snapPoints, sheetContainerHeight],
  );
  const bannerStackTop = topOverlayHeight > 0 ? topOverlayHeight + 8 : topInsetBase + 140;
  // The full Layers/Compass/Zoom/Recenter cluster is one bottom-anchored stack (see
  // MapControls) instead of two independently-positioned pieces (a top-anchored
  // compass/zoom group and a separately bottom-anchored recenter button). Anchoring
  // everything from this single bottom value means the whole stack moves together and
  // can't collide with itself. Route preview lives inside the same BottomSheetModal as
  // place preview/details/directions (no separate floating card), so this always clears
  // the sheet at whatever snap height it's actually at (see useOverlayInsets.computeMapControlsInset).
  const controlStackOverlay: OverlayState = { kind: 'sheet', windowHeight: sheetContainerHeight, snapPoints, sheetIndex };
  const controlStackBottom = computeMapControlsInset(insets.bottom, controlStackOverlay);
  // The stack itself follows the sheet's MEASURED top (gorhom's animatedPosition, window-space Y, written
  // on the UI thread) — the percentage estimate above overshoots by up to ~217 dp (#208 F1) and stays only
  // for the tooltip anchor and mapPadding. A closed sheet reports a Y at/after the window bottom.
  const sheetTopY = useSharedValue(windowHeight);
  const [controlStackHeight, setControlStackHeight] = useState(CONTROL_STACK_FALLBACK_HEIGHT);
  const [controlStackWidth, setControlStackWidth] = useState(0);
  const [controlStackHidden, setControlStackHidden] = useState(false);
  const placeControlStack = (y: number) => {
    'worklet';
    return resolveControlStackPlacement({
      sheetTopY: y,
      windowHeight,
      floor: insets.bottom,
      topOverlayBottom: bannerStackTop,
      stackHeight: controlStackHeight,
    });
  };
  // Reanimated appends its own worklet hashes to the array it receives, so each hook needs a fresh one: a
  // shared array grew differently per hook and React logged 'useEffect changed size' on every render (#251).
  const controlStackDeps = () => [windowHeight, insets.bottom, bannerStackTop, controlStackHeight];
  const controlStackStyle = useAnimatedStyle(() => {
    const { bottom, visible } = placeControlStack(sheetTopY.value);
    return { bottom, opacity: visible ? 1 : 0 };
  }, controlStackDeps());
  // Opacity alone would leave a hidden stack touchable and focusable; mirror it as a boolean for the tree.
  useAnimatedReaction(
    () => placeControlStack(sheetTopY.value).visible,
    (visible, previous) => {
      if (visible !== previous) runOnJS(setControlStackHidden)(!visible);
    },
    controlStackDeps(),
  );
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
      snapPoints: layoutSnapPoints,
      sheetIndex,
      navBarHeight: activeNavBottomBarHeight,
    }),
    [activeNavBottomBarHeight, insets.bottom, layoutSnapPoints, mode, sheetIndex, topOverlayHeight, windowHeight],
  );
  // The MapLibre camera has no native base padding, so the route fit reserves the sheet-covered band itself:
  // mapLabelEdgeInsets.bottom (the same obstruction the labels and attribution already avoid) plus a small margin.
  // Scheduled for the next rendered frame so the sheet has settled at its new snap before the fit is measured.
  useEffect(() => {
    if (!activePreviewRoute || activePreviewRoute.coordinates.length < 2) return;
    const frame = requestAnimationFrame(() => {
      invalidateStartupCameraIntent();
      cameraManager.fitRoute(activePreviewRoute.coordinates, {
        top: Math.max(mapLabelEdgeInsets.top, 90),
        right: Math.max(mapLabelEdgeInsets.right, 64),
        bottom: mapLabelEdgeInsets.bottom + ROUTE_FIT_BOTTOM_PADDING,
        left: 64,
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [activePreviewRoute, cameraManager, invalidateStartupCameraIntent, mapLabelEdgeInsets]);
  // @gorhom/bottom-sheet computes EVERY snap point — the declared 15/50/92% ones, not
  // just content-driven dynamic sizing — as a percentage of its own containerHeight.
  // On this app's real window heights, the plain 92% snap alone already leaves less than
  // MIN_TOP_VISIBLE_MAP_FOR_ATTRIBUTION above the sheet (measured on-device: ~71dp) — no
  // dynamic sizing or over-drag needed to reproduce Route Preview's clip, a simple manual
  // drag to 92% does it. mapLabelEdgeInsets' clamp alone can't fix this: it only changes
  // what we tell the Google Maps SDK is obstructed, not how tall the sheet actually
  // renders, so the SDK can still place the logo somewhere the real (taller) sheet covers.
  // The reserved band is therefore taken out of the heights the snaps are computed from (see
  // sheetSnapPoints) — not passed as gorhom's `topInset`, which it does not re-apply once the
  // sheet is presented (#208 F2) — so 92% of that container can never reach into it (ATTR-001).
  const minimumVisibleMapHeight = mode === 'ROUTE_PREVIEW'
    ? MIN_TOP_VISIBLE_MAP_FOR_ROUTE_PREVIEW
    : MIN_TOP_VISIBLE_MAP_FOR_ATTRIBUTION;
  // Route-preview footer (Start Navigation, summary) is pinned by gorhom's footer slot; hide it at
  // the collapsed snap, where only the handle and header are meant to show.
  const renderDirectionsFooter = useCallback(
    (footerProps: BottomSheetFooterProps) => (
      <DirectionsSheetFooter {...footerProps} collapsed={sheetIndex === 0} />
    ),
    [sheetIndex],
  );
  // Caps dynamic sizing so a content-sized detent can never reach into the reserved top band, even for
  // content taller than the container. Same shared formula the mapPadding clamp above uses, so the two
  // ceilings can't drift apart.
  const sheetMaxDynamicContentSize = useMemo(
    () => computeMaxSheetOcclusionForAttribution(
      windowHeight,
      topOverlayHeight > 0 ? topOverlayHeight + 8 : 0,
      insets.bottom,
      minimumVisibleMapHeight,
    ),
    [insets.bottom, minimumVisibleMapHeight, topOverlayHeight, windowHeight],
  );

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

  const reducedMotion = useReducedMotion();
  useEffect(() => {
    if (reducedMotion) return;
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(userPulseAnim, { toValue: 1, duration: 1100, useNativeDriver: true }),
        Animated.timing(userPulseAnim, { toValue: 0, duration: 0, useNativeDriver: true }),
      ]),
    );
    pulse.start();
    return () => pulse.stop();
  }, [userPulseAnim, reducedMotion]);

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
    armSheetTransition(computeSheetIdentity(routePlannerDest, null), 'replacement');
    presentSheetForIdentity(1);
  }, [activePreviewRoute, directionsDestination, armSheetTransition, presentSheetForIdentity, routePlannerDest]);

  useEffect(() => {
    if (!showAnyNavOverlay) return;
    // Navigation starting is the one unconditional close: whatever transition was
    // previously armed (e.g. Start Navigation's own arm) is superseded here — the
    // sheet is closing for good, not settling into a new identity.
    armSheetTransition(null, 'start-navigation');
    setDirectionsDestination(null);
    closeSheetNative();
  }, [showAnyNavOverlay, armSheetTransition, closeSheetNative]);

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
    // Switching the sheet from "place" to "route" identity re-presents/re-snaps an
    // already-open BottomSheetModal, which can fire a transient onDismiss for the old
    // identity. Arm the transition first so handleSheetDismiss recognizes that dismiss as expected instead of tearing
    // down the directions state it just set.
    armSheetTransition(computeSheetIdentity(destination, null), 'replacement');
    setDirectionsDestination(destination);
    presentSheetForIdentity(1);
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
    // No imperative sheet call happens here — the sheet stays mounted and its content
    // just swaps reactively. Arming still matters: it records the new toIdentity for
    // bookkeeping and, more importantly, does NOT clear pendingNativeSheetEchoRef, so
    // an earlier still-in-flight transition (e.g. the Open Directions call that first
    // produced this route) keeps protecting this newer identity from its late echo.
    armSheetTransition(computeSheetIdentity(place, null), 'replacement');
    setDirectionsDestination(place);
  }, [armSheetTransition]);

  // Get Directions asks the Directory (the one place chooser) for a start or destination; the choice comes back
  // through the store and Get Directions applies it. The sheet stays mounted, so its route intent is kept.
  const setDirectoryPurpose = useAppStore((s) => s.setDirectoryPurpose);
  const handleOpenDirectoryFor = useCallback((purpose: DirectoryPurpose) => {
    setDirectoryPurpose(purpose);
    nav.navigate('LocationsDirectory');
  }, [nav, setDirectoryPurpose]);

  // Once a place is selected the camera has moved on from Block 2, so the fallback notice is no longer true.
  useEffect(() => {
    if (selectedPlace) setFallbackNotice(null);
  }, [selectedPlace]);

  // "Change place" on the Block 2 notice opens the Directory in start mode with no route sheet to take the answer.
  // Without a destination the pick returns like any Directory pick (the place is selected on the Map); the quick
  // options only move the camera. Nothing here writes a location.
  const directoryChoice = useAppStore((s) => s.directoryChoice);
  const setDirectoryChoice = useAppStore((s) => s.setDirectoryChoice);
  const setPendingDirectorySelection = useAppStore((s) => s.setPendingDirectorySelection);
  const lastKnownLocation = useAppStore((s) => s.lastKnownLocation);
  useEffect(() => {
    if (directoryChoice?.purpose !== 'start' || directionsDestination) return;
    setDirectoryChoice(null);
    if ('place' in directoryChoice) setPendingDirectorySelection(directoryChoice.place);
    else if (directoryChoice.quick === 'current_location') void handleRecenterPress();
    else if (lastKnownLocation) cameraManager.animateToUser(lastKnownLocation);
  }, [cameraManager, directionsDestination, directoryChoice, handleRecenterPress, lastKnownLocation, setDirectoryChoice, setPendingDirectorySelection]);

  // Full reset to EXPLORE — replaces the two ad hoc `setSelectedPlace(null) +
  // bottomSheetRef.close()` call sites that existed independently before and didn't
  // account for detailsExpanded/arrived/directionsDestination.
  const closeSheet = useCallback(() => {
    armSheetTransition(null, 'state-reset');
    resetDismissedSheetState(false);
    closeSheetNative();
  }, [armSheetTransition, closeSheetNative, resetDismissedSheetState]);

  const handleStartPreviewNavigation = useCallback(() => {
    if (!activePreviewRoute || !previewDestination) return;
    invalidateStartupCameraIntent();
    const startCheck = startPreviewNavigationV2({
      route: activePreviewRoute,
      destination: previewDestination,
      startPlace: routePlannerOrigin,
      currentLocation,
    });
    if (!startCheck.canStart) {
      Alert.alert('Cannot start navigation', startCheck.message);
    }
  }, [activePreviewRoute, currentLocation, invalidateStartupCameraIntent, previewDestination, routePlannerOrigin]);

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
      // Another screen (or the drawer) is in front: Back belongs to it, not to hidden Home state.
      if (sheetSuppressed) return false;
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
  }, [sheetSuppressed, mode, closeDetails, directionsDestination, handleCloseDirections, handleClearPreviewRoute, closeSheet]);

  // A remembered (not live) position stays visibly remembered: the dot is dimmed and captioned "last known".
  const rememberedLabelCoordinate = currentLocationSource === 'remembered'
    ? showNavOverlay
      ? navOverlay.snappedLocation
      : markerOwnership.showBrowseUser
        ? currentLocation
        : null
    : null;
  // The destination pin's tip marks the place, so its own label hangs below the tip instead of under the pin body.
  const destinationPinVisible = Boolean(
    activePreviewRoute ? previewDestinationCoordinate : markerOwnership.showBrowseSelection && selectedPlace && selectedPlaceMarkerCoordinate,
  );
  const allMapLabelItems = useMemo<MapLabelItem[]>(() => {
    const items = hangSelectedLabelsBelowPin(mapLabelItems, destinationPinVisible);
    return rememberedLabelCoordinate
      ? [
          ...items,
          {
            id: 'user_last_known',
            coordinate: rememberedLabelCoordinate,
            text: 'last known',
            kind: 'user',
            zPriority: 40,
            yOffset: 26,
            accessibilityLabel: 'Your last known location',
          },
        ]
      : items;
  }, [destinationPinVisible, mapLabelItems, rememberedLabelCoordinate]);

  // MapLibre has no onMapReady: the style + archive finishing loading is the point the camera can be commanded.
  const handleMapReady = () => {
    mapReadyRef.current = true;
    setMapReadyState(true);
    cameraManager.notifyNativeMapReady();
    // MapLibre applies the initial camera synchronously when the Camera mounts (react-native-maps applied initialRegion
    // shortly after ready and dropped earlier commands), so there is no initial region left to wait for: settle now
    // instead of holding the startup camera for the 2.5 s fallback timer.
    settleStartupRegion();
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
        graphOnlyFallbackUsed,
      });
    }

  };

  const handleFeaturePress = useCallback(({ id, kind, coordinate }: MapFeaturePress) => {
    const place = kind === 'facility' ? LANDMARK_PLACES.find((p) => p.id === id) : V2PlaceAdapter.getPlaceById(id);
    if (!place) return;
    collectTapCandidate({ id, kind, coordinate, payload: place });
  }, [collectTapCandidate]);

  // Everything drawn on top of the basemap, bottom → top. Navigation/arrival and browse/preview are exclusive scenes.
  // The navigation overlay hooks return a fresh object every render, so the scenes depend on the specific fields they read
  // (otherwise every GPS tick / drag / zoom would rebuild and re-serialise every GeoJSON source).
  // A replaced route (accepted reroute) reveals and the old one fades; the route navigation starts with does not.
  // Arrival plays one destination ring per journey (the `arrived` latch keeps ARRIVAL mode until navigation resets).
  const inNavigationScene = mode === 'NAVIGATION' || mode === 'ARRIVAL';
  const navRouteCoordinates = navOverlay.route?.coordinates ?? navOverlayV1.route?.coordinates ?? null;
  const navRouteKey = inNavigationScene && navRouteCoordinates && navRouteCoordinates.length > 0 ? routeRevealKey(navRouteCoordinates) : null;
  const rerouteRevealKey = useRerouteRevealKey(navRouteKey);
  const arrivalPulse = useDestinationPulse(mode === 'ARRIVAL' && navRouteKey ? `arrival:${navRouteKey}` : null, reducedMotion);
  const navSceneInput = useMemo(
    () => ({
      revealKey: rerouteRevealKey,
      pulse: arrivalPulse,
      route: navOverlay.route,
      snappedLocation: navOverlay.snappedLocation,
      arrived: navOverlay.arrived,
      reroutePending: navOverlay.reroutePending,
      mapLayers: navOverlay.mapLayers,
      currentLocationSource: navOverlay.currentLocationSource,
    }),
    [rerouteRevealKey, arrivalPulse, navOverlay.route, navOverlay.snappedLocation, navOverlay.arrived, navOverlay.reroutePending, navOverlay.mapLayers, navOverlay.currentLocationSource],
  );
  const navSceneInputV1 = useMemo(
    () => ({
      revealKey: rerouteRevealKey,
      pulse: arrivalPulse,
      route: navOverlayV1.route,
      destination: navOverlayV1.destination,
      snappedLocation: navOverlayV1.snappedLocation,
      arrived: navOverlayV1.arrived,
      reroutePending: navOverlayV1.reroutePending,
      mapLayers: navOverlayV1.mapLayers,
      currentLocationSource: navOverlayV1.currentLocationSource,
    }),
    [rerouteRevealKey, arrivalPulse, navOverlayV1.route, navOverlayV1.destination, navOverlayV1.snappedLocation, navOverlayV1.arrived, navOverlayV1.reroutePending, navOverlayV1.mapLayers, navOverlayV1.currentLocationSource],
  );
  // Venue context: no location dependencies, so a GPS tick never rebuilds it.
  const browseVenueSpecs = useMemo<OverlaySpec[]>(
    () => useV2Map
      ? buildHomeVenueOverlay({
          venueBoundary: v2MapLayers.venueBoundary,
          blocks: showBlockPolygons ? previewVisibleBlocks : [],
          rastas: previewVisibleRastas,
          specialRoutes: previewVisibleSpecialRoutes,
          gates: previewVisibleGateMarkers,
          facilities: LANDMARK_PLACES,
          selectedFacilityId: selectedPlace?.id,
          activeMapFilter: v2MapLayers.activeMapFilter,
        })
      : [],
    [previewVisibleBlocks, previewVisibleGateMarkers, previewVisibleRastas, previewVisibleSpecialRoutes, selectedPlace?.id, showBlockPolygons, useV2Map, v2MapLayers.activeMapFilter, v2MapLayers.venueBoundary],
  );
  const previewRouteSpecs = useMemo<OverlaySpec[]>(
    () => activePreviewRoute && activePreviewRoute.coordinates.length > 1
      ? buildRouteOverlay({
          outside: previewOutsideLegCoordinates,
          roadFollowing: activePreviewRoute.outsideRoute?.roadFollowing ?? false,
          inside: previewInsideLegCoordinates,
          // Same geometry = same route: a re-fetch or re-render never replays the reveal, a new start or destination does.
          revealKey: routeRevealKey(activePreviewRoute.coordinates),
        })
      : [],
    [activePreviewRoute, previewInsideLegCoordinates, previewOutsideLegCoordinates],
  );
  // One ring pulse per chosen destination (a selected place, then the same place as the route-preview destination).
  const pulseTarget = activePreviewRoute
    ? previewDestinationCoordinate
    : markerOwnership.showBrowseSelection && selectedPlace
      ? selectedPlaceMarkerCoordinate
      : null;
  const destinationPulse = useDestinationPulse(pulseTarget ? `${pulseTarget.latitude},${pulseTarget.longitude}` : null, reducedMotion);
  const mapOverlays = useMemo<OverlaySpec[]>(() => {
    const browseUser = markerOwnership.showBrowseUser && currentLocation
      ? buildMarkerOverlay({
          user: {
            coordinate: currentLocation,
            accuracy: currentLocation.accuracy,
            heading: currentLocation.heading,
            remembered: currentLocationSource === 'remembered',
            following: cameraManager.mode === 'FOLLOWING_USER',
          },
        })
      : [];
    if (mode === 'NAVIGATION' || mode === 'ARRIVAL') {
      return [...buildNavigationScene(navSceneInput), ...buildNavigationSceneV1(navSceneInputV1), ...browseUser];
    }
    const selectedPin = markerOwnership.showBrowseSelection && selectedPlace && selectedPlaceMarkerCoordinate && !activePreviewRoute
      ? selectedPlaceMarkerCoordinate
      : null;
    return [
      ...browseVenueSpecs,
      ...previewRouteSpecs,
      ...buildMarkerOverlay({
        selectedPin,
        destination: activePreviewRoute ? previewDestinationCoordinate : null,
        start: showPreviewStartMarker ? previewStartCoordinate : null,
        pulse: destinationPulse,
      }),
      ...browseUser,
    ];
  }, [
    activePreviewRoute,
    browseVenueSpecs,
    cameraManager.mode,
    currentLocation,
    currentLocationSource,
    destinationPulse,
    markerOwnership.showBrowseSelection,
    markerOwnership.showBrowseUser,
    mode,
    navSceneInput,
    navSceneInputV1,
    previewDestinationCoordinate,
    previewRouteSpecs,
    previewStartCoordinate,
    selectedPlace,
    selectedPlaceMarkerCoordinate,
    showPreviewStartMarker,
  ]);

  const openLayerOptions = () => setLayersSheetVisible(true);

  const renderChips = () => {
    return (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.chipsContainer}
        contentContainerStyle={styles.chipsContent}
      >
        <Pressable
          key="all-locations"
          style={[styles.chip, styles.allLocationsChip]}
          onPress={() => {
            logHomeControl('all_locations_chip', 'open_directory');
            nav.navigate('LocationsDirectory');
          }}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel="Browse all locations"
        >
          <LayoutGrid size={14} color={staticColors.info} />
          <Text style={[styles.chipText, styles.allLocationsChipText]} numberOfLines={1} ellipsizeMode="tail">
            All Locations
          </Text>
        </Pressable>
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

        {/* The archive is installed from the APK in milliseconds (no network); until then a plain land-coloured surface
            avoids mounting the style twice (placeholder style first, real style after) — a swap after ready would re-add
            every source and flash the map. */}
        {basemap.status === 'loading' ? (
          <View testID="home-map-placeholder" style={[styles.map, { backgroundColor: BASEMAP_COLORS.land }]} />
        ) : (
          <OfflineMapCanvas
            testID="home-map-view"
            ref={mapRef}
            // Route preview, navigation and arrival are exclusive workflows: the map precedes the portal-hosted
            // sheet in Android's accessibility tree, so TalkBack would walk the map before reaching the workflow.
            // Place Details keeps the map reachable because feature selection is still a valid action there.
            importantForAccessibility={
              mode === 'ROUTE_PREVIEW' || mode === 'NAVIGATION' || mode === 'ARRIVAL' ? 'no-hide-descendants' : 'auto'
            }
            style={styles.map}
            archiveUri={basemapRejected ? null : basemap.uri}
            onLoadFailed={() => setBasemapRejected(true)}
            archiveZoom={provenance.zoom}
            initialRegion={effectiveInitialRegion}
            overlays={mapOverlays}
            // The OSM attribution control is reserved the same sheet/nav-chrome-derived band the labels use (ATTR-001).
            attributionBottomInset={mapLabelEdgeInsets.bottom + 8}
            gesturesEnabled={!layersSheetVisible}
            rotateEnabled={!settings.keepNorthFixed}
            onLayout={(width, height) => cameraManager.notifyMapLayout(width, height)}
            onReady={handleMapReady}
            onRegionChange={() => {
              // Continuous — fires on every camera-move tick including pure-rotation gestures, so label
              // positions stay attached to the map while it is panned/zoomed/rotated. Internally
              // rAF-coalesced, so calling this on every tick is safe.
              mapLabelOverlayRef.current?.requestProjection();
            }}
            onRegionChangeComplete={(region) => {
              settleStartupRegion();
              setIsMapDragging(false);
              handleMapRegionChangeComplete(region);
              mapLabelOverlayRef.current?.requestProjection();
            }}
            onUserPan={() => {
              invalidateStartupCameraIntent();
              cameraManager.cancelEarlyReplay();
              handleNavigationPan();
              setIsMapDragging(true);
            }}
            onFeaturePress={handleFeaturePress}
            onBackgroundPress={() => {
              if (selectedPlace) {
                closeSheet();
              }
            }}
          />
        )}

        <OsmAttribution
          visible={showOsmAttribution}
          top={insets.top + (showAnyNavOverlay ? 148 : 118)}
        />

        {(mode === 'NAVIGATION' || mode === 'ARRIVAL') && <NavigationChromeV2 overlay={navOverlayForChrome} hasBaseMap={hasBaseMap} />}
        {(mode === 'NAVIGATION' || mode === 'ARRIVAL') && <NavigationChromeV1 overlay={navOverlayV1ForChrome} hasBaseMap={hasBaseMap} />}
        <MapLabelOverlay
          ref={mapLabelOverlayRef}
          mapRef={mapRef}
          items={allMapLabelItems}
          disableTouch={isMapDragging}
          edgeInsets={mapLabelEdgeInsets}
        />

        {/* ARRIVAL outranks NAVIGATION in deriveMapMode and still shows the navigation chrome, so the
            search bar/chips must hide for both or they draw over the maneuver banner. */}
        {mode !== 'NAVIGATION' && mode !== 'ARRIVAL' && !directionsDestination && (
        <SafeAreaView
          style={styles.topOverlay}
          pointerEvents="box-none"
          onLayout={(e) => setTopOverlayHeight(e.nativeEvent.layout.height)}
        >
          {/* This bar was styled like a search bar (Google Maps-style pill, shadow,
              52dp height) but only ever held the menu button — the actual "search for
              a destination" action lived a scroll-row down, in a small chip. Filling the
              bar with what it already visually promises makes search the obvious primary
              action on the map, not a secondary chip beside a hamburger icon. */}
          <View style={[styles.searchBarContainer, { backgroundColor: theme.searchBar }]}>
            <Pressable
              onPress={() => {
                logHomeControl('menu', 'open_drawer');
                nav.dispatch(DrawerActions.openDrawer());
              }}
              style={styles.iconButton}
              accessibilityRole="button"
              accessibilityLabel="Open menu"
            >
              <Menu size={24} color={theme.subtext} />
            </Pressable>
            <Pressable
              style={styles.searchBarAction}
              onPress={() => {
                logHomeControl('search_bar', 'open_directory');
                nav.navigate('LocationsDirectory');
              }}
              accessibilityRole="button"
              accessibilityLabel="Search destinations"
            >
              <Search size={18} color={theme.subtext} />
              <Text style={[styles.searchBarPlaceholder, { color: theme.subtext }]} numberOfLines={1}>
                Search destinations
              </Text>
            </Pressable>
          </View>

          <Animated.View style={{ opacity: chipsAnim }} pointerEvents={isMapDragging ? 'none' : 'box-none'}>
            {renderChips()}
          </Animated.View>
        </SafeAreaView>
        )}

        {mode !== 'NAVIGATION' && (isOffline || showOutsideBanner || showFallbackNotice) && (
          <View style={[styles.bannerStack, { top: bannerStackTop }]}>
            {/* Passive offline status. Route/gate context (showOutsideBanner) stays a separate, non-competing slot. */}
            {isOffline ? (
              <View style={[styles.offlineIndicator, styles.bannerStackItem]} accessibilityLiveRegion="polite">
                <WifiOff size={14} color="#FFFFFF" />
                <Text style={styles.offlineText}>Offline</Text>
              </View>
            ) : null}

            {showFallbackNotice && (
              <View
                style={[
                  styles.mapWarningBanner,
                  styles.bannerStackItem,
                  controlStackWidth > 0 && { marginRight: CONTROL_STACK_RIGHT + controlStackWidth + BANNER_CONTROL_GAP },
                ]}
                accessibilityLiveRegion="polite"
              >
                <Text style={styles.mapWarningText}>{fallbackNotice}</Text>
                <Pressable
                  onPress={() => handleOpenDirectoryFor('start')}
                  accessibilityRole="button"
                  accessibilityLabel="Change place"
                  style={styles.fallbackNoticeAction}
                >
                  <Text style={styles.fallbackNoticeActionText}>Change place</Text>
                </Pressable>
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
              {getHomeRouteDiagnostics().map((r) => `${r.from}->${r.to}:${r.success ? 'OK' : 'FAIL'}`).join(' | ')}
            </Text>
          </View>
        )}

        {mode !== 'NAVIGATION' && (
          <>
            <ReanimatedView.View
              testID="map-control-stack"
              style={[styles.controlStack, controlStackStyle]}
              pointerEvents={controlStackHidden ? 'none' : 'auto'}
              accessibilityElementsHidden={controlStackHidden}
              importantForAccessibility={controlStackHidden ? 'no-hide-descendants' : 'auto'}
              onLayout={(event) => {
                setControlStackHeight(event.nativeEvent.layout.height);
                setControlStackWidth(event.nativeEvent.layout.width);
              }}
            >
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
            </ReanimatedView.View>

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
          snapPoints={sheetSnapPoints}
          animatedPosition={sheetTopY}
          // Dynamic sizing inserts and sorts an extra detent, changing onChange indexes.
          // Route Preview uses those indexes to keep mapPadding and camera framing aligned,
          // so retain the declared 15/50/92% index contract while that mode is active.
          enableDynamicSizing={mode !== 'ROUTE_PREVIEW'}
          // Not dragged past the top detent into the reserved band; no topInset (see sheetSnapPoints).
          enableOverDrag={false}
          maxDynamicContentSize={sheetMaxDynamicContentSize}
          enablePanDownToClose
          // display:none drops the whole sheet (handle, content, pinned footer) from touch and
          // the accessibility tree while keeping it mounted, so selection, route and snap index
          // are exactly as the user left them when Home is foreground again.
          containerStyle={sheetSuppressed ? styles.sheetSuppressed : undefined}
          // gorhom defaults the sheet container to accessible + role "adjustable" + label "Bottom Sheet",
          // which makes TalkBack treat the whole sheet as one stop and swallow the non-actionable
          // title, subtitle and footer summary inside it. Let the children own their semantics.
          accessible={false}
          accessibilityLabel={null}
          accessibilityRole={null}
          backgroundComponent={SheetBackground}
          footerComponent={renderDirectionsFooter}
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
              // The sheet has genuinely landed open again — any transition that was
              // protecting against a stale close echo has now settled for real, so a
              // later dismiss is a real user gesture, not an artifact of our own
              // present()/snapToIndex call.
              pendingNativeSheetEchoRef.current = false;
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
          onDismiss={() => {
            // The modal unmounts on dismiss, so gorhom stops writing the position; park it at the window bottom.
            sheetTopY.value = windowHeight;
            handleSheetDismiss();
          }}
        >
          {routePreviewSheetDestination ? (
            <LocationSheet
              mode="routePreview"
              destination={routePreviewSheetDestination}
              onClose={directionsDestination ? handleCloseDirections : handleClearPreviewRoute}
              onStartNavigation={handleStartPreviewNavigation}
              onViewRoute={() => bottomSheetRef.current?.snapToIndex(0)}
              onCancelRoute={activePreviewRoute ? handleClearPreviewRoute : undefined}
              onChangeDestination={handleChangeDestination}
              onOpenDirectory={handleOpenDirectoryFor}
              basemapOffline={graphOnlyFallbackUsed}
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
  topOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0,
    zIndex: Z.mapControls,
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
  searchBarAction: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    height: '100%',
    paddingRight: 14,
  },
  searchBarPlaceholder: { fontSize: 15, flexShrink: 1 },
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
  allLocationsChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: staticColors.infoBackground,
    borderColor: staticColors.infoBorder,
  },
  allLocationsChipText: { color: staticColors.infoStrong, fontWeight: '700' },
  chipText: { fontSize: 13, color: '#3C4043', fontWeight: '500' },
  navControls: { position: 'absolute', right: 16, zIndex: Z.mapControls },
  // Single bottom-anchored Layers/Compass/Zoom/Recenter stack (see MapControls) —
  // replaces the old separately-anchored rightControls (top) + bottomControls
  // (bottom) pair that could collide when a route-preview card shrank the gap
  // between them.
  controlStack: { position: 'absolute', right: CONTROL_STACK_RIGHT, zIndex: Z.mapControls },
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
  fallbackNoticeAction: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
  fallbackNoticeActionText: { color: '#7C4A03', fontSize: 13, fontWeight: '700', textDecorationLine: 'underline' },
  outsideVenueBanner: {
    marginLeft: 12,
    marginRight: 76,
    backgroundColor: staticColors.weakGpsBackground,
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
  sheetSuppressed: { display: 'none' },
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

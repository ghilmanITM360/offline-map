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
  Share,
  Alert,
  Keyboard,
  BackHandler,
  Animated,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import MapView, { Marker, Polygon, Polyline, PROVIDER_GOOGLE, LocalTile } from 'react-native-maps';
import {
  Menu,
  Navigation,
  LocateFixed,
  Star,
  MapPin,
  ChevronRight,
  WifiOff,
  X,
  Clock,
  Share2,
  Info,
  Check,
  AlertTriangle,
} from 'lucide-react-native';
import { BottomSheetModal, BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { useNavigation, DrawerActions, CompositeNavigationProp } from '@react-navigation/native';
import { DrawerNavigationProp } from '@react-navigation/drawer';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useHomeViewModel } from '../../viewmodels/HomeViewModel';
import { useTheme } from '../../services/useTheme';
import { GRAPH_VALIDATION, IJTEMA_DATA, MAP_BOUNDS } from '../../constants/data';
import { Place, RoutePreview, SearchResult } from '../../models/types';
import { PlaceDetailService } from '../../services/PlaceDetailService';
import { FavoriteService } from '../../services/FavoriteService';
import { InstructionService } from '../../services/InstructionService';
import { useAppStore } from '../../store/useAppStore';
import { RoutePointService } from '../../services/RoutePointService';
import { Paths } from 'expo-file-system';
import { DrawerParamList, RootStackParamList } from '../../navigation/RootNavigator';
import { RoutingService } from '../../services/RoutingService';
import { MapConfigService } from '../../services/MapConfigService';
import { MapFeatureFlagsService } from '../../services/MapFeatureFlagsService';
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
import { MapControls } from '../components/map/MapControls';
import { LayersSheet } from '../components/map/LayersSheet';
import { useNavigationOverlayV2 } from '../../viewmodels/useNavigationOverlayV2';
import { useScreenMode } from '../../viewmodels/useScreenMode';
import { NavigationMapLayersV2 } from '../components/navigation/NavigationMapLayersV2';
import { NavigationChromeV2 } from '../components/navigation/NavigationChromeV2';
import { DirectionsScreen } from './DirectionsScreen';
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

type V2PreviewRoute = RoutePreview & {
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
  const activeRoute = useAppStore((s) => s.activeRoute);
  const clearRoutePlanner = useAppStore((s) => s.clearRoutePlanner);
  const favorites = useAppStore((s) => s.favorites);
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
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const mapRuntimeStatus = MapConfigService.getRuntimeStatus();
  const hasGoogleMapsKey = mapRuntimeStatus.keyPresent;
  const useV2Map = MapFeatureFlagsService.useIjtemaV2Map();
  const graphOnlyFallbackUsed = !hasGoogleMapsKey;
  const [outsideBannerDismissed, setOutsideBannerDismissed] = useState(false);
  const [mapLabelsTransitioning, setMapLabelsTransitioning] = useState(false);
  const [layersSheetVisible, setLayersSheetVisible] = useState(false);
  const [mapReady, setMapReadyState] = useState(false);
  const [mapLoadFailed, setMapLoadFailed] = useState(false);
  const [bannerStackHeight, setBannerStackHeight] = useState(0);
  const [topOverlayHeight, setTopOverlayHeight] = useState(0);
  const [routePreviewCardMeasuredHeight, setRoutePreviewCardMeasuredHeight] = useState(184);
  const [isMapDragging, setIsMapDragging] = useState(false);
  const [recenterState, setRecenterState] = useState<'idle' | 'loading' | 'success' | 'failure'>('idle');
  const searchFocusAnim = useRef(new Animated.Value(0)).current;
  const warningAnim = useRef(new Animated.Value(0)).current;
  const userPulseAnim = useRef(new Animated.Value(0)).current;
  const chipsAnim = useRef(new Animated.Value(1)).current;

  const dismissSearch = useCallback(() => {
    setIsSearchFocused(false);
    searchInputRef.current?.blur();
    Keyboard.dismiss();
  }, []);

  const logHomeControl = useCallback((pressed: string, action: string) => {
    if (__DEV__) {
      console.log(`[HomeControl] pressed=${pressed} action=${action}`);
    }
  }, []);

  const {
    mapRef,
    bottomSheetRef,
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
    mapZoomLevel,
    venueStatus,
    setIsMapReady,
    handleSearch,
    handlePlaceSelect,
    handleRecenter,
    handleCompassReset,
    handleZoomIn,
    handleZoomOut,
    handleMapRegionChangeComplete,
    clearSearch,
    handleCategoryPress,
    setSelectedPlace,
    updateSettings,
    settings,
  } = useHomeViewModel();

  const navOverlay = useNavigationOverlayV2({
    mapRef,
    mapReady,
    mapZoomLevel,
    hasGoogleMapsKey,
    userPulseAnim,
  });
  const showNavOverlay = navOverlay.active && MapFeatureFlagsService.useIjtemaV2Navigation();

  useEffect(() => {
    setSelectedEntryIdx(0);
  }, [selectedPlace?.id]);

  useEffect(() => {
    const handler = BackHandler.addEventListener('hardwareBackPress', () => {
      if (isSearchFocused) {
        dismissSearch();
        return true;
      }
      return false;
    });
    return () => handler.remove();
  }, [isSearchFocused, dismissSearch]);

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
    () => ((isSearchFocused || searchQuery.length > 1)
      ? searchResults.filter((item) => (item as any).coordinate && (item as any).id !== selectedPlace?.id)
      : []),
    [isSearchFocused, searchQuery, searchResults, selectedPlace],
  );
  const activePreviewRoute = useMemo(() => {
    if (isNavigating) return null;
    if (!routePlannerDest || routePlannerDest.sourceVersion !== 'v2') return null;
    return isV2PreviewRoute(activeRoute) ? activeRoute : null;
  }, [activeRoute, isNavigating, routePlannerDest]);

  const mode = useScreenMode({
    layersSheetVisible,
    showNavOverlay,
    directionsDestination,
    activePreviewRoute,
    selectedPlace,
  });

  const { outside: previewOutsideLegCoordinates, inside: previewInsideLegCoordinates } = useMemo(
    () => V2MapRenderingService.splitOutsideInsideCoordinates(
      activePreviewRoute?.coordinates ?? [],
      activePreviewRoute?.outsideLegCoordinateCount,
    ),
    [activePreviewRoute],
  );
  const previewDestination = activePreviewRoute ? routePlannerDest : null;
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
  const previewRouteSummary = useMemo(() => {
    if (!activePreviewRoute) return null;
    if (activePreviewRoute.startResolution?.mode === 'outside') {
      const gateLabel = activePreviewRoute.startResolution.gate?.name.en;
      // Recommended gate renders as its own badge row (see previewRecommendedGate below)
      // when one is resolved — keep this text limited to the no-gate-yet case.
      return gateLabel ? 'Outside Ijtema.' : 'Outside Ijtema. Enter through nearest connected official gate.';
    }
    if (routePlannerOrigin) return `Start from ${routePlannerOrigin.name}.`;
    return currentLocationSource === 'remembered' ? 'Start from last known location.' : 'Start from current location.';
  }, [activePreviewRoute, currentLocationSource, routePlannerOrigin]);
  const previewRecommendedGate = activePreviewRoute?.startResolution?.mode === 'outside'
    ? activePreviewRoute.startResolution.gate?.name.en ?? null
    : null;
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
  const routePreviewDeclutterActive = mode === 'ROUTE_PREVIEW';
  const previewVisibleBlocks = routePreviewDeclutterActive
    ? v2MapLayers.blocks.filter((block) => block.isSelected)
    : v2MapLayers.visibleBlocks;
  const previewVisibleBlockLabels = routePreviewDeclutterActive ? previewVisibleBlocks : v2MapLayers.visibleBlockLabels;
  const previewVisibleGateMarkers = routePreviewDeclutterActive
    ? v2MapLayers.gates.filter((gate) => gate.isSelected || gate.id === previewEntryGateId)
    : v2MapLayers.visibleGateMarkers;
  const previewVisibleRastas = routePreviewDeclutterActive ? [] : v2MapLayers.visibleRastas;
  const previewVisibleRastaLabels = routePreviewDeclutterActive ? [] : v2MapLayers.visibleRastaLabels;
  const previewVisibleSpecialRoutes = routePreviewDeclutterActive ? [] : v2MapLayers.specialRoutes;
  const previewVisibleSpecialRouteLabels = routePreviewDeclutterActive ? [] : v2MapLayers.visibleSpecialRouteLabels;
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
      PlaceDetailService.distanceToBlock(selectedPlace.id, currentLocation),
      settings.walkingSpeed ?? 1.4,
    )
    : null;

  const isFav = selectedPlace ? favorites.some((f) => f.placeId === selectedPlace.id) : false;
  const showOutsideBanner = !!currentLocation && !venueStatus.insideVenue && !outsideBannerDismissed && !activePreviewRoute && !isSearchFocused && searchQuery.length === 0 && !activeCategory;
  const nearestEntryGate = useMemo(() => {
    if (!currentLocation || venueStatus.insideVenue) return null;
    // Destination-aware whenever a place is already selected, so this banner can
    // never disagree with the gate Directions would actually route through for the
    // same position + destination (see RoutingServiceV2.recommendOutsideEntryGate).
    const destination = selectedPlace && selectedPlace.sourceVersion === 'v2' ? destinationFromPlace(selectedPlace) : null;
    return RoutingServiceV2.recommendOutsideEntryGate(currentLocation, destination) ?? null;
  }, [currentLocation, venueStatus.insideVenue, selectedPlace]);
  const showMapWarningBanner = !hasGoogleMapsKey || mapLoadFailed;
  const topInsetBase = Math.max(insets.top, Platform.OS === 'android' ? StatusBar.currentHeight ?? 0 : 0);
  // Phase 7 (task #34): rightControlsTop/rightControlsBottom used to be a chain of hardcoded
  // per-banner height guesses (42/56/60) that could drift out of sync with real rendered
  // content (text wrapping, font scaling). Both now derive from onLayout-measured heights of
  // the actual stacked banners / route-preview card instead.
  // bannerStackTop used to be a hardcoded `topInsetBase + 140` guess at the combined
  // search bar + chip row height, which under-measured on some font scales/screen sizes
  // and let the banner overlap the chip row. Now derived from the search+chip overlay's
  // own onLayout height (topOverlayHeight), same measure-don't-guess pattern as
  // bannerStackHeight/routePreviewCardMeasuredHeight below. Falls back to the old
  // constant only for the one frame before the first layout pass reports a height.
  const bannerStackTop = topOverlayHeight > 0 ? topOverlayHeight + 8 : topInsetBase + 140;
  const rightControlsTop = bannerStackTop + bannerStackHeight + (bannerStackHeight > 0 ? (showOutsideBanner ? 20 : 12) : 12);
  const rightControlsBottom = Math.max(insets.bottom, 16) + (activePreviewRoute ? routePreviewCardMeasuredHeight + 16 : 0) + 16;

  useEffect(() => {
    Animated.timing(searchFocusAnim, {
      toValue: isSearchFocused ? 1 : 0,
      duration: 160,
      useNativeDriver: false,
    }).start();
  }, [isSearchFocused, searchFocusAnim]);

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

  useEffect(() => {
    if (!hasGoogleMapsKey) {
      setMapLoadFailed(false);
      return;
    }
    if (mapReady) {
      setMapLoadFailed(false);
      return;
    }
    const timeout = setTimeout(() => {
      setMapLoadFailed(true);
    }, 7000);
    return () => clearTimeout(timeout);
  }, [hasGoogleMapsKey, mapReady]);

  useEffect(() => {
    if (venueStatus.insideVenue) {
      setOutsideBannerDismissed(false);
    }
  }, [venueStatus.insideVenue]);

  useEffect(() => {
    if (!activePreviewRoute || directionsDestination) return;
    bottomSheetRef.current?.close();
  }, [activePreviewRoute, directionsDestination, bottomSheetRef]);

  useEffect(() => {
    if (!showNavOverlay) return;
    setDirectionsDestination(null);
    bottomSheetRef.current?.close();
  }, [showNavOverlay, bottomSheetRef]);

  // Gate/block/rasta label markers only need tracksViewChanges=true while their
  // visual state (map filter focus, which place is selected, or which zoom-LOD
  // tier is active) is actively transitioning. Keeping it true continuously forces
  // ongoing Android re-rasterization of every label marker on unrelated re-renders
  // (e.g. GPS updates), so we open a short window on change and then drop back to
  // false. Zoom tier matters here, not just filter/selection: a label marker that
  // mounts (block/rasta labels newly entering the zoom-filtered array) or changes
  // rendered size (gate full/compact/number text swap) with tracksViewChanges
  // already false can freeze on Android with a stale or blank snapshot — this is
  // what caused "missing block/rasta labels" and clipped gate labels ("Ga").
  const zoomLodTier = mapZoomLevel >= HIGH_ZOOM ? 'high' : mapZoomLevel >= MEDIUM_ZOOM ? 'medium' : 'low';
  const mapLabelVisualSignature = `${v2MapLayers.activeMapFilter}|${selectedPlace?.id ?? ''}|${zoomLodTier}`;
  const prevMapLabelVisualSignatureRef = useRef(mapLabelVisualSignature);
  useEffect(() => {
    if (prevMapLabelVisualSignatureRef.current === mapLabelVisualSignature) return;
    prevMapLabelVisualSignatureRef.current = mapLabelVisualSignature;
    setMapLabelsTransitioning(true);
    const timeout = setTimeout(() => setMapLabelsTransitioning(false), 400);
    return () => clearTimeout(timeout);
  }, [mapLabelVisualSignature]);

  // The change-detection effect above only opens a window when the signature
  // changes after mount — labels already present at first paint (e.g. app opens
  // already zoomed past MEDIUM_ZOOM) need the same one-time snapshot window, or
  // they mount directly with tracksViewChanges=false and can freeze blank/clipped.
  useEffect(() => {
    setMapLabelsTransitioning(true);
    const timeout = setTimeout(() => setMapLabelsTransitioning(false), 400);
    return () => clearTimeout(timeout);
  }, []);

  const recenterResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleRecenterPress = useCallback(async () => {
    if (recenterState === 'loading') return;
    if (recenterResetTimerRef.current) clearTimeout(recenterResetTimerRef.current);
    logHomeControl('recenter', 'resolve_location_and_center');
    setRecenterState('loading');
    const ok = await handleRecenter();
    setRecenterState(ok ? 'success' : 'failure');
    recenterResetTimerRef.current = setTimeout(() => setRecenterState('idle'), 1200);
  }, [handleRecenter, logHomeControl, recenterState]);
  useEffect(() => () => {
    if (recenterResetTimerRef.current) clearTimeout(recenterResetTimerRef.current);
  }, []);

  const handleToggleFav = () => {
    if (!selectedPlace) return;
    FavoriteService.toggleFavorite(selectedPlace);
  };

  const handleOpenDirections = (place: Place) => {
    const destination =
      place.sourceVersion === 'v2'
        ? place
        : place.category === 'Block' && entryPoints[selectedEntryIdx]
        ? RoutePointService.enrichPlaceWithRoutingNode(place, entryPoints[selectedEntryIdx].nodeId)
        : place;
    setDirectionsDestination(destination);
    bottomSheetRef.current?.snapToIndex(1);
  };

  const handleCloseDirections = useCallback(() => {
    setDirectionsDestination(null);
  }, []);

  const handleStartPreviewNavigation = useCallback(() => {
    if (!activePreviewRoute || !previewDestination) return;
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
    startNavigation(previewDestination, resolvedRoute, resolvedRoute.instructions);
  }, [activePreviewRoute, currentLocation, previewDestination, routePlannerOrigin, startNavigation]);

  const handleChangePreviewStart = useCallback(() => {
    if (!previewDestination) return;
    setSelectedPlace(previewDestination);
    setDirectionsDestination(previewDestination);
    bottomSheetRef.current?.snapToIndex(1);
  }, [bottomSheetRef, previewDestination, setSelectedPlace]);

  const handleClearPreviewRoute = useCallback(() => {
    Alert.alert('Cancel route?', 'You will need to choose your destination again.', [
      { text: 'Keep route', style: 'cancel' },
      { text: 'Cancel route', style: 'destructive', onPress: () => clearRoutePlanner() },
    ]);
  }, [clearRoutePlanner]);

  const handleSearchResultSelect = (place: Place) => {
    dismissSearch();
    handlePlaceSelect(place);
  };

  const openLayerOptions = () => setLayersSheetVisible(true);

  const handleMapTypeChange = (nextMapType: 'standard' | 'satellite') => {
    if (nextMapType === 'satellite' && isOffline) {
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
              handleCategoryPress(cat.id);
            }}
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
            ref={mapRef}
            style={styles.map}
            provider={Platform.OS === 'android' && hasGoogleMapsKey ? PROVIDER_GOOGLE : undefined}
            initialRegion={effectiveInitialRegion}
            mapType={hasGoogleMapsKey ? (isOffline ? 'none' : mapType) : 'none'}
            showsUserLocation={false}
            showsMyLocationButton={false}
            showsCompass={false}
            scrollEnabled={mode !== 'MAP_SETTINGS'}
            zoomEnabled={mode !== 'MAP_SETTINGS'}
            rotateEnabled={mode !== 'MAP_SETTINGS' && !settings.keepNorthFixed}
            onMapReady={() => {
              setIsMapReady(true);
              setMapReadyState(true);
              setMapLoadFailed(false);
              handleMapRegionChangeComplete(effectiveInitialRegion);
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
              setMapLoadFailed(false);
            }}
            onRegionChangeComplete={(region) => {
              setIsMapDragging(false);
              handleMapRegionChangeComplete(region);
            }}
            onPanDrag={() => {
              navOverlay.setIsAutoFollowing(false);
              setIsMapDragging(true);
            }}
            onPress={() => {
              if (isSearchFocused) {
                dismissSearch();
                clearSearch();
                return;
              }
              if (selectedPlace) {
                setSelectedPlace(null);
                bottomSheetRef.current?.close();
              }
            }}
          >
          {isOffline && offlineData.isDownloaded && (
            <LocalTile pathTemplate={getTilePath()} tileSize={256} zIndex={-1} />
          )}

          {mapType === 'satellite' && hasGoogleMapsKey && !isOffline && <SatelliteDimOverlay bounds={SATELLITE_DIM_BOUNDARY} />}

          <VenueBoundary coordinates={useV2Map ? v2MapLayers.venueBoundary : VENUE_BOUNDARY} />

          {mode === 'ACTIVE_NAVIGATION' && <NavigationMapLayersV2 overlay={navOverlay} />}

          {mode !== 'ACTIVE_NAVIGATION' && (useV2Map ? (
            <React.Fragment key={`v2_layers_${v2MapLayers.activeMapFilter}`}>
              <RastaLayer
                rastas={previewVisibleRastas}
                labels={previewVisibleRastaLabels}
                variant="home"
                focused={v2MapLayers.activeMapFilter === 'rastas'}
                transitioning={mapLabelsTransitioning}
                keyPrefix="v2_rasta"
              />

              <SpecialRouteLayer
                routes={previewVisibleSpecialRoutes}
                labels={previewVisibleSpecialRouteLabels}
                variant="home"
                focused={v2MapLayers.activeMapFilter === 'special_routes'}
                transitioning={mapLabelsTransitioning}
                keyPrefix="v2_special"
              />

              <BlockLayer
                blocks={showBlockPolygons ? previewVisibleBlocks : []}
                labels={previewVisibleBlockLabels}
                variant="home"
                focused={v2MapLayers.activeMapFilter === 'blocks'}
                transitioning={mapLabelsTransitioning}
                keyPrefix="v2_block"
                onPressBlock={(blockId) => {
                  const place = V2PlaceAdapter.getPlaceById(blockId);
                  if (!place) return;
                  dismissSearch();
                  handlePlaceSelect(place);
                }}
              />

              <GateLayer
                gates={previewVisibleGateMarkers}
                variant="home"
                focused={v2MapLayers.activeMapFilter === 'gates'}
                zoomLevel={mapZoomLevel}
                transitioning={mapLabelsTransitioning}
                keyPrefix="v2_gate"
                onPressGate={(gateId) => {
                  const place = V2PlaceAdapter.getPlaceById(gateId);
                  if (!place) return;
                  dismissSearch();
                  handlePlaceSelect(place);
                }}
              />

              {activePreviewRoute && activePreviewRoute.coordinates.length > 1 && (
                <>
                  {/* White outline underneath for contrast */}
                  <Polyline
                    coordinates={activePreviewRoute.coordinates}
                    strokeColor="rgba(255,255,255,0.95)"
                    strokeWidth={11}
                    zIndex={14}
                  />
                  {previewOutsideLegCoordinates.length > 1 && (
                    <Polyline
                      coordinates={previewOutsideLegCoordinates}
                      strokeColor="#E67C00"
                      strokeWidth={5}
                      lineDashPattern={[8, 6]}
                      zIndex={15}
                    />
                  )}
                  {/* Blue route line on top */}
                  <Polyline
                    coordinates={previewInsideLegCoordinates}
                    strokeColor="#1A73E8"
                    strokeWidth={6}
                    zIndex={16}
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

          {mode !== 'ACTIVE_NAVIGATION' && !useV2Map && showBlockPolygons && Object.entries(IJTEMA_DATA.blocks).map(([id, block]) => {
            const isSelected = selectedPlace?.id === id;
            return block.corners ? (
              <Polygon
                key={id}
                coordinates={block.corners}
                fillColor={isSelected ? 'rgba(26, 115, 232, 0.35)' : 'rgba(46, 125, 50, 0.15)'}
                strokeColor={isSelected ? '#1A73E8' : '#2E7D32'}
                strokeWidth={isSelected ? 3 : 1.5}
                tappable
                onPress={() => {
                  dismissSearch();
                  handlePlaceSelect({
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

          {mode !== 'ACTIVE_NAVIGATION' && !useV2Map && showGraphNodes && __DEV__ && developerModeEnabled && Object.entries(IJTEMA_DATA.nodes).map(([nodeId, node]) => {
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

          {mode !== 'ACTIVE_NAVIGATION' && !useV2Map && showRastaNames && __DEV__ && developerModeEnabled && Array.from(new Map(
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

          {mode !== 'ACTIVE_NAVIGATION' && overlayPlaces.map((item) => {
            const overlayItem = item as Place | SearchResult;
            const coordinate = overlayItem.coordinate;
            const label = getDisplayName(overlayItem);
            return (
              <Marker
                key={`search_overlay_${overlayItem.id}`}
                coordinate={coordinate}
                anchor={{ x: 0.5, y: 1 }}
                tracksViewChanges={false}
                onPress={() => {
                  if (isPlace(overlayItem)) handlePlaceSelect(overlayItem);
                }}
              >
                <View style={styles.searchOverlayMarker}>
                  <MapPin size={18} color="#FFFFFF" fill="#1A73E8" />
                  <Text style={styles.searchOverlayText} numberOfLines={1}>{label}</Text>
                </View>
              </Marker>
            );
          })}

          {/* Selected place pin — hidden during route preview to avoid duplicate destination marker */}
          {mode !== 'ACTIVE_NAVIGATION' && selectedPlace && selectedPlaceMarkerCoordinate && !activePreviewRoute && (
            <Marker coordinate={selectedPlaceMarkerCoordinate} tracksViewChanges={false}>
              <View style={styles.selectedMarker}>
                <MapPin size={32} color="#EA4335" fill="#EA4335" />
              </View>
            </Marker>
          )}

          {/* Route preview destination pin — shown when route is active */}
          {previewDestinationCoordinate && activePreviewRoute && (
            <Marker coordinate={previewDestinationCoordinate} tracksViewChanges={false}>
              <View style={styles.selectedMarker}>
                <MapPin size={30} color="#EA4335" fill="#EA4335" />
              </View>
            </Marker>
          )}

          {mode !== 'ACTIVE_NAVIGATION' && currentLocation && (
            <Marker coordinate={currentLocation} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false}>
              <View style={styles.userMarkerWrap}>
                <Animated.View
                  style={[
                    styles.userMarkerPulse,
                    {
                      opacity: userPulseAnim.interpolate({ inputRange: [0, 1], outputRange: [0.38, 0] }),
                      transform: [{ scale: userPulseAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 2.3] }) }],
                    },
                  ]}
                />
                <View style={styles.userMarker}>
                  <Navigation size={12} color="#FFFFFF" />
                </View>
                {currentLocationSource === 'remembered' && (
                  <View style={styles.rememberedLabel}>
                    <Text style={styles.rememberedLabelText}>last known</Text>
                  </View>
                )}
              </View>
            </Marker>
          )}

          {showPreviewStartMarker && previewStartCoordinate && (
            <Marker coordinate={previewStartCoordinate} anchor={{ x: 0.5, y: 1 }} tracksViewChanges={false}>
              <View style={styles.previewStartMarker}>
                <Navigation size={13} color="#FFFFFF" />
              </View>
            </Marker>
          )}
          </MapView>

        {mode === 'ACTIVE_NAVIGATION' && <NavigationChromeV2 overlay={navOverlay} hasGoogleMapsKey={hasGoogleMapsKey} />}

        {mode !== 'ACTIVE_NAVIGATION' && mode !== 'DIRECTIONS_FORM' && (
        <SafeAreaView
          style={styles.topOverlay}
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
                  outputRange: ['rgba(218,220,224,0)', '#1A73E8'],
                }),
                transform: [{ scale: searchFocusAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.01] }) }],
              },
            ]}
          >
            <Pressable
              onPress={() => {
                dismissSearch();
                logHomeControl('menu', 'open_drawer');
                nav.dispatch(DrawerActions.openDrawer());
              }}
              style={styles.iconButton}
              accessibilityRole="button"
              accessibilityLabel="Open menu"
            >
              <Menu size={24} color={theme.subtext} />
            </Pressable>
            <TextInput
              ref={searchInputRef}
              style={[styles.searchInput, { color: theme.text }]}
              placeholder={searchPlaceholder}
              placeholderTextColor={theme.placeholder}
              value={searchQuery}
              onChangeText={handleSearch}
              onFocus={() => setIsSearchFocused(true)}
              returnKeyType="search"
              onSubmitEditing={Keyboard.dismiss}
              multiline={false}
              numberOfLines={1}
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
                <X size={20} color="#5F6368" />
              </Pressable>
            ) : (
              <View style={styles.iconButtonSpacer} />
            )}
          </Animated.View>

          {isSearchFocused && (searchResults.length > 0 || (searchQuery.length === 0 && recentSearches.length > 0)) && (
            <View style={[styles.searchResultsContainer, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <ScrollView keyboardShouldPersistTaps="handled">
                {searchQuery.length === 0 && (
                  <Text style={styles.sectionTitle}>Recent</Text>
                )}
                {(searchQuery.length > 0 ? searchResults : recentSearches).map((item) => (
                  <Pressable
                    key={(item as any).id}
                    testID={`search-result-${(item as any).id}`}
                    style={styles.searchResultItem}
                    onPress={() => handleSearchResultSelect(item as any)}
                  >
                    <View style={styles.searchResultIcon}>
                      {searchQuery.length === 0 ? (
                        <Clock size={18} color="#70757A" />
                      ) : (
                        <MapPin size={18} color="#70757A" />
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
                    <ChevronRight size={18} color="#BDC1C6" />
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          )}

          {!isSearchFocused && (
            <Animated.View style={{ opacity: chipsAnim }} pointerEvents={isMapDragging ? 'none' : 'box-none'}>
              {renderChips()}
            </Animated.View>
          )}
        </SafeAreaView>
        )}

        {mode !== 'ACTIVE_NAVIGATION' && (isOffline || showMapWarningBanner || showOutsideBanner) && (
          <View
            style={[styles.bannerStack, { top: bannerStackTop }]}
            onLayout={(e) => setBannerStackHeight(e.nativeEvent.layout.height)}
          >
            {isOffline && (
              <View style={[styles.offlineIndicator, styles.bannerStackItem]}>
                <WifiOff size={14} color="#FFFFFF" />
                <Text style={styles.offlineText}>Offline</Text>
              </View>
            )}

            {!hasGoogleMapsKey && (
              <View style={[styles.mapWarningBanner, styles.bannerStackItem]}>
                <Text style={styles.mapWarningText}>{MapConfigService.getMissingGoogleMapsMessage()}</Text>
              </View>
            )}

            {hasGoogleMapsKey && mapLoadFailed && (
              <View style={[styles.mapWarningBanner, styles.bannerStackItem]}>
                <Text style={styles.mapWarningText}>{MapConfigService.getMapLoadFailedMessage()}</Text>
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
                <View style={styles.outsideVenueTextWrap}>
                  <Text style={styles.outsideVenueText} numberOfLines={1} ellipsizeMode="tail">
                    {nearestEntryGate ? `Outside Ijtema · Enter through ${nearestEntryGate.name.en}` : 'Outside Ijtema · Nearest gate unavailable'}
                  </Text>
                </View>
                <Pressable
                  style={styles.bannerCloseButton}
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

        {mode !== 'ACTIVE_NAVIGATION' && __DEV__ && developerModeEnabled && showRouteDiagnostics && (
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

        {mode !== 'ACTIVE_NAVIGATION' && isOffline && !offlineData.isDownloaded && (
          <View style={styles.emptyOfflineState}>
            <Text style={styles.emptyOfflineTitle}>Background map not downloaded. Ijtema routes still work.</Text>
            <Pressable style={styles.emptyOfflineButton} onPress={() => nav.navigate('DownloadMap')}>
              <Text style={styles.emptyOfflineButtonText}>Download background map</Text>
            </Pressable>
          </View>
        )}

        {mode !== 'ACTIVE_NAVIGATION' && !isSearchFocused && (
          <>
            <View
              style={[
                styles.rightControls,
                { top: rightControlsTop },
              ]}
            >
              <MapControls
                variant="browse"
                keepNorthFixed={settings.keepNorthFixed}
                onLayers={() => {
                  logHomeControl('layer', 'open_options');
                  openLayerOptions();
                }}
                onCompassReset={() => {
                  logHomeControl('compass', 'reset_north_up');
                  handleCompassReset();
                }}
                onZoomIn={() => {
                  logHomeControl('zoom_in', 'map_zoom_in');
                  handleZoomIn();
                }}
                onZoomOut={() => {
                  logHomeControl('zoom_out', 'map_zoom_out');
                  handleZoomOut();
                }}
              />
            </View>

            <View style={[styles.bottomControls, { bottom: rightControlsBottom + 80 }]}>
              <Pressable
                style={styles.recenterButton}
                disabled={recenterState === 'loading'}
                onPress={() => void handleRecenterPress()}
                accessibilityRole="button"
                accessibilityLabel={
                  recenterState === 'loading'
                    ? 'Finding your location'
                    : recenterState === 'success'
                    ? 'Location found. Centered on your position.'
                    : recenterState === 'failure'
                    ? 'Could not find your location. Tap to try again.'
                    : 'Center map on my location'
                }
                accessibilityLiveRegion="polite"
              >
                {recenterState === 'loading' ? (
                  <ActivityIndicator size="small" color="#4285F4" />
                ) : recenterState === 'success' ? (
                  <Check size={24} color="#2E7D32" />
                ) : recenterState === 'failure' ? (
                  <AlertTriangle size={22} color="#EA4335" />
                ) : (
                  <LocateFixed size={24} color="#4285F4" />
                )}
              </Pressable>
            </View>

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

        {mode === 'ACTIVE_NAVIGATION' && (
          <View
            style={[
              styles.navControls,
              // Stacks above the recenter button, which itself stacks above the measured
              // trip-info bar (navOverlay.bottomBarHeight) — no more guessed 140px bar height.
              { bottom: (navOverlay.bottomBarHeight || Math.max(insets.bottom, 12) + 140) + 12 + 56 + 16 },
            ]}
          >
            <MapControls
              variant="nav"
              keepNorthFixed={settings.keepNorthFixed}
              onCompassReset={() => {
                logHomeControl('nav_compass', 'reset_north_up');
                handleCompassReset();
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

        {mode === 'ROUTE_PREVIEW' && !isSearchFocused && activePreviewRoute && previewDestination && (
          <View
            style={[styles.routePreviewCard, { bottom: Math.max(insets.bottom, 16) + 16 }]}
            onLayout={(e) => setRoutePreviewCardMeasuredHeight(e.nativeEvent.layout.height)}
          >
            <View style={styles.routePreviewCardHeader}>
              <View style={styles.routePreviewTitleWrap}>
                <Text style={styles.routePreviewEyebrow}>Route to</Text>
                <Text style={styles.routePreviewTitle} numberOfLines={1}>{previewDestination.name}</Text>
              </View>
              <View style={styles.routePreviewMetricPill}>
                <Clock size={14} color="#1A73E8" />
                <Text style={styles.routePreviewMetricText}>
                  {InstructionService.formatDuration(activePreviewRoute.estimatedTimeMin)}
                </Text>
              </View>
            </View>
            <Text style={styles.routePreviewDistance}>
              {InstructionService.formatDistance(activePreviewRoute.totalDistance, settings.distanceUnit)}
            </Text>
            {previewRecommendedGate && (
              <View style={styles.routePreviewGateBadge}>
                <MapPin size={14} color="#1B5E20" />
                <Text style={styles.routePreviewGateBadgeText}>Enter through {previewRecommendedGate}</Text>
              </View>
            )}
            <Text style={styles.routePreviewSummary} numberOfLines={2}>
              {previewRouteSummary}
            </Text>
            <Pressable
              style={styles.routePreviewPrimaryButton}
              onPress={handleStartPreviewNavigation}
              accessibilityRole="button"
              accessibilityLabel={`Start walking to ${previewDestination.name}`}
            >
              <Navigation size={16} color="#FFFFFF" />
              <Text style={styles.routePreviewPrimaryText}>Start Navigation</Text>
            </Pressable>
            <View style={styles.routePreviewActions}>
              <Pressable
                style={styles.routePreviewSecondaryButton}
                onPress={handleChangePreviewStart}
                accessibilityRole="button"
                accessibilityLabel="Change starting point"
              >
                <Text style={styles.routePreviewSecondaryText}>Change Start</Text>
              </Pressable>
              <Pressable
                style={styles.routePreviewCancelButton}
                onPress={handleClearPreviewRoute}
                accessibilityRole="button"
                accessibilityLabel="Cancel route"
              >
                <Text style={styles.routePreviewCancelText}>Cancel Route</Text>
              </Pressable>
            </View>
          </View>
        )}

        <BottomSheetModal
          ref={bottomSheetRef}
          index={-1}
          snapPoints={snapPoints}
          enablePanDownToClose
          keyboardBehavior="interactive"
          keyboardBlurBehavior="restore"
          android_keyboardInputMode="adjustResize"
          handleIndicatorStyle={[styles.sheetIndicator, { backgroundColor: theme.border }]}
          backgroundStyle={{ backgroundColor: theme.card }}
        >
          {directionsDestination ? (
            <DirectionsScreen destination={directionsDestination} onClose={handleCloseDirections} />
          ) : (
          <BottomSheetScrollView contentContainerStyle={styles.sheetContent}>
            {selectedPlace ? (
              <View>
                <View style={styles.placeHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.placeName, { color: theme.text }]}>{selectedPlace.name}</Text>
                    {selectedPlace.urduName && (
                      <Text style={[styles.placeUrdu, { color: theme.primary }]}>{selectedPlace.urduName}</Text>
                    )}
                    <Text style={[styles.placeCategory, { color: theme.subtext }]}>{selectedPlace.category}</Text>
                    {selectedPlace.sourceVersion !== 'v2' && selectedPlace.category === 'Block' && (IJTEMA_DATA.blocks as any)[selectedPlace.id]?.role && (
                      <Text style={styles.placeRole}>{(IJTEMA_DATA.blocks as any)[selectedPlace.id].role}</Text>
                    )}
                  </View>
                  <Pressable onPress={() => { setSelectedPlace(null); bottomSheetRef.current?.close(); }}>
                    <X size={24} color="#5F6368" />
                  </Pressable>
                </View>

                {(selectedPlace.verificationWarning || selectedPlace.unavailableReason) && (
                  <View style={styles.placeWarningBanner}>
                    <Text style={styles.placeWarningBannerText}>
                      {selectedPlace.verificationWarning ?? selectedPlace.unavailableReason}
                    </Text>
                  </View>
                )}

                <View style={styles.infoChips}>
                  {walkingTimeMin !== null && (
                    <View style={styles.infoChip}>
                      <Clock size={14} color="#2E7D32" />
                      <Text style={styles.infoChipText}>{walkingTimeMin} min walk</Text>
                    </View>
                  )}
                  {entryPoints.length > 0 && (
                    <View style={styles.infoChip}>
                      <MapPin size={14} color="#2E7D32" />
                      <Text style={styles.infoChipText}>{entryPoints.length} entrances</Text>
                    </View>
                  )}
                </View>

                {entryPoints.length > 0 && (
                  <View style={styles.entranceSection}>
                    <Text style={styles.sectionLabel}>Entrances</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                      {entryPoints.map((ep, idx) => (
                        <Pressable
                          key={ep.nodeId}
                          style={[
                            styles.entranceChip,
                            selectedEntryIdx === idx && styles.entranceChipActive,
                          ]}
                          onPress={() => setSelectedEntryIdx(idx)}
                        >
                          <Text
                            style={[
                              styles.entranceNodeText,
                              selectedEntryIdx === idx && styles.entranceChipTextActive,
                            ]}
                          >
                            Entrance {idx + 1}
                          </Text>
                          <Text
                            style={[
                              styles.entranceChipText,
                              selectedEntryIdx === idx && styles.entranceChipTextActive,
                            ]}
                          >
                            {ep.friendlyName}
                          </Text>
                          <Text style={styles.entranceUrdu}>{ep.urduName}</Text>
                        </Pressable>
                      ))}
                    </ScrollView>
                  </View>
                )}

                {blockGates.length > 0 && (
                  <View style={styles.entranceSection}>
                    <Text style={styles.sectionLabel}>Member Masjid Gates</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                      {blockGates.map((gate) => (
                        <Pressable
                          key={gate.id}
                          style={styles.gateChip}
                          onPress={() => {
                            handlePlaceSelect({
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
                        >
                          {__DEV__ && developerModeEnabled && <Text style={styles.entranceNodeText}>{gate.id}</Text>}
                          <Text style={styles.entranceChipText}>{gate.name.replace('Member Masjid Gate ', 'Gate ')}</Text>
                          {gate.urduName && <Text style={styles.entranceUrdu}>{gate.urduName}</Text>}
                        </Pressable>
                      ))}
                    </ScrollView>
                  </View>
                )}

                <Pressable style={styles.takeMeButton} onPress={() => selectedPlace && handleOpenDirections(selectedPlace)}>
                  <Navigation size={22} color="#FFFFFF" />
                  <Text style={styles.takeMeText}>Directions</Text>
                </Pressable>

                <View style={styles.secondaryActions}>
                  <Pressable style={styles.secondaryAction} onPress={handleToggleFav}>
                    <Star
                      size={20}
                      color={isFav ? '#FBC02D' : '#1A73E8'}
                      fill={isFav ? '#FBC02D' : 'none'}
                    />
                    <Text style={styles.secondaryActionText}>{isFav ? 'Saved' : 'Save'}</Text>
                  </Pressable>
                  <Pressable
                    style={styles.secondaryAction}
                    onPress={() => {
                      if (!selectedPlace) return;
                      if (!selectedPlace.coordinate) {
                        Alert.alert('Place unavailable', selectedPlace.unavailableReason ?? `${selectedPlace.name} is not available on the map yet.`);
                        return;
                      }
                      const { latitude, longitude } = selectedPlace.coordinate;
                      Share.share({
                        title: selectedPlace.name,
                        message: `${selectedPlace.name} — Karachi Ijtema\nLocation: ${latitude.toFixed(6)}, ${longitude.toFixed(6)}`,
                      }).catch(() => Alert.alert('Unable to share', 'Could not open the share dialog.'));
                    }}
                  >
                    <Share2 size={20} color="#1A73E8" />
                    <Text style={styles.secondaryActionText}>Share</Text>
                  </Pressable>
                  <Pressable
                    style={styles.secondaryAction}
                    onPress={() => Alert.alert('Place Details', selectedPlace.description)}
                  >
                    <Info size={20} color="#1A73E8" />
                    <Text style={styles.secondaryActionText}>Details</Text>
                  </Pressable>
                </View>

                {selectedPlace.description && (
                  <Text style={styles.placeDesc}>{selectedPlace.description}</Text>
                )}
              </View>
            ) : (
              <View style={styles.emptySheet}>
                <Text style={styles.emptySheetText}>Tap a block or search to see details</Text>
              </View>
            )}
          </BottomSheetScrollView>
          )}
        </BottomSheetModal>

        {/* visible stays keyed to layersSheetVisible (the state that feeds mode), not
            `mode === 'MAP_SETTINGS'` — that would be circular, same reasoning as
            NavigationChromeV2 self-gating on `route` below. Map gesture props above are
            the actual interaction lock; the sheet is a Modal so touches can't reach the
            map underneath either way (see zLayers.ts). */}
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
  mapFallback: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E8EAED',
    paddingHorizontal: 24,
  },
  mapFallbackTitle: {
    color: '#202124',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 8,
  },
  mapFallbackText: {
    color: '#5F6368',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
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
  searchBarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    marginHorizontal: 12,
    marginTop: 8,
    borderRadius: 24,
    paddingHorizontal: 8,
    height: 52,
    borderWidth: 1,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  iconButton: { padding: 14 },
  iconButtonSpacer: { width: 48, height: 48 },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#202124',
    paddingHorizontal: 4,
    height: 52,
    // Prevent multiline overflow that causes "..." artifacts below placeholder
    textAlignVertical: 'center',
  },
  searchResultsContainer: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 12,
    marginTop: 4,
    borderRadius: 16,
    maxHeight: 380,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    overflow: 'hidden',
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
  rightControls: { position: 'absolute', right: 12, zIndex: Z.mapControls },
  navControls: { position: 'absolute', right: 16, zIndex: Z.mapControls },
  bottomControls: { position: 'absolute', right: 12, zIndex: Z.mapControls },
  recenterButton: {
    backgroundColor: '#FFFFFF',
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 6,
  },
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
    alignItems: 'center',
    minHeight: 40,
    elevation: 3,
  },
  outsideVenueTextWrap: { flex: 1 },
  outsideVenueText: { color: '#FFFFFF', fontSize: 13, fontWeight: '600' },
  bannerCloseButton: { padding: 6, marginLeft: 4 },
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
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#1A73E8',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  userMarkerWrap: {
    width: 76,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  userMarkerPulse: {
    position: 'absolute',
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#1A73E8',
  },
  userMarker: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#1A73E8',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  rememberedLabel: {
    marginTop: 2,
    backgroundColor: 'rgba(26,115,232,0.92)',
    borderRadius: 7,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  rememberedLabelText: { color: '#FFFFFF', fontSize: 9, fontWeight: '700' },
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
  sheetIndicator: { backgroundColor: '#DADCE0', width: 36 },
  sheetContent: { padding: 20 },
  placeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  placeName: { fontSize: 24, fontWeight: 'bold', color: '#202124' },
  placeUrdu: { fontSize: 18, color: '#2E7D32', marginTop: 2 },
  placeCategory: { fontSize: 14, color: '#70757A', marginTop: 4 },
  placeRole: { fontSize: 13, color: '#1A73E8', fontWeight: '700', marginTop: 4 },
  infoChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  infoChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 4,
  },
  infoChipText: { fontSize: 13, color: '#2E7D32', fontWeight: '500' },
  entranceSection: { marginBottom: 16 },
  sectionLabel: { fontSize: 13, fontWeight: '600', color: '#5F6368', marginBottom: 8 },
  entranceChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: '#F1F3F4',
    marginRight: 8,
    minWidth: 120,
  },
  gateChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: '#FFF5F5',
    borderWidth: 1,
    borderColor: '#EA4335',
    marginRight: 8,
    minWidth: 132,
  },
  entranceChipActive: { backgroundColor: '#E8F0FE', borderWidth: 1.5, borderColor: '#1A73E8' },
  entranceNodeText: { fontSize: 13, color: '#202124', fontWeight: '800', marginBottom: 2 },
  entranceChipText: { fontSize: 14, color: '#3C4043', fontWeight: '500' },
  entranceChipTextActive: { color: '#1A73E8' },
  entranceUrdu: { fontSize: 12, color: '#888', marginTop: 2 },
  takeMeButton: {
    backgroundColor: '#2E7D32',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
    borderRadius: 16,
    gap: 10,
    marginBottom: 20,
    elevation: 4,
    shadowColor: '#2E7D32',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
  },
  takeMeText: { color: '#FFFFFF', fontSize: 18, fontWeight: 'bold', letterSpacing: 0.3 },
  secondaryActions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 20,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#F1F3F4',
    paddingVertical: 12,
  },
  secondaryAction: { alignItems: 'center', gap: 4 },
  secondaryActionText: { fontSize: 12, color: '#1A73E8', fontWeight: '500' },
  placeDesc: { fontSize: 14, color: '#5F6368', lineHeight: 22 },
  placeWarningBanner: {
    backgroundColor: '#FFF3E0',
    borderWidth: 1,
    borderColor: '#E65100',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginTop: 4,
    marginBottom: 12,
  },
  placeWarningBannerText: { fontSize: 13, color: '#7C4A03', fontWeight: '600', lineHeight: 18 }, // #E65100 on #FFF3E0 fails AA (3.79:1); #7C4A03 passes (6.75:1)
  emptySheet: { alignItems: 'center', padding: 60 },
  emptySheetText: { color: '#70757A', fontSize: 15 },
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
  routePreviewCard: {
    position: 'absolute',
    left: 12,
    right: 84,
    backgroundColor: 'rgba(255,255,255,0.98)',
    borderRadius: 18,
    padding: 14,
    zIndex: Z.mapControls,
    borderWidth: 1,
    borderColor: '#D2E3FC',
    shadowColor: '#1A73E8',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.16,
    shadowRadius: 16,
    elevation: 6,
  },
  routePreviewCardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  routePreviewTitleWrap: {
    flex: 1,
  },
  routePreviewEyebrow: {
    fontSize: 11,
    fontWeight: '800',
    color: '#1A73E8',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  routePreviewTitle: {
    marginTop: 3,
    fontSize: 17,
    fontWeight: '800',
    color: '#202124',
  },
  routePreviewMetricPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#E8F0FE',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  routePreviewMetricText: {
    color: '#1A73E8',
    fontSize: 12,
    fontWeight: '800',
  },
  routePreviewDistance: {
    marginTop: 6,
    color: '#5F6368',
    fontSize: 12,
    fontWeight: '700',
  },
  routePreviewSummary: {
    marginTop: 6,
    color: '#202124',
    fontSize: 13,
    lineHeight: 18,
  },
  routePreviewGateBadge: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    backgroundColor: 'rgba(46,125,50,0.12)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  routePreviewGateBadgeText: {
    color: '#1B5E20',
    fontSize: 13,
    fontWeight: '700',
  },
  routePreviewPrimaryButton: {
    marginTop: 12,
    minHeight: 56,
    backgroundColor: '#1A73E8',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  routePreviewPrimaryText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  routePreviewActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  routePreviewSecondaryButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#DADCE0',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  routePreviewSecondaryText: {
    color: '#3C4043',
    fontSize: 13,
    fontWeight: '700',
  },
  routePreviewCancelButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  routePreviewCancelText: {
    color: '#5F6368',
    fontSize: 13,
    fontWeight: '600',
    textDecorationLine: 'underline',
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

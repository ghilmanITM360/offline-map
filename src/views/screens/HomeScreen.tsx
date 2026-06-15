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
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import MapView, { Marker, Polygon, Polyline, PROVIDER_GOOGLE, LocalTile } from 'react-native-maps';
import {
  Menu,
  Navigation,
  LocateFixed,
  Plus,
  Minus,
  Compass,
  Layers,
  Star,
  MapPin,
  ChevronRight,
  WifiOff,
  X,
  Clock,
  Share2,
  Info,
} from 'lucide-react-native';
import BottomSheet, { BottomSheetScrollView } from '@gorhom/bottom-sheet';
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
import { V2MapRenderingService } from '../../services/V2MapRenderingService';
import { V2NavigationAdapter } from '../../services/V2NavigationAdapter';
import { V2PlaceAdapter } from '../../services/V2PlaceAdapter';
import { IJTEMA_MAP_REGION } from '../../data/ijtema';

declare const __DEV__: boolean;

type HomeScreenNavigationProp = CompositeNavigationProp<
  DrawerNavigationProp<DrawerParamList, 'Home'>,
  NativeStackNavigationProp<RootStackParamList>
>;

const getTilePath = (): string => `${Paths.document.uri}tiles/{z}_{x}_{y}.png`;

function isPlace(item: Place | SearchResult): item is Place {
  return 'name' in item;
}

function getDisplayName(item: Place | SearchResult): string {
  return isPlace(item) ? item.name : item.title;
}

type V2PreviewRoute = RoutePreview & {
  startLabel: string;
  destinationLabel: string;
  startResolution?: {
    mode: 'inside' | 'outside';
    coordinate: { latitude: number; longitude: number };
    gate?: { id: string; name: { en: string } };
  };
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
  const showRouteDiagnostics = useAppStore((s) => s.showRouteDiagnostics);
  const setShowRouteDiagnostics = useAppStore((s) => s.setShowRouteDiagnostics);
  const developerModeEnabled = useAppStore((s) => s.developerModeEnabled);
  const startNavigation = useAppStore((s) => s.startNavigation);
  const [selectedEntryIdx, setSelectedEntryIdx] = useState(0);
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const searchInputRef = useRef<TextInput>(null);
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const mapRuntimeStatus = MapConfigService.getRuntimeStatus();
  const hasGoogleMapsKey = mapRuntimeStatus.keyPresent;
  const useV2Map = MapFeatureFlagsService.useIjtemaV2Map();
  const graphOnlyFallbackUsed = !hasGoogleMapsKey;
  const [outsideBannerDismissed, setOutsideBannerDismissed] = useState(false);
  const [mapReady, setMapReadyState] = useState(false);
  const [mapLoadFailed, setMapLoadFailed] = useState(false);
  const searchFocusAnim = useRef(new Animated.Value(0)).current;
  const warningAnim = useRef(new Animated.Value(0)).current;
  const userPulseAnim = useRef(new Animated.Value(0)).current;

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

  const entryPoints = selectedPlace?.category === 'Block' && selectedPlace.sourceVersion !== 'v2'
    ? PlaceDetailService.getEntryPoints(selectedPlace.id)
    : [];
  const blockGates = selectedPlace?.category === 'Block' && selectedPlace.sourceVersion !== 'v2'
    ? PlaceDetailService.getBlockGates(selectedPlace.id)
    : [];

  const selectedPlaceMarkerCoordinate = (() => {
    if (!selectedPlace) return null;
    if (selectedPlace.sourceVersion === 'v2') {
      return V2PlaceAdapter.getMarkerCoordinate(selectedPlace);
    }
    if (selectedPlace.category === 'Block' && entryPoints[selectedEntryIdx]) {
      return RoutePointService.nodeToCoordinate(entryPoints[selectedEntryIdx].nodeId) ?? selectedPlace.coordinate;
    }
    return RoutePointService.getDestinationCoordinate(selectedPlace);
  })();
  const venueBoundary = [
    { latitude: MAP_BOUNDS.minLat, longitude: MAP_BOUNDS.minLng },
    { latitude: MAP_BOUNDS.minLat, longitude: MAP_BOUNDS.maxLng },
    { latitude: MAP_BOUNDS.maxLat, longitude: MAP_BOUNDS.maxLng },
    { latitude: MAP_BOUNDS.maxLat, longitude: MAP_BOUNDS.minLng },
  ];
  const overlayPlaces = (isSearchFocused || searchQuery.length > 1)
    ? searchResults.filter((item) => (item as any).coordinate && (item as any).id !== selectedPlace?.id)
    : [];
  const activePreviewRoute = useMemo(() => {
    if (isNavigating) return null;
    if (!routePlannerDest || routePlannerDest.sourceVersion !== 'v2') return null;
    return isV2PreviewRoute(activeRoute) ? activeRoute : null;
  }, [activeRoute, isNavigating, routePlannerDest]);
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
      return gateLabel
        ? `Outside Ijtema. Enter through ${gateLabel}.`
        : 'Outside Ijtema. Enter through nearest connected official gate.';
    }
    if (routePlannerOrigin) return `Start from ${routePlannerOrigin.name}.`;
    return currentLocationSource === 'remembered' ? 'Start from last known location.' : 'Start from current location.';
  }, [activePreviewRoute, currentLocationSource, routePlannerOrigin]);
  const v2MapLayers = useMemo(
    () => V2MapRenderingService.getHomeLayers({
      selectedPlaceId: selectedPlace?.id,
      selectedPlace,
      developerMode: __DEV__ && developerModeEnabled,
      graphOnlyFallback: graphOnlyFallbackUsed,
      zoomLevel: mapZoomLevel,
      mapFilter: activeCategory,
    }),
    [activeCategory, developerModeEnabled, graphOnlyFallbackUsed, mapZoomLevel, selectedPlace],
  );
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
  const showMapWarningBanner = !hasGoogleMapsKey || mapLoadFailed;
  const topInsetBase = Math.max(insets.top, Platform.OS === 'android' ? StatusBar.currentHeight ?? 0 : 0);
  const offlineTop = topInsetBase + 140;
  const mapWarningTop = offlineTop + (isOffline ? 42 : 0) + 8;
  const outsideBannerTop = mapWarningTop + (showMapWarningBanner ? 56 : 0) + 8;
  const rightControlsTop = outsideBannerTop + (showOutsideBanner ? 60 : 12);
  const routePreviewCardHeight = activePreviewRoute ? 184 : 0;
  const rightControlsBottom = Math.max(insets.bottom, 16) + routePreviewCardHeight + 16;

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
    if (!activePreviewRoute) return;
    bottomSheetRef.current?.close();
  }, [activePreviewRoute, bottomSheetRef]);

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
    nav.navigate('Directions', { destination });
  };

  const handleStartPreviewNavigation = useCallback(() => {
    if (!activePreviewRoute || !previewDestination) return;
    const resolvedRoute = V2NavigationAdapter.fromPreview({
      previewRoute: activePreviewRoute as any,
      destination: previewDestination,
      startPlace: routePlannerOrigin,
      currentLocation: routePlannerOrigin ? null : currentLocation,
    });
    startNavigation(previewDestination, resolvedRoute, resolvedRoute.instructions);
    nav.navigate('Navigation');
  }, [activePreviewRoute, currentLocation, nav, previewDestination, routePlannerOrigin, startNavigation]);

  const handleChangePreviewStart = useCallback(() => {
    if (!previewDestination) return;
    setSelectedPlace(previewDestination);
    nav.navigate('Directions', { destination: previewDestination });
  }, [nav, previewDestination, setSelectedPlace]);

  const handleClearPreviewRoute = useCallback(() => {
    clearRoutePlanner();
  }, [clearRoutePlanner]);

  const handleSearchResultSelect = (place: Place) => {
    dismissSearch();
    handlePlaceSelect(place);
  };

  const openLayerOptions = () => {
    const options: { text: string; onPress?: () => void; style?: 'default' | 'cancel' }[] = [
      {
        text: showBlockPolygons ? 'Hide Blocks Layer' : 'Show Blocks Layer',
        onPress: () => setShowBlockPolygons(!showBlockPolygons),
      },
      {
        text: mapType === 'standard' ? 'Switch to Satellite' : 'Switch to Standard',
        onPress: () => {
          if (mapType === 'standard') {
            if (isOffline) {
              Alert.alert('Satellite unavailable offline', 'Satellite requires internet or downloaded satellite tiles.');
              return;
            }
            updateSettings({ mapMode: 'satellite' });
            return;
          }
          updateSettings({ mapMode: 'standard' });
        },
      },
      ...(developerModeEnabled
        ? [
            {
              text: showRastaNames ? 'Hide Rasta Labels' : 'Show Rasta Labels',
              onPress: () => setShowRastaNames(!showRastaNames),
            },
          ]
        : []),
      { text: 'Cancel', style: 'cancel' },
    ];

    Alert.alert('Map Layers', 'Choose what to show on the map.', options);
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
            rotateEnabled={!settings.keepNorthFixed}
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
            onRegionChangeComplete={handleMapRegionChangeComplete}
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

          <Polygon
            coordinates={useV2Map ? v2MapLayers.venueBoundary : venueBoundary}
            fillColor="rgba(232,245,233,0.06)"
            strokeColor="rgba(46,125,50,0.48)"
            strokeWidth={2}
            zIndex={0}
          />

          {useV2Map ? (
            <>
              {v2MapLayers.rastas.map((rasta) => {
                const focused = v2MapLayers.activeMapFilter === 'rastas';
                return (
                  <React.Fragment key={`v2_rasta_${rasta.id}`}>
                    <Polyline
                      coordinates={rasta.polyline}
                      strokeColor={rasta.isSelected ? 'rgba(26,115,232,0.55)' : focused ? 'rgba(230,81,0,0.55)' : 'rgba(60,64,67,0.44)'}
                      strokeWidth={rasta.isSelected ? 11 : focused ? 12 : 7}
                      zIndex={rasta.isSelected ? 8 : focused ? 4 : 2}
                    />
                    <Polyline
                      coordinates={rasta.polyline}
                      strokeColor={rasta.isSelected ? '#1A73E8' : focused ? '#E65100' : 'rgba(255,255,255,0.9)'}
                      strokeWidth={rasta.isSelected ? 6 : focused ? 7 : 4}
                      zIndex={rasta.isSelected ? 9 : focused ? 5 : 3}
                    />
                  </React.Fragment>
                );
              })}

              {v2MapLayers.visibleRastaLabels.map((rasta) => {
                const focused = v2MapLayers.activeMapFilter === 'rastas';
                return (
                  <Marker key={`v2_rasta_label_${rasta.id}`} coordinate={rasta.labelCoordinate} anchor={{ x: 0.5, y: 0.5 }} zIndex={7} tracksViewChanges={false}>
                    <View style={[styles.rastaLabel, focused && styles.rastaLabelFocused, rasta.isSelected && styles.v2SelectedLabel]}>
                      <Text style={[styles.rastaLabelText, focused && styles.rastaLabelTextFocused]}>{rasta.label}</Text>
                    </View>
                  </Marker>
                );
              })}

              {v2MapLayers.specialRoutes.map((route) => {
                const focused = v2MapLayers.activeMapFilter === 'special_routes';
                return (
                  <React.Fragment key={`v2_special_${route.id}`}>
                    <Polyline
                      coordinates={route.polyline}
                      strokeColor={route.isSelected ? '#6A0DAD' : focused ? 'rgba(106,13,173,0.65)' : 'rgba(142,36,170,0.55)'}
                      strokeWidth={route.isSelected ? 7 : focused ? 8 : 3}
                      zIndex={route.isSelected ? 10 : focused ? 6 : 4}
                    />
                    {focused && (
                      <Polyline
                        coordinates={route.polyline}
                        strokeColor="rgba(255,255,255,0.55)"
                        strokeWidth={3}
                        zIndex={route.isSelected ? 11 : 7}
                      />
                    )}
                  </React.Fragment>
                );
              })}

              {v2MapLayers.visibleSpecialRouteLabels.map((route) => {
                const focused = v2MapLayers.activeMapFilter === 'special_routes';
                return (
                  <Marker key={`v2_special_label_${route.id}`} coordinate={route.labelCoordinate} anchor={{ x: 0.5, y: 0.5 }} zIndex={9} tracksViewChanges={false}>
                    <View style={[styles.v2RouteLabel, focused && styles.v2RouteLabelFocused, route.isSelected && styles.v2SelectedLabel]}>
                      <Text style={[styles.v2RouteLabelText, focused && styles.v2RouteLabelTextFocused]}>{route.label}</Text>
                    </View>
                  </Marker>
                );
              })}

              {showBlockPolygons && v2MapLayers.blocks.map((block) => {
                const focused = v2MapLayers.activeMapFilter === 'blocks';
                return (
                  <Polygon
                    key={`v2_block_${block.id}`}
                    coordinates={block.polygon}
                    fillColor={block.isSelected ? 'rgba(26,115,232,0.42)' : focused ? 'rgba(46,125,50,0.30)' : 'rgba(46,125,50,0.14)'}
                    strokeColor={block.isSelected ? '#1A73E8' : focused ? '#1B5E20' : '#2E7D32'}
                    strokeWidth={block.isSelected ? 3 : focused ? 2 : 1.2}
                    tappable
                    onPress={() => {
                      const place = V2PlaceAdapter.getPlaceById(block.id);
                      if (!place) return;
                      dismissSearch();
                      handlePlaceSelect(place);
                    }}
                  />
                );
              })}

              {v2MapLayers.visibleBlockLabels.map((block) => {
                const focused = v2MapLayers.activeMapFilter === 'blocks';
                return (
                  <Marker key={`v2_block_label_${block.id}`} coordinate={block.center} anchor={{ x: 0.5, y: 0.5 }} zIndex={8} tracksViewChanges={false}>
                    <View style={[styles.v2BlockLabel, focused && styles.v2BlockLabelFocused, block.isSelected && styles.v2SelectedBlockLabel]}>
                      <Text style={[styles.v2BlockLabelText, focused && styles.v2BlockLabelTextFocused, block.isSelected && styles.v2SelectedBlockLabelText]}>
                        {block.label}
                      </Text>
                    </View>
                  </Marker>
                );
              })}

              {v2MapLayers.visibleGateMarkers.map((gate) => {
                const focused = v2MapLayers.activeMapFilter === 'gates';
                const gateNum = gate.label.replace('Gate ', '');
                const showFull = gate.isSelected || mapZoomLevel >= 16.5;
                const showCompact = !showFull && mapZoomLevel >= 14;
                const showNumber = !showFull && !showCompact;
                const displayLabel = showFull ? gate.label : showCompact ? `G${gateNum}` : gateNum;
                const isCompact = !showFull;
                return (
                  <Marker
                    key={`v2_gate_${gate.id}`}
                    coordinate={gate.coordinate}
                    anchor={{ x: 0.5, y: 0.5 }}
                    zIndex={gate.isSelected ? 16 : focused ? 14 : 12}
                    tracksViewChanges={focused || gate.isSelected}
                    onPress={() => {
                      const place = V2PlaceAdapter.getPlaceById(gate.id);
                      if (!place) return;
                      dismissSearch();
                      handlePlaceSelect(place);
                    }}
                  >
                    <View style={[
                      isCompact ? styles.v2GateMarkerCompact : styles.v2GateMarker,
                      isCompact && focused && styles.v2GateMarkerCompactFocused,
                      !isCompact && focused && styles.v2GateMarkerFocused,
                      gate.needsConnectorVerification && styles.v2GateMarkerWarning,
                      gate.isSelected && styles.v2GateMarkerSelected,
                    ]}>
                      <Text style={[
                        isCompact ? styles.v2GateMarkerTextCompact : styles.v2GateMarkerText,
                        !isCompact && focused && styles.v2GateMarkerTextFocused,
                        showNumber && styles.v2GateMarkerTextNumber,
                      ]}>{displayLabel}</Text>
                    </View>
                  </Marker>
                );
              })}

              {activePreviewRoute && activePreviewRoute.coordinates.length > 1 && (
                <>
                  {/* White outline underneath for contrast */}
                  <Polyline
                    coordinates={activePreviewRoute.coordinates}
                    strokeColor="rgba(255,255,255,0.95)"
                    strokeWidth={11}
                    zIndex={14}
                  />
                  {/* Blue route line on top */}
                  <Polyline
                    coordinates={activePreviewRoute.coordinates}
                    strokeColor="#1A73E8"
                    strokeWidth={6}
                    zIndex={15}
                  />
                </>
              )}

              {__DEV__ && developerModeEnabled && v2MapLayers.developerLabels.map((label) => (
                <Marker key={`v2_dev_${label.id}`} coordinate={label.coordinate} anchor={{ x: 0.5, y: 0.5 }}>
                  <View style={styles.debugNode}>
                    <Text style={styles.debugNodeText}>{label.text}</Text>
                  </View>
                </Marker>
              ))}
            </>
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
          })}

          {!useV2Map && showBlockPolygons && Object.entries(IJTEMA_DATA.blocks).map(([id, block]) => {
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
                  });
                }}
              />
            ) : null;
          })}

          {!useV2Map && showGraphNodes && __DEV__ && developerModeEnabled && Object.entries(IJTEMA_DATA.nodes).map(([nodeId, node]) => {
            const color = nodeId.startsWith('P') ? '#D32F2F' : nodeId.startsWith('S') ? '#00ACC1' : '#616161';
            return (
              <Marker
                key={`node_${nodeId}`}
                coordinate={{ latitude: node.lat, longitude: node.lng }}
                anchor={{ x: 0.5, y: 0.5 }}
              >
                <View style={[styles.debugNode, { backgroundColor: color }]}>
                  <Text style={styles.debugNodeText}>{nodeId}</Text>
                </View>
              </Marker>
            );
          })}

          {!useV2Map && showRastaNames && __DEV__ && developerModeEnabled && Array.from(new Map(
            IJTEMA_DATA.edges
              .filter((edge) => !!edge.name)
              .map((edge) => [edge.name!, edge]),
          ).values()).map((edge) => {
            const from = IJTEMA_DATA.nodes[edge.from];
            const to = IJTEMA_DATA.nodes[edge.to];
            if (!from || !to || !edge.name) return null;
            const mid = { latitude: (from.lat + to.lat) / 2, longitude: (from.lng + to.lng) / 2 };
            return (
              <Marker key={`rasta_${edge.name}`} coordinate={mid} anchor={{ x: 0.5, y: 0.5 }}>
                <View style={styles.rastaLabel}>
                  <Text style={styles.rastaLabelText}>{edge.name}</Text>
                </View>
              </Marker>
            );
          })}

          {overlayPlaces.map((item) => {
            const overlayItem = item as Place | SearchResult;
            const coordinate = overlayItem.coordinate;
            const label = getDisplayName(overlayItem);
            return (
              <Marker
                key={`search_overlay_${overlayItem.id}`}
                coordinate={coordinate}
                anchor={{ x: 0.5, y: 1 }}
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
          {selectedPlace && selectedPlaceMarkerCoordinate && !activePreviewRoute && (
            <Marker coordinate={selectedPlaceMarkerCoordinate}>
              <View style={styles.selectedMarker}>
                <MapPin size={32} color="#EA4335" fill="#EA4335" />
              </View>
            </Marker>
          )}

          {/* Route preview destination pin — shown when route is active */}
          {previewDestinationCoordinate && activePreviewRoute && (
            <Marker coordinate={previewDestinationCoordinate}>
              <View style={styles.selectedMarker}>
                <MapPin size={30} color="#EA4335" fill="#EA4335" />
              </View>
            </Marker>
          )}

          {currentLocation && (
            <Marker coordinate={currentLocation} anchor={{ x: 0.5, y: 0.5 }}>
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
            <Marker coordinate={previewStartCoordinate} anchor={{ x: 0.5, y: 1 }}>
              <View style={styles.previewStartMarker}>
                <Navigation size={13} color="#FFFFFF" />
              </View>
            </Marker>
          )}
          </MapView>

        <SafeAreaView style={styles.topOverlay} pointerEvents="box-none">
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
                      <Text style={styles.searchResultName} numberOfLines={1} ellipsizeMode="tail">
                        {getDisplayName(item)}
                      </Text>
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
            <>
              {renderChips()}
            </>
          )}
        </SafeAreaView>

        {isOffline && (
          <View style={[styles.offlineIndicator, { top: offlineTop }]}>
            <WifiOff size={14} color="#FFFFFF" />
            <Text style={styles.offlineText}>Offline</Text>
          </View>
        )}

        {!hasGoogleMapsKey && (
          <View style={[styles.mapWarningBanner, { top: mapWarningTop }]}>
            <Text style={styles.mapWarningText}>{MapConfigService.getMissingGoogleMapsMessage()}</Text>
          </View>
        )}

        {hasGoogleMapsKey && mapLoadFailed && (
          <View style={[styles.mapWarningBanner, { top: mapWarningTop }]}>
            <Text style={styles.mapWarningText}>{MapConfigService.getMapLoadFailedMessage()}</Text>
          </View>
        )}

        {showOutsideBanner && (
          <Animated.View
            style={[
              styles.outsideVenueBanner,
              {
                top: outsideBannerTop,
                opacity: warningAnim,
                transform: [{ translateY: warningAnim.interpolate({ inputRange: [0, 1], outputRange: [-8, 0] }) }],
              },
            ]}
          >
            <View style={styles.outsideVenueTextWrap}>
              <Text style={styles.outsideVenueText}>Outside Ijtema area</Text>
              <Text style={styles.outsideVenueSubtext}>Offline routing will enter through nearest connected official gate.</Text>
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

        {__DEV__ && developerModeEnabled && showRouteDiagnostics && (
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

        {isOffline && !offlineData.isDownloaded && (
          <View style={styles.emptyOfflineState}>
            <Text style={styles.emptyOfflineTitle}>Background map not downloaded. Ijtema routes still work.</Text>
            <Pressable style={styles.emptyOfflineButton} onPress={() => nav.navigate('DownloadMap')}>
              <Text style={styles.emptyOfflineButtonText}>Download background map</Text>
            </Pressable>
          </View>
        )}

        {!isSearchFocused && (
          <>
            <View
              style={[
                styles.rightControls,
                { top: rightControlsTop },
              ]}
            >
              <Pressable
                style={styles.controlButton}
                onPress={() => {
                  logHomeControl('layer', 'open_options');
                  openLayerOptions();
                }}
              >
                <Layers size={22} color="#5F6368" />
              </Pressable>
              <Pressable
                style={[
                  styles.controlButton,
                  settings.keepNorthFixed && styles.controlButtonActive,
                ]}
                onPress={() => {
                  logHomeControl('compass', 'reset_north_up');
                  handleCompassReset();
                }}
              >
                <Compass size={22} color={settings.keepNorthFixed ? '#1A73E8' : '#5F6368'} />
              </Pressable>
              <View style={styles.controlHelperBadge}>
                <Text style={styles.controlHelperText}>
                  {settings.keepNorthFixed ? 'North-up' : 'Free rotate'}
                </Text>
              </View>
              <View style={styles.zoomControls}>
                <Pressable
                  style={styles.zoomButton}
                  onPress={() => {
                    logHomeControl('zoom_in', 'map_zoom_in');
                    handleZoomIn();
                  }}
                >
                  <Plus size={22} color="#5F6368" />
                </Pressable>
                <View style={styles.zoomDivider} />
                <Pressable
                  style={styles.zoomButton}
                  onPress={() => {
                    logHomeControl('zoom_out', 'map_zoom_out');
                    handleZoomOut();
                  }}
                >
                  <Minus size={22} color="#5F6368" />
                </Pressable>
              </View>
            </View>

            <View style={[styles.bottomControls, { bottom: rightControlsBottom + 80 }]}>
              <Pressable
                style={styles.recenterButton}
                onPress={() => {
                  logHomeControl('recenter', 'resolve_location_and_center');
                  void handleRecenter();
                }}
              >
                <LocateFixed size={24} color="#4285F4" />
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

        {!isSearchFocused && activePreviewRoute && previewDestination && (
          <View style={[styles.routePreviewCard, { bottom: Math.max(insets.bottom, 16) + 16 }]}>
            <View style={styles.routePreviewCardHeader}>
              <View style={styles.routePreviewTitleWrap}>
                <Text style={styles.routePreviewEyebrow}>Route to</Text>
                <Text style={styles.routePreviewTitle} numberOfLines={1}>{previewDestination.name}</Text>
              </View>
              <View style={styles.routePreviewMetricPill}>
                <Clock size={14} color="#1A73E8" />
                <Text style={styles.routePreviewMetricText}>{activePreviewRoute.estimatedTimeMin} min</Text>
              </View>
            </View>
            <Text style={styles.routePreviewDistance}>
              {InstructionService.formatDistance(activePreviewRoute.totalDistance, settings.distanceUnit)}
            </Text>
            <Text style={styles.routePreviewSummary} numberOfLines={2}>
              {previewRouteSummary}
            </Text>
            <Pressable style={styles.routePreviewPrimaryButton} onPress={handleStartPreviewNavigation}>
              <Navigation size={16} color="#FFFFFF" />
              <Text style={styles.routePreviewPrimaryText}>Start Navigation</Text>
            </Pressable>
            <View style={styles.routePreviewActions}>
              <Pressable style={styles.routePreviewSecondaryButton} onPress={handleChangePreviewStart}>
                <Text style={styles.routePreviewSecondaryText}>Change Start</Text>
              </Pressable>
              <Pressable style={styles.routePreviewSecondaryButton} onPress={handleClearPreviewRoute}>
                <Text style={styles.routePreviewSecondaryText}>Clear Route</Text>
              </Pressable>
            </View>
          </View>
        )}

        <BottomSheet
          ref={bottomSheetRef}
          index={-1}
          snapPoints={snapPoints}
          enablePanDownToClose
          handleIndicatorStyle={[styles.sheetIndicator, { backgroundColor: theme.border }]}
          backgroundStyle={{ backgroundColor: theme.card }}
        >
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
        </BottomSheet>
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
    zIndex: 10,
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
  iconButton: { padding: 10 },
  iconButtonSpacer: { width: 40, height: 40 },
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
  searchResultName: { fontSize: 15, color: '#202124', fontWeight: '500' },
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
  rightControls: { position: 'absolute', right: 12, zIndex: 5 },
  controlButton: {
    backgroundColor: '#FFFFFF',
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
    elevation: 3,
  },
  controlButtonActive: {
    borderWidth: 1,
    borderColor: '#1A73E8',
    backgroundColor: '#E8F0FE',
  },
  controlHelperBadge: {
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginBottom: 10,
    alignSelf: 'center',
    elevation: 2,
  },
  controlHelperText: {
    color: '#5F6368',
    fontSize: 10,
    fontWeight: '700',
  },
  zoomControls: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    elevation: 3,
  },
  zoomButton: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  zoomDivider: { height: 1, backgroundColor: '#DADCE0', marginHorizontal: 8 },
  bottomControls: { position: 'absolute', right: 12, zIndex: 5 },
  recenterButton: {
    backgroundColor: '#FFFFFF',
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 6,
  },
  offlineIndicator: {
    position: 'absolute',
    top: 140,
    left: 12,
    backgroundColor: 'rgba(32, 33, 36, 0.9)',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    zIndex: 10,
  },
  offlineText: { color: '#FFFFFF', fontSize: 12, fontWeight: '600', marginLeft: 6 },
  mapWarningBanner: {
    position: 'absolute',
    top: 172,
    left: 12,
    right: 12,
    backgroundColor: '#FFF3CD',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    zIndex: 11,
  },
  mapWarningText: { color: '#7C4A03', fontSize: 12, fontWeight: '600' },
  outsideVenueBanner: {
    position: 'absolute',
    left: 12,
    right: 76,
    backgroundColor: '#F29900',
    borderRadius: 10,
    paddingLeft: 12,
    paddingRight: 8,
    paddingVertical: 8,
    zIndex: 10,
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 48,
  },
  outsideVenueTextWrap: { flex: 1 },
  outsideVenueText: { color: '#FFFFFF', fontSize: 13, fontWeight: '600' },
  outsideVenueSubtext: { color: '#FFFFFF', fontSize: 11, marginTop: 2 },
  bannerCloseButton: { padding: 6, marginLeft: 4 },
  diagnosticsBanner: {
    position: 'absolute',
    top: 260,
    left: 12,
    right: 12,
    backgroundColor: 'rgba(32,33,36,0.9)',
    borderRadius: 8,
    padding: 8,
    zIndex: 12,
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
  v2RouteLabel: {
    backgroundColor: 'rgba(142,36,170,0.82)',
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  v2RouteLabelText: { color: '#FFFFFF', fontSize: 10, fontWeight: '700' },
  v2SelectedLabel: {
    borderWidth: 1,
    borderColor: '#FFFFFF',
  },
  v2BlockLabel: {
    minWidth: 58,
    minHeight: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderWidth: 1,
    borderColor: '#2E7D32',
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  v2SelectedBlockLabel: {
    backgroundColor: '#1A73E8',
    borderColor: '#FFFFFF',
  },
  v2BlockLabelText: {
    color: '#2E7D32',
    fontSize: 11,
    fontWeight: '800',
  },
  v2SelectedBlockLabelText: {
    color: '#FFFFFF',
  },
  v2GateMarker: {
    backgroundColor: '#1565C0',
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 3,
  },
  v2GateMarkerWarning: {
    backgroundColor: '#E65100',
  },
  v2GateMarkerText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  v2GateMarkerFocused: {
    backgroundColor: '#0D47A1',
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#FFFFFF',
    elevation: 8,
  },
  v2GateMarkerSelected: {
    backgroundColor: '#1A237E',
    borderWidth: 2.5,
    borderColor: '#FFD700',
  },
  v2GateMarkerTextFocused: {
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  v2GateMarkerCompact: {
    backgroundColor: '#1565C0',
    borderRadius: 14,
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
  },
  v2GateMarkerCompactFocused: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 2,
    elevation: 8,
  },
  v2GateMarkerTextCompact: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
    textAlign: 'center',
  },
  v2GateMarkerTextNumber: {
    fontSize: 12,
    fontWeight: '900',
  },
  rastaLabelFocused: {
    backgroundColor: '#E65100',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    elevation: 4,
  },
  rastaLabelTextFocused: {
    fontSize: 12,
    fontWeight: '800',
  },
  v2RouteLabelFocused: {
    backgroundColor: '#6A0DAD',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    elevation: 4,
  },
  v2RouteLabelTextFocused: {
    fontSize: 12,
    fontWeight: '800',
  },
  v2BlockLabelFocused: {
    backgroundColor: '#1B5E20',
    borderColor: '#1B5E20',
    minWidth: 66,
    minHeight: 32,
    elevation: 4,
  },
  v2BlockLabelTextFocused: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '900',
  },
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
    zIndex: 8,
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
    zIndex: 20,
  },
  routePreviewCard: {
    position: 'absolute',
    left: 12,
    right: 84,
    backgroundColor: 'rgba(255,255,255,0.98)',
    borderRadius: 18,
    padding: 14,
    zIndex: 18,
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
  routePreviewPrimaryButton: {
    marginTop: 12,
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
    minHeight: 40,
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

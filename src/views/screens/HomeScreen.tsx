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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MapView, { Marker, Polygon, Polyline, PROVIDER_GOOGLE, LocalTile } from 'react-native-maps';
import {
  Menu,
  Mic,
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
import { GRAPH_VALIDATION, IJTEMA_DATA } from '../../constants/data';
import { Place, SearchResult } from '../../models/types';
import { PlaceDetailService } from '../../services/PlaceDetailService';
import { FavoriteService } from '../../services/FavoriteService';
import { useAppStore } from '../../store/useAppStore';
import { SnapToRoadService } from '../../services/SnapToRoadService';
import { RoutingService } from '../../services/RoutingService';
import { RoutePointService } from '../../services/RoutePointService';
import { Paths } from 'expo-file-system'; // fixed: use Paths API instead of deprecated documentDirectory
import { DrawerParamList, RootStackParamList } from '../../navigation/RootNavigator'; // fixed: use typed navigation params

type HomeScreenNavigationProp = CompositeNavigationProp<
  DrawerNavigationProp<DrawerParamList, 'Home'>,
  NativeStackNavigationProp<RootStackParamList>
>; // fixed: type Home screen navigation across drawer + stack routes

const getTilePath = (): string => `${Paths.document.uri}tiles/{z}_{x}_{y}.png`; // fixed: lazy getter defers Paths.document access to render time so the native module is ready

function isPlace(item: Place | SearchResult): item is Place {
  return 'name' in item;
}
function getDisplayName(item: Place | SearchResult): string {
  return isPlace(item) ? item.name : item.title;
}

export function HomeScreen() {
  const nav = useNavigation<HomeScreenNavigationProp>();
  const currentLocation = useAppStore((s) => s.currentLocation);
  const favorites = useAppStore((s) => s.favorites);
  const routePlannerOrigin = useAppStore((s) => s.routePlannerOrigin);
  const routePlannerDest = useAppStore((s) => s.routePlannerDest);
  const setRoutePlannerOrigin = useAppStore((s) => s.setRoutePlannerOrigin);
  const setRoutePlannerDest = useAppStore((s) => s.setRoutePlannerDest);
  const routeSelectionMode = useAppStore((s) => s.routeSelectionMode);
  const setRouteSelectionMode = useAppStore((s) => s.setRouteSelectionMode);
  const clearRoutePlanner = useAppStore((s) => s.clearRoutePlanner);
  const showGraphNodes = useAppStore((s) => s.showGraphNodes);
  const setShowGraphNodes = useAppStore((s) => s.setShowGraphNodes);
  const showRastaNames = useAppStore((s) => s.showRastaNames);
  const setShowRastaNames = useAppStore((s) => s.setShowRastaNames);
  const showBlockPolygons = useAppStore((s) => s.showBlockPolygons);
  const setShowBlockPolygons = useAppStore((s) => s.setShowBlockPolygons);
  const showRouteDiagnostics = useAppStore((s) => s.showRouteDiagnostics);
  const setShowRouteDiagnostics = useAppStore((s) => s.setShowRouteDiagnostics);
  const [selectedEntryIdx, setSelectedEntryIdx] = useState(0);
  // Controls whether the search suggestions dropdown is visible
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const searchInputRef = useRef<TextInput>(null);
  const theme = useTheme();

  /** Collapse the search dropdown, blur the input, and hide the keyboard. */
  const dismissSearch = useCallback(() => {
    setIsSearchFocused(false);
    searchInputRef.current?.blur();
    Keyboard.dismiss();
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
    venueStatus,
    setIsMapReady,
    handleSearch,
    handlePlaceSelect,
    handleRecenter,
    handleCompassReset,
    handleZoomIn,
    handleZoomOut,
    toggleMapType,
    clearSearch,
    handleCategoryPress,
    setSelectedPlace,
  } = useHomeViewModel();

  // Reset entry index when selection changes
  useEffect(() => {
    setSelectedEntryIdx(0);
  }, [selectedPlace?.id]);

  // Android hardware back: dismiss search dropdown before exiting the screen
  useEffect(() => {
    const handler = BackHandler.addEventListener('hardwareBackPress', () => {
      if (isSearchFocused) {
        dismissSearch();
        return true; // consume event — do NOT go back
      }
      return false; // let the default back action proceed
    });
    return () => handler.remove();
  }, [isSearchFocused, dismissSearch]);

  const entryPoints = selectedPlace?.category === 'Block'
    ? PlaceDetailService.getEntryPoints(selectedPlace.id)
    : [];

  const settings = useAppStore((s) => s.settings);

  const withBlockEntryNode = useCallback(
    (place: Place, preferredIndex?: number): Place => {
      if (place.category !== 'Block') return place;
      const entries = PlaceDetailService.getEntryPoints(place.id);
      const preferredEntry = preferredIndex !== undefined ? entries[preferredIndex] : null;
      const nearestEntry = PlaceDetailService.getNearestEntry(
        place.id,
        RoutePointService.getStartCoordinate(routePlannerOrigin) ?? currentLocation ?? place.coordinate,
      );
      const nodeId = preferredEntry?.nodeId ?? nearestEntry?.nodeId ?? entries[0]?.nodeId;
      return nodeId ? RoutePointService.enrichPlaceWithRoutingNode(place, nodeId) : place;
    },
    [currentLocation, routePlannerOrigin],
  );

  const plannerStartCoordinate = useMemo(
    () => RoutePointService.getStartCoordinate(routePlannerOrigin) ?? currentLocation,
    [currentLocation, routePlannerOrigin],
  );

  const routePreview = useMemo(() => {
    if (!plannerStartCoordinate || !routePlannerDest) return null;
    const destNodeIds = RoutingService.resolveDestinationNodesFromPlace(routePlannerDest, plannerStartCoordinate);
    return RoutingService.calculateRoute(
      plannerStartCoordinate,
      destNodeIds,
      routePlannerOrigin?.routingNodeId ?? routePlannerOrigin?.selectedEntryNodeId,
    );
  }, [plannerStartCoordinate, routePlannerDest, routePlannerOrigin]);

  const destinationMarkerCoordinate = useMemo(() => {
    const endNodeId = routePreview?.nodes[routePreview.nodes.length - 1];
    return RoutePointService.nodeToCoordinate(endNodeId) ?? RoutePointService.getDestinationCoordinate(routePlannerDest);
  }, [routePreview, routePlannerDest]);

  const selectedPlaceMarkerCoordinate = useMemo(() => {
    if (!selectedPlace) return null;
    if (selectedPlace.category === 'Block' && entryPoints[selectedEntryIdx]) {
      return RoutePointService.nodeToCoordinate(entryPoints[selectedEntryIdx].nodeId) ?? selectedPlace.coordinate;
    }
    return RoutePointService.getDestinationCoordinate(selectedPlace);
  }, [entryPoints, selectedEntryIdx, selectedPlace]);

  const walkingTimeMin = (selectedPlace && currentLocation)
    ? PlaceDetailService.estimateWalkingTime(
        PlaceDetailService.distanceToBlock(selectedPlace.id, currentLocation),
        settings.walkingSpeed ?? 1.4,
      )
    : null;

  const isFav = selectedPlace ? favorites.some((f) => f.placeId === selectedPlace.id) : false;

  const handleToggleFav = () => {
    if (!selectedPlace) return;
    FavoriteService.toggleFavorite(selectedPlace);
  };

  const withSelectedEntryNode = (place: Place): Place => withBlockEntryNode(place, selectedEntryIdx);

  useEffect(() => {
    if (!selectedPlace || selectedPlace.category !== 'Block') return;
    if (routePlannerDest?.id !== selectedPlace.id) return;
    setRoutePlannerDest(withSelectedEntryNode(selectedPlace));
  }, [selectedEntryIdx, selectedPlace, routePlannerDest?.id]);

  const handleOpenDirections = (place: Place) => {
    const destination = withSelectedEntryNode(place);
    setRoutePlannerDest(destination);
    nav.navigate('Directions', { destination });
  };

  const setAsStartFromPlace = (place: Place) => {
    const start = withSelectedEntryNode(place);
    setRoutePlannerOrigin(start);
    setRouteSelectionMode('idle');
  };

  const setAsDestinationFromPlace = (place: Place) => {
    const destination = withSelectedEntryNode(place);
    setRoutePlannerDest(destination);
    setRouteSelectionMode('idle');
  };

  const handleSearchResultSelect = (place: Place) => {
    dismissSearch();
    if (routeSelectionMode === 'selectingStart') {
      setRoutePlannerOrigin(withBlockEntryNode(place));
      setRouteSelectionMode('selectingDestination');
      clearSearch();
      return;
    }
    if (routeSelectionMode === 'selectingDestination') {
      const destination = withBlockEntryNode(place);
      setRoutePlannerDest(destination);
      setRouteSelectionMode('idle');
      clearSearch();
      return;
    }
    handlePlaceSelect(place);
  };

  const handleMapSelect = (coord: { latitude: number; longitude: number }, blockId?: string) => {
    if (routeSelectionMode === 'selectingStart') {
      if (blockId) {
        const block = IJTEMA_DATA.blocks[blockId];
        if (!block) return;
        const nearestEntry = PlaceDetailService.getNearestEntry(blockId, coord);
        const rawStartPlace: Place = {
          id: `start_${blockId}`,
          name: block.name,
          urduName: block.urduName,
          category: 'Block',
          description: `Manual start at ${block.name}.`,
          coordinate: block.center,
        };
        const startPlace = nearestEntry?.nodeId
          ? RoutePointService.enrichPlaceWithRoutingNode(rawStartPlace, nearestEntry.nodeId)
          : rawStartPlace;
        setRoutePlannerOrigin(startPlace);
      } else {
        const resolved = SnapToRoadService.resolveRoutingNode(coord);
        const startPlace: Place = {
          id: 'custom_start',
          name: 'Custom Start',
          category: 'CustomPoint',
          description: 'Manual route start point.',
          coordinate: coord,
          routingNodeId: resolved.nodeId,
          resolvedRoutingNodeId: resolved.nodeId,
          resolvedRoutingCoordinate: resolved.snappedCoordinate,
          snappedCoordinate: resolved.snappedCoordinate,
        };
        setRoutePlannerOrigin(startPlace);
        if (resolved.warning) Alert.alert('Outside Area', resolved.warning);
      }
      setRouteSelectionMode('selectingDestination');
      return;
    }

    if (routeSelectionMode === 'selectingDestination') {
      if (blockId) {
        const block = IJTEMA_DATA.blocks[blockId];
        if (!block) return;
        const nearestEntry = PlaceDetailService.getNearestEntry(blockId, coord);
        const rawDestination: Place = {
          id: block.id,
          name: block.name,
          urduName: block.urduName,
          category: 'Block',
          description: `${block.name} selected by map.`,
          coordinate: block.center,
        };
        const destination = nearestEntry?.nodeId
          ? RoutePointService.enrichPlaceWithRoutingNode(rawDestination, nearestEntry.nodeId)
          : rawDestination;
        setRoutePlannerDest(destination);
        setRouteSelectionMode('idle');
        return;
      }

      const resolved = SnapToRoadService.resolveRoutingNode(coord);
      const destination: Place = {
        id: 'custom_destination',
        name: 'Custom Destination',
        category: 'CustomPoint',
        description: 'Manual destination point.',
        coordinate: coord,
        routingNodeId: resolved.nodeId,
        resolvedRoutingNodeId: resolved.nodeId,
        resolvedRoutingCoordinate: resolved.snappedCoordinate,
        snappedCoordinate: resolved.snappedCoordinate,
      };
      setRoutePlannerDest(destination);
      setRouteSelectionMode('idle');
      if (resolved.warning) Alert.alert('Outside Area', resolved.warning);
      return;
    }

    if (selectedPlace) {
      setSelectedPlace(null);
      bottomSheetRef.current?.close();
      return;
    }

    Alert.alert('Map Point', 'Use this point for routing?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Set as Start',
        onPress: () => {
          const resolved = SnapToRoadService.resolveRoutingNode(coord);
          const startPlace: Place = {
            id: 'custom_start',
            name: 'Custom Start',
            category: 'CustomPoint',
            description: 'Manual route start point.',
            coordinate: coord,
            routingNodeId: resolved.nodeId,
            resolvedRoutingNodeId: resolved.nodeId,
            resolvedRoutingCoordinate: resolved.snappedCoordinate,
            snappedCoordinate: resolved.snappedCoordinate,
          };
          setRoutePlannerOrigin(startPlace);
          if (resolved.warning) Alert.alert('Outside Area', resolved.warning);
        },
      },
      {
        text: 'Set as Destination',
        onPress: () => {
          const resolved = SnapToRoadService.resolveRoutingNode(coord);
          const destination: Place = {
            id: 'custom_destination',
            name: 'Custom Destination',
            category: 'CustomPoint',
            description: 'Manual destination point.',
            coordinate: coord,
            routingNodeId: resolved.nodeId,
            resolvedRoutingNodeId: resolved.nodeId,
            resolvedRoutingCoordinate: resolved.snappedCoordinate,
            snappedCoordinate: resolved.snappedCoordinate,
          };
          setRoutePlannerDest(destination);
          if (resolved.warning) Alert.alert('Outside Area', resolved.warning);
        },
      },
    ]);
  };

  const renderChips = () => {
    const categories = [
      { id: 'blocks', label: 'Blocks' },
      { id: 'rastas', label: 'Rastas' },
    ];
    return (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.chipsContainer}
        contentContainerStyle={styles.chipsContent}
      >
        {categories.map((cat) => (
          <Pressable
            key={cat.id}
            style={[styles.chip, activeCategory === cat.id && styles.activeChip]}
            onPress={() => handleCategoryPress(cat.id)}
          >
            <Text style={[styles.chipText, activeCategory === cat.id && styles.activeChipText]}>
              {cat.label}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.container} // fixed: keep map layout stable while keyboard is open
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'} // fixed: apply platform-appropriate keyboard avoidance
    >
      <View style={styles.container}>
        <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />

        <MapView
          ref={mapRef}
          style={styles.map}
          provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined} // fixed: avoid forcing Google provider on iOS
          initialRegion={initialRegion}
          mapType={isOffline ? 'none' : mapType}
          showsUserLocation
          showsMyLocationButton={false}
          showsCompass={false}
          onMapReady={() => setIsMapReady(true)}
          onPress={(event) => {
            // Tapping the map always closes search first
            if (isSearchFocused) {
              dismissSearch();
              clearSearch();
              return;
            }
            handleMapSelect(event.nativeEvent.coordinate);
          }}
        >
          {isOffline && offlineData.isDownloaded && (
            <LocalTile pathTemplate={getTilePath()} tileSize={256} zIndex={-1} />
          )}

          {IJTEMA_DATA.edges.map((edge, idx) => {
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

          {showBlockPolygons && Object.entries(IJTEMA_DATA.blocks).map(([id, block]) => {
            const isSelected = selectedPlace?.id === id;
            return block.corners ? (
              <Polygon
                key={id}
                coordinates={block.corners}
                fillColor={isSelected ? 'rgba(26, 115, 232, 0.35)' : 'rgba(46, 125, 50, 0.15)'}
                strokeColor={isSelected ? '#1A73E8' : '#2E7D32'}
                strokeWidth={isSelected ? 3 : 1.5}
                tappable
                onPress={(event) => {
                  dismissSearch();
                  const tapped = event.nativeEvent.coordinate;
                  if (!tapped) return;
                  if (routeSelectionMode === 'selectingStart' || routeSelectionMode === 'selectingDestination') {
                    handleMapSelect(tapped, id);
                    return;
                  }
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

          {showGraphNodes && Object.entries(IJTEMA_DATA.nodes).map(([nodeId, node]) => {
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

          {showRastaNames && Array.from(new Map(
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

          {routePreview && (
            <>
              <Polyline
                coordinates={routePreview.coordinates}
                strokeColor="rgba(13,71,161,0.72)"
                strokeWidth={10}
                zIndex={20}
              />
              <Polyline
                coordinates={routePreview.coordinates}
                strokeColor="#1A73E8"
                strokeWidth={6}
                zIndex={21}
              />
            </>
          )}

          {routePlannerOrigin && (
            <Marker coordinate={RoutePointService.getStartCoordinate(routePlannerOrigin) ?? routePlannerOrigin.coordinate}>
              <View style={styles.startMarker}>
                <MapPin size={30} color="#1A73E8" fill="#1A73E8" />
              </View>
            </Marker>
          )}

          {routePlannerDest && destinationMarkerCoordinate && (
            <Marker coordinate={destinationMarkerCoordinate}>
              <View style={styles.destMarker}>
                <MapPin size={30} color="#2E7D32" fill="#2E7D32" />
              </View>
            </Marker>
          )}

          {selectedPlace && selectedPlaceMarkerCoordinate && (
            <Marker coordinate={selectedPlaceMarkerCoordinate}>
              <View style={styles.selectedMarker}>
                <MapPin size={32} color="#EA4335" fill="#EA4335" />
              </View>
            </Marker>
          )}
        </MapView>

        {/* Top UI */}
        <SafeAreaView style={styles.topOverlay} pointerEvents="box-none">
          <View style={[styles.searchBarContainer, { backgroundColor: theme.searchBar }]}>
            <Pressable
              onPress={() => { dismissSearch(); nav.dispatch(DrawerActions.openDrawer()); }}
              style={styles.iconButton}
            >
              <Menu size={24} color={theme.subtext} />
            </Pressable>
            <TextInput
              ref={searchInputRef}
              style={[styles.searchInput, { color: theme.text }]}
              placeholder="Search blocks or rastas…"
              placeholderTextColor={theme.placeholder}
              value={searchQuery}
              onChangeText={handleSearch}
              onFocus={() => setIsSearchFocused(true)}
              returnKeyType="search"
              onSubmitEditing={Keyboard.dismiss}
            />
            {searchQuery.length > 0 ? (
              <Pressable onPress={clearSearch} style={styles.iconButton}>
                <X size={20} color="#5F6368" />
              </Pressable>
            ) : (
              <Pressable
                style={styles.iconButton}
                onPress={() =>
                  Alert.alert(
                    'Voice Search',
                    'Voice search is not available in the offline edition. Please type your destination in the search bar.',
                    [{ text: 'OK' }],
                  )
                }
              >
                <Mic size={22} color="#4285F4" />
              </Pressable>
            )}
          </View>

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
                      <Text style={styles.searchResultName}>{getDisplayName(item)}</Text>
                      <Text style={styles.searchResultCategory}>{(item as any).category}</Text>
                    </View>
                    <ChevronRight size={18} color="#BDC1C6" />
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          )}

          {!isSearchFocused && (
            <>
              {routeSelectionMode !== 'idle' && (
                <View style={styles.selectionBanner}>
                  <Text style={styles.selectionBannerText}>
                    {routeSelectionMode === 'selectingStart'
                      ? 'Tap the map to set start location'
                      : 'Tap a block, road, or map point for destination'}
                  </Text>
                </View>
              )}
              {renderChips()}
              <View style={styles.routePlannerCard}>
                <View style={styles.routePlannerRow}>
                  <Text style={styles.routePlannerLabel}>From</Text>
                  <Text style={styles.routePlannerValue} numberOfLines={1}>
                    {routePlannerOrigin?.name ?? 'Current location'}
                  </Text>
                </View>
                <View style={styles.routePlannerActions}>
                  <Pressable style={styles.routePlannerBtn} onPress={() => setRoutePlannerOrigin(null)}>
                    <Text style={styles.routePlannerBtnText}>Use GPS</Text>
                  </Pressable>
                  <Pressable
                    style={[
                      styles.routePlannerBtn,
                      routeSelectionMode === 'selectingStart' && styles.routePlannerBtnActive,
                    ]}
                    onPress={() => setRouteSelectionMode('selectingStart')}
                  >
                    <Text
                      style={[
                        styles.routePlannerBtnText,
                        routeSelectionMode === 'selectingStart' && { color: '#FFFFFF' },
                      ]}
                    >
                      Select Start
                    </Text>
                  </Pressable>
                </View>
                <View style={styles.routePlannerRow}>
                  <Text style={styles.routePlannerLabel}>To</Text>
                  <Text style={styles.routePlannerValue} numberOfLines={1}>
                    {routePlannerDest?.name ?? 'Search block or tap map'}
                  </Text>
                </View>
                <View style={styles.routePlannerActions}>
                  <Pressable
                    style={[
                      styles.routePlannerBtn,
                      routeSelectionMode === 'selectingDestination' && styles.routePlannerBtnActive,
                    ]}
                    onPress={() => setRouteSelectionMode('selectingDestination')}
                  >
                    <Text
                      style={[
                        styles.routePlannerBtnText,
                        routeSelectionMode === 'selectingDestination' && { color: '#FFFFFF' },
                      ]}
                    >
                      Select Destination
                    </Text>
                  </Pressable>
                  <Pressable style={styles.routePlannerBtn} onPress={clearRoutePlanner}>
                    <Text style={styles.routePlannerBtnText}>Clear</Text>
                  </Pressable>
                </View>
              </View>
              <View style={styles.debugCard}>
                <Pressable style={styles.debugBtn} onPress={() => setShowGraphNodes(!showGraphNodes)}>
                  <Text style={styles.debugBtnText}>Nodes {showGraphNodes ? 'ON' : 'OFF'}</Text>
                </Pressable>
                <Pressable style={styles.debugBtn} onPress={() => setShowRastaNames(!showRastaNames)}>
                  <Text style={styles.debugBtnText}>Rasta Names {showRastaNames ? 'ON' : 'OFF'}</Text>
                </Pressable>
                <Pressable style={styles.debugBtn} onPress={() => setShowBlockPolygons(!showBlockPolygons)}>
                  <Text style={styles.debugBtnText}>Blocks {showBlockPolygons ? 'ON' : 'OFF'}</Text>
                </Pressable>
                <Pressable style={styles.debugBtn} onPress={() => setShowRouteDiagnostics(!showRouteDiagnostics)}>
                  <Text style={styles.debugBtnText}>Diagnostics {showRouteDiagnostics ? 'ON' : 'OFF'}</Text>
                </Pressable>
              </View>
            </>
          )}
        </SafeAreaView>

        {isOffline && (
          <View style={styles.offlineIndicator}>
            <WifiOff size={14} color="#FFFFFF" />
            <Text style={styles.offlineText}>Offline</Text>
          </View>
        )}

        {/* Phase 4 — outside-venue warning */}
        {currentLocation && !venueStatus.insideVenue && (
          <View style={styles.outsideVenueBanner}>
            <Text style={styles.outsideVenueText}>You are outside the Ijtema area</Text>
            <Pressable style={styles.outsideVenueButton} onPress={() => setRouteSelectionMode('selectingStart')}>
              <Text style={styles.outsideVenueButtonText}>Select start manually</Text>
            </Pressable>
          </View>
        )}

        {showRouteDiagnostics && (
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
            <Text style={styles.emptyOfflineTitle}>No offline map available.</Text>
            <Pressable style={styles.emptyOfflineButton} onPress={() => nav.navigate('DownloadMap')}>
              <Text style={styles.emptyOfflineButtonText}>Download now</Text>
            </Pressable>
          </View>
        )}

        {/* Map controls — hidden when search dropdown is open to prevent z-index overlap */}
        {!isSearchFocused && (
          <>
            {routePreview && routePlannerDest && (
              <View style={styles.previewCard}>
                <View style={styles.previewMetrics}>
                  <Text style={styles.previewTime}>{routePreview.estimatedTimeMin} min</Text>
                  <Text style={styles.previewDistance}>{routePreview.totalDistance} m</Text>
                  <Text style={styles.previewDest} numberOfLines={1}>
                    to {routePlannerDest.name}
                    {routePreview.nodes.length > 0 ? ` entry ${routePreview.nodes[routePreview.nodes.length - 1]}` : ''}
                  </Text>
                  {showRouteDiagnostics && (
                    <Text style={styles.previewNodes} numberOfLines={1}>
                      {routePreview.nodes.join(' -> ')}
                    </Text>
                  )}
                </View>
                <View style={styles.previewActions}>
                  <Pressable
                    style={styles.previewStartButton}
                    onPress={() => nav.navigate('Directions', { destination: routePlannerDest })}
                  >
                    <Text style={styles.previewStartText}>Start</Text>
                  </Pressable>
                  <Pressable style={styles.previewClearButton} onPress={clearRoutePlanner}>
                    <Text style={styles.previewClearText}>Clear</Text>
                  </Pressable>
                </View>
              </View>
            )}
            <View style={styles.rightControls}>
              <Pressable style={styles.controlButton} onPress={toggleMapType}>
                <Layers size={22} color="#5F6368" />
              </Pressable>
              <Pressable style={styles.controlButton} onPress={handleCompassReset}>
                <Compass size={22} color="#5F6368" />
              </Pressable>
              <View style={styles.zoomControls}>
                <Pressable style={styles.zoomButton} onPress={handleZoomIn}>
                  <Plus size={22} color="#5F6368" />
                </Pressable>
                <View style={styles.zoomDivider} />
                <Pressable style={styles.zoomButton} onPress={handleZoomOut}>
                  <Minus size={22} color="#5F6368" />
                </Pressable>
              </View>
            </View>

            <View style={styles.bottomControls}>
              <Pressable style={styles.recenterButton} onPress={handleRecenter}>
                <LocateFixed size={24} color="#4285F4" />
              </Pressable>
            </View>
          </>
        )}

        {/* Bottom Sheet */}
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
                {/* Header */}
                <View style={styles.placeHeader}>
                  <View style={{ flex: 1 }}>
                  <Text style={[styles.placeName, { color: theme.text }]}>{selectedPlace.name}</Text>
                  {selectedPlace.urduName && (
                    <Text style={[styles.placeUrdu, { color: theme.primary }]}>{selectedPlace.urduName}</Text>
                  )}
                  <Text style={[styles.placeCategory, { color: theme.subtext }]}>{selectedPlace.category}</Text>
                  </View>
                  <Pressable onPress={() => { setSelectedPlace(null); bottomSheetRef.current?.close(); }}>
                    <X size={24} color="#5F6368" />
                  </Pressable>
                </View>

              {/* Info chips */}
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

              {/* Entrance selector */}
              {entryPoints.length > 0 && (
                <View style={styles.entranceSection}>
                  <Text style={styles.sectionLabel}>Choose Entrance</Text>
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
                          Entry {ep.nodeId}
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
                  {entryPoints.length === 1 && (
                    <Text style={styles.entryHint}>Route ends at {entryPoints[0].nodeId}</Text>
                  )}
                </View>
              )}

              {/* CTA */}
              <Pressable style={styles.takeMeButton} onPress={() => selectedPlace && handleOpenDirections(selectedPlace)}>
                <Navigation size={22} color="#FFFFFF" />
                <Text style={styles.takeMeText}>Preview Route</Text>
              </Pressable>

              {/* Secondary actions */}
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
                  onPress={() => selectedPlace && handleOpenDirections(selectedPlace)}
                >
                  <Info size={20} color="#1A73E8" />
                  <Text style={styles.secondaryActionText}>Details</Text>
                </Pressable>
                <Pressable
                  style={styles.secondaryAction}
                  onPress={() => selectedPlace && setAsStartFromPlace(selectedPlace)}
                >
                  <MapPin size={20} color="#1A73E8" />
                  <Text style={styles.secondaryActionText}>Set Start</Text>
                </Pressable>
                <Pressable
                  style={styles.secondaryAction}
                  onPress={() => selectedPlace && setAsDestinationFromPlace(selectedPlace)}
                >
                  <Navigation size={20} color="#1A73E8" />
                  <Text style={styles.secondaryActionText}>Set Destination</Text>
                </Pressable>
              </View>

              {/* Description */}
              {selectedPlace.description && (
                <Text style={styles.placeDesc}>{selectedPlace.description}</Text>
              )}
              </View>
            ) : (
              <View style={styles.emptySheet}>
                <Text style={styles.emptySheetText}>Tap a block to see details</Text>
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
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  iconButton: { padding: 10 },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#202124',
    paddingHorizontal: 4,
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
  searchResultText: { flex: 1, marginLeft: 4 },
  searchResultName: { fontSize: 15, color: '#202124', fontWeight: '500' },
  searchResultCategory: { fontSize: 13, color: '#70757A', marginTop: 1 },
  chipsContainer: { marginTop: 10 },
  chipsContent: { paddingHorizontal: 12, paddingBottom: 8 },
  chip: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 20,
    marginRight: 8,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#DADCE0',
    minWidth: 72,
    alignItems: 'center',
  },
  activeChip: { backgroundColor: '#E8F0FE', borderColor: '#1A73E8' },
  chipText: { fontSize: 14, color: '#3C4043', fontWeight: '500' },
  activeChipText: { color: '#1A73E8' },
  selectionBanner: {
    marginHorizontal: 12,
    marginTop: 8,
    backgroundColor: '#1A73E8',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  selectionBannerText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700', textAlign: 'center' },
  routePlannerCard: {
    marginHorizontal: 12,
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: 12,
    padding: 10,
    gap: 8,
  },
  routePlannerRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  routePlannerLabel: { width: 42, fontSize: 12, color: '#5F6368', fontWeight: '700' },
  routePlannerValue: { flex: 1, fontSize: 12, color: '#202124' },
  routePlannerActions: { flexDirection: 'row', gap: 8 },
  routePlannerBtn: {
    backgroundColor: '#E8F0FE',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  routePlannerBtnActive: {
    backgroundColor: '#1A73E8',
  },
  routePlannerBtnText: { fontSize: 12, color: '#1A73E8', fontWeight: '700' },
  debugCard: {
    marginHorizontal: 12,
    marginTop: 6,
    backgroundColor: 'rgba(32,33,36,0.88)',
    borderRadius: 10,
    padding: 6,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  debugBtn: { backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  debugBtnText: { color: '#FFFFFF', fontSize: 11, fontWeight: '600' },
  rightControls: { position: 'absolute', top: 180, right: 12, zIndex: 5 },
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
  zoomControls: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    elevation: 3,
  },
  zoomButton: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  zoomDivider: { height: 1, backgroundColor: '#DADCE0', marginHorizontal: 8 },
  bottomControls: { position: 'absolute', bottom: 24, right: 12, zIndex: 5 },
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
  outsideVenueBanner: {
    position: 'absolute',
    top: 168,
    left: 12,
    right: 12,
    backgroundColor: '#F29900',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    zIndex: 10,
    alignItems: 'center',
  },
  outsideVenueText: { color: '#FFFFFF', fontSize: 13, fontWeight: '600' },
  outsideVenueButton: {
    marginTop: 6,
    backgroundColor: 'rgba(255,255,255,0.22)',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 10,
  },
  outsideVenueButtonText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
  diagnosticsBanner: {
    position: 'absolute',
    top: 220,
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
  startMarker: { alignItems: 'center', justifyContent: 'center' },
  destMarker: { alignItems: 'center', justifyContent: 'center' },
  selectedMarker: { alignItems: 'center', justifyContent: 'center' },
  previewCard: {
    position: 'absolute',
    left: 12,
    right: 76,
    bottom: 24,
    zIndex: 8,
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderRadius: 16,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
  },
  previewMetrics: { flex: 1, paddingRight: 8 },
  previewTime: { fontSize: 20, fontWeight: '800', color: '#1A73E8' },
  previewDistance: { fontSize: 13, color: '#3C4043', fontWeight: '700', marginTop: 1 },
  previewDest: { fontSize: 12, color: '#5F6368', marginTop: 2 },
  previewNodes: { fontSize: 10, color: '#1A73E8', marginTop: 4 },
  previewActions: { gap: 8, alignItems: 'stretch' },
  previewStartButton: {
    backgroundColor: '#2E7D32',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 9,
    alignItems: 'center',
  },
  previewStartText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  previewClearButton: {
    backgroundColor: '#FCE8E6',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
    alignItems: 'center',
  },
  previewClearText: { color: '#C5221F', fontSize: 12, fontWeight: '800' },
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
  entranceChipActive: { backgroundColor: '#E8F0FE', borderWidth: 1.5, borderColor: '#1A73E8' },
  entranceNodeText: { fontSize: 13, color: '#202124', fontWeight: '800', marginBottom: 2 },
  entranceChipText: { fontSize: 14, color: '#3C4043', fontWeight: '500' },
  entranceChipTextActive: { color: '#1A73E8' },
  entranceUrdu: { fontSize: 12, color: '#888', marginTop: 2 },
  entryHint: { color: '#5F6368', fontSize: 12, fontWeight: '600', marginTop: 8 },
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
  emptyOfflineState: { // fixed: container for the no-offline-map warning shown when device is offline without downloaded tiles
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
  emptyOfflineTitle: { // fixed: title text for the no-offline-map empty state
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 12,
  },
  emptyOfflineButton: { // fixed: CTA button driving users to the download screen from the offline empty state
    backgroundColor: '#2E7D32',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  emptyOfflineButtonText: { // fixed: button label text for the download CTA in the offline empty state
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
});

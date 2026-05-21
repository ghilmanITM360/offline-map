/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useRef, useMemo, useEffect, useCallback } from 'react';
import { Alert } from 'react-native';
import MapView, { Region } from 'react-native-maps';
import BottomSheet from '@gorhom/bottom-sheet';
import { useAppStore } from '../store/useAppStore';
import { Place } from '../models/types';
import { SearchService } from '../services/SearchService';
import { GPSManagerService } from '../services/GPSManagerService';
import { RoutingService } from '../services/RoutingService';
import { LocationAccessService } from '../services/LocationAccessService';
import { RoutePointService } from '../services/RoutePointService';

function formatLastKnownAge(timestamp: string | null): string {
  if (!timestamp) return 'from an earlier session';
  const ageMs = Date.now() - new Date(timestamp).getTime();
  if (!Number.isFinite(ageMs) || ageMs < 0) return 'from an earlier session';
  const minutes = Math.max(1, Math.round(ageMs / 60_000));
  if (minutes < 60) return `from ${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.round(minutes / 60);
  return `from ${hours} hour${hours === 1 ? '' : 's'} ago`;
}

export function useHomeViewModel() {
  const mapRef = useRef<MapView>(null);
  const bottomSheetRef = useRef<BottomSheet>(null);

  const currentLocation = useAppStore((s) => s.currentLocation);
  const lastKnownLocation = useAppStore((s) => s.lastKnownLocation);
  const lastKnownLocationUpdatedAt = useAppStore((s) => s.lastKnownLocationUpdatedAt);
  const hasLocationPermission = useAppStore((s) => s.hasLocationPermission);
  const settings = useAppStore((s) => s.settings);
  const recentSearches = useAppStore((s) => s.recentSearches);
  const offlineData = useAppStore((s) => s.offlineData);
  const hasInternet = useAppStore((s) => s.hasInternet);
  const selectedPlace = useAppStore((s) => s.selectedPlace);
  const searchQuery = useAppStore((s) => s.searchQuery);
  const searchResults = useAppStore((s) => s.searchResults);
  const isNavigating = useAppStore((s) => s.isNavigating);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const setCurrentLocation = useAppStore((s) => s.setCurrentLocation);
  const setSnappedLocation = useAppStore((s) => s.setSnappedLocation);
  const setHasLocationPermission = useAppStore((s) => s.setHasLocationPermission);
  const addRecentSearch = useAppStore((s) => s.addRecentSearch);
  const setSelectedPlace = useAppStore((s) => s.setSelectedPlace);
  const setSearchQuery = useAppStore((s) => s.setSearchQuery);
  const setSearchResults = useAppStore((s) => s.setSearchResults);

  const isOffline = !hasInternet;
  const [isMapReady, setIsMapReady] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  // Venue status — updated on GPS changes
  const [venueStatus, setVenueStatus] = useState<{ insideVenue: boolean; insideBlock: string | null }>({
    insideVenue: false,
    insideBlock: null,
  });

  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const snapPoints = useMemo(() => ['15%', '50%', '92%'], []);
  const categoryChips = useMemo(() => SearchService.getAvailableCategoryChips(), []);
  const searchPlaceholder = useMemo(() => {
    const labels = categoryChips.map((chip) => chip.label).filter((label) => label !== 'All');
    if (labels.length >= 4) return 'Search blocks, rastas, gates, masjids...';
    return labels.length > 0 ? `Search ${labels.join(', ').toLowerCase()}...` : 'Search places...';
  }, [categoryChips]);

  const initialRegion: Region = {
    latitude: 24.9685,
    longitude: 67.0015,
    latitudeDelta: 0.01,
    longitudeDelta: 0.01,
  };

  const handleGPS = useCallback(
    (coord: { latitude: number; longitude: number }) => {
      if (settings.autoFollowLocation && mapRef.current && !isNavigating) {
        mapRef.current.animateToRegion(
          {
            ...coord,
            latitudeDelta: 0.005,
            longitudeDelta: 0.005,
          },
          1000
        );
      }
      // Phase 4 — update venue/block status on each GPS tick
      setVenueStatus(RoutingService.getVenueStatus(coord));
    },
    [isNavigating, settings.autoFollowLocation],
  );

  useEffect(() => {
    if (!hasLocationPermission) return;
    GPSManagerService.addListener(handleGPS);
    return () => {
      GPSManagerService.removeListener(handleGPS);
    };
  }, [handleGPS, hasLocationPermission]);

  // Phase 8 — debounced search (200ms)
  const handleSearch = useCallback(
    (text: string) => {
      setSearchQuery(text);
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
      searchTimerRef.current = setTimeout(() => {
        if (text.length > 1) {
          const results = SearchService.search(
            text,
            currentLocation ?? undefined,
          );
          setSearchResults(results as any);
        } else {
          setSearchResults([]);
        }
      }, 200);
    },
    [currentLocation, setSearchQuery, setSearchResults],
  );

  const handlePlaceSelect = (place: Place) => {
    setSelectedPlace(place);
    addRecentSearch(place);
    setSearchQuery('');
    setSearchResults([]);
    bottomSheetRef.current?.snapToIndex(1);
    mapRef.current?.animateToRegion(
      {
        ...place.coordinate,
        latitudeDelta: 0.002,
        longitudeDelta: 0.002,
      },
      1000
    );
  };

  const handleRecenter = useCallback(async () => {
    const recenterTo = (location: typeof currentLocation) => {
      if (!location) return false;
      if (!mapRef.current) return false;
      updateSettings({ autoFollowLocation: true });
      mapRef.current.animateToRegion(
        {
          ...location,
          latitudeDelta: 0.005,
          longitudeDelta: 0.005,
        },
        1000
      );
      const nearestNode = RoutingService.findNearestNode(location);
      setSnappedLocation(RoutePointService.nodeToCoordinate(nearestNode));
      setVenueStatus(RoutingService.getVenueStatus(location));
      return true;
    };

    try {
      const resolved = await LocationAccessService.resolveCurrentLocation(true);
      setHasLocationPermission(resolved.permissionState.granted);

      if (resolved.ok && resolved.coordinate) {
        setCurrentLocation(resolved.coordinate, resolved.source ?? 'live');
        const centered = recenterTo(resolved.coordinate);
        if (!centered) {
          Alert.alert('Map still loading', 'Location updated. Try recenter again in a moment.');
        }

        if (!RoutingService.isInsideVenue(resolved.coordinate)) {
          Alert.alert(
            'Outside Ijtema area',
            'You are outside the mapped venue. We centered on your position, but routes should start from a point inside the ground.',
          );
        } else if (resolved.source === 'device_last_known') {
          Alert.alert('Using last known location', resolved.message ?? 'Live GPS was unavailable, so the device last known location is being shown.');
        }
        return;
      }

      const canUseRemembered = lastKnownLocation && RoutingService.isInsideVenue(lastKnownLocation);
      const actions = [
        {
          text: 'Choose start manually',
          style: 'default' as const,
          onPress: () => {
            Alert.alert('Manual start', 'Open Directions from a place and choose your start point manually.');
          },
        },
        ...(!resolved.permissionState.canAskAgain && !resolved.permissionState.granted
          ? [{
              text: 'Open Settings',
              onPress: () => {
                void (async () => {
                  const opened = await LocationAccessService.openAppSettings();
                  if (!opened) {
                    Alert.alert('Unable to open settings', 'Open Android app settings manually and allow location permission for this app.');
                  }
                })();
              },
            }]
          : []),
        ...(canUseRemembered
          ? [{
              text: 'Use remembered location',
              onPress: () => {
                setCurrentLocation(lastKnownLocation, 'remembered');
                const centered = recenterTo(lastKnownLocation);
                if (!centered) {
                  Alert.alert('Map still loading', 'Remembered location selected. Try recenter again in a moment.');
                }
                Alert.alert('Using last known location', `Last known location ${formatLastKnownAge(lastKnownLocationUpdatedAt)}.`);
              },
            }]
          : []),
        { text: 'OK', style: 'cancel' as const },
      ];

      Alert.alert(
        'Location unavailable',
        resolved.message ?? 'Current location could not be found. Use a remembered location or choose a start manually in Directions.',
        actions,
      );
    } catch {
      Alert.alert('Location error', 'Could not read location right now. Please try again.');
    }
  }, [lastKnownLocation, lastKnownLocationUpdatedAt, setCurrentLocation, setHasLocationPermission, setSnappedLocation, updateSettings]);

  // Phase 11 — compass reset (north-up, pitch 0)
  const handleCompassReset = useCallback(() => {
    mapRef.current?.animateCamera({ heading: 0, pitch: 0 }, { duration: 500 });
    updateSettings({ keepNorthFixed: true });
  }, [updateSettings]);

  const handleZoomIn = () => {
    mapRef.current?.getCamera().then((camera) => {
      if (camera.zoom !== undefined) {
        camera.zoom += 1;
        mapRef.current?.animateCamera(camera);
      }
    });
  };

  const handleZoomOut = () => {
    mapRef.current?.getCamera().then((camera) => {
      if (camera.zoom !== undefined) {
        camera.zoom -= 1;
        mapRef.current?.animateCamera(camera);
      }
    });
  };

  const toggleMapType = () => {
    updateSettings({ mapMode: settings.mapMode === 'standard' ? 'satellite' : 'standard' });
  };

  const clearSearch = () => {
    setSearchQuery('');
    setSearchResults([]);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
  };

  const handleCategoryPress = (category: string) => {
    if (activeCategory === category) {
      setActiveCategory(null);
      setSearchResults([]);
    } else {
      setActiveCategory(category);
      const results = SearchService.searchByCategory(category);
      setSearchResults(results as any);
    }
  };

  return {
    mapRef,
    bottomSheetRef,
    currentLocation,
    mapType: settings.mapMode,
    searchQuery,
    searchResults,
    selectedPlace,
    recentSearches,
    isMapReady,
    snapPoints,
    initialRegion,
    offlineData,
    isOffline,
    activeCategory,
    categoryChips,
    searchPlaceholder,
    settings,
    updateSettings,
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
  };
}

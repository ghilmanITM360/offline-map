/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useRef, useMemo, useEffect, useCallback } from 'react';
import MapView, { Region } from 'react-native-maps';
import BottomSheet from '@gorhom/bottom-sheet';
import { useAppStore } from '../store/useAppStore';
import { Place } from '../models/types';
import { SearchService } from '../services/SearchService';
import { GPSManagerService } from '../services/GPSManagerService';
import { RoutingService } from '../services/RoutingService';

export function useHomeViewModel() {
  const mapRef = useRef<MapView>(null);
  const bottomSheetRef = useRef<BottomSheet>(null);

  const currentLocation = useAppStore((s) => s.currentLocation);
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

  const handleRecenter = () => {
    if (currentLocation && mapRef.current) {
      updateSettings({ autoFollowLocation: true });
      mapRef.current.animateToRegion(
        {
          ...currentLocation,
          latitudeDelta: 0.005,
          longitudeDelta: 0.005,
        },
        1000
      );
    }
  };

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
    settings,
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

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

export function useHomeViewModel() {
  const mapRef = useRef<MapView>(null);
  const bottomSheetRef = useRef<BottomSheet>(null);

  const currentLocation = useAppStore((s) => s.currentLocation); // fixed: subscribe only to current location updates needed by the home viewmodel
  const hasLocationPermission = useAppStore((s) => s.hasLocationPermission); // fixed: keep the GPS listener subscription focused on permission changes
  const settings = useAppStore((s) => s.settings); // fixed: subscribe only to the persisted settings slice used by the map
  const recentSearches = useAppStore((s) => s.recentSearches); // fixed: subscribe only to recent-search changes that affect the home sheet
  const offlineData = useAppStore((s) => s.offlineData); // fixed: subscribe only to offline-map metadata used by the screen
  const hasInternet = useAppStore((s) => s.hasInternet); // fixed: subscribe only to connectivity changes relevant to offline mode
  const selectedPlace = useAppStore((s) => s.selectedPlace); // fixed: subscribe only to the selected place for detail rendering
  const searchQuery = useAppStore((s) => s.searchQuery); // fixed: subscribe only to the current search query
  const searchResults = useAppStore((s) => s.searchResults); // fixed: subscribe only to search results that feed the sheet
  const isNavigating = useAppStore((s) => s.isNavigating); // fixed: subscribe only to navigation-mode changes that affect auto-follow
  const updateSettings = useAppStore((s) => s.updateSettings); // fixed: keep action references scoped to the values this hook mutates
  const addRecentSearch = useAppStore((s) => s.addRecentSearch); // fixed: keep action references scoped to recent-search mutations
  const setSelectedPlace = useAppStore((s) => s.setSelectedPlace); // fixed: keep action references scoped to place selection changes
  const setSearchQuery = useAppStore((s) => s.setSearchQuery); // fixed: keep action references scoped to search query updates
  const setSearchResults = useAppStore((s) => s.setSearchResults); // fixed: keep action references scoped to search result updates

  const isOffline = !hasInternet;
  const [isMapReady, setIsMapReady] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const snapPoints = useMemo(() => ['15%', '50%', '92%'], []);

  const initialRegion: Region = {
    latitude: 24.9685,
    longitude: 67.0015,
    latitudeDelta: 0.01,
    longitudeDelta: 0.01,
  };

  const handleGPS = useCallback(
    (coord: { latitude: number; longitude: number }) => {
      if (settings.autoFollowLocation && mapRef.current && !isNavigating) { // fixed: use the persisted setting as the single auto-follow source of truth
        mapRef.current.animateToRegion(
          {
            ...coord,
            latitudeDelta: 0.005,
            longitudeDelta: 0.005,
          },
          1000
        );
      }
    },
    [isNavigating, settings.autoFollowLocation] // fixed: react to live auto-follow setting changes
  );

  // Re-register the GPS listener whenever handleGPS reference changes so the
  // callback always reflects current state. Guard with hasLocationPermission so
  // we only attach after permission has been granted.
  useEffect(() => {
    if (!hasLocationPermission) return;
    GPSManagerService.addListener(handleGPS);
    return () => {
      GPSManagerService.removeListener(handleGPS);
    };
  }, [handleGPS, hasLocationPermission]);

  const handleSearch = (text: string) => {
    setSearchQuery(text);
    if (text.length > 1) {
      const results = SearchService.search(text);
      setSearchResults(results as any);
    } else {
      setSearchResults([]);
    }
  };

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
      updateSettings({ autoFollowLocation: true }); // fixed: recenter now updates the same persisted auto-follow setting
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
    setIsMapReady,
    handleSearch,
    handlePlaceSelect,
    handleRecenter,
    handleZoomIn,
    handleZoomOut,
    toggleMapType,
    clearSearch,
    handleCategoryPress,
    setSelectedPlace,
  };
}

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useRef, useMemo, useEffect, useCallback } from 'react';
import MapView, { Region } from 'react-native-maps';
import BottomSheet from '@gorhom/bottom-sheet';
import * as Location from 'expo-location';
import { useAppStore } from '../store/useAppStore';
import { Place } from '../models/types';
import { SearchService } from '../services/SearchService';

export function useHomeViewModel() {
  const mapRef = useRef<MapView>(null);
  const bottomSheetRef = useRef<BottomSheet>(null);
  
  const { 
    currentLocation, 
    setCurrentLocation, 
    setHasLocationPermission,
    settings,
    updateSettings,
    addRecentSearch,
    recentSearches,
    offlineData,
    hasInternet,
    selectedPlace,
    setSelectedPlace,
    searchQuery,
    setSearchQuery,
    searchResults,
    setSearchResults,
    autoFollowEnabled,
    setAutoFollowEnabled,
    isNavigating
  } = useAppStore();

  const isOffline = !hasInternet;
  const [isMapReady, setIsMapReady] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const snapPoints = useMemo(() => ['25%', '50%', '90%'], []);

  const initialRegion: Region = {
    latitude: 24.9685,
    longitude: 67.0015,
    latitudeDelta: 0.01,
    longitudeDelta: 0.01,
  };

  const requestPermissions = useCallback(async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    setHasLocationPermission(status === 'granted');
    return status === 'granted';
  }, [setHasLocationPermission]);

  useEffect(() => {
    (async () => {
      const granted = await requestPermissions();
      if (!granted) return;

      const subscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          timeInterval: 1000,
          distanceInterval: 1,
        },
        (location) => {
          const newLoc = {
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
            heading: location.coords.heading || 0,
            accuracy: location.coords.accuracy || 0
          };
          setCurrentLocation(newLoc);
          
          if (autoFollowEnabled && mapRef.current && !isNavigating) {
            mapRef.current.animateToRegion({
              ...newLoc,
              latitudeDelta: 0.005,
              longitudeDelta: 0.005,
            }, 1000);
          }
        }
      );

      return () => subscription.remove();
    })();
  }, [autoFollowEnabled, isNavigating, requestPermissions, setCurrentLocation]);

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
    mapRef.current?.animateToRegion({
      ...place.coordinate,
      latitudeDelta: 0.002,
      longitudeDelta: 0.002,
    }, 1000);
  };

  const handleRecenter = () => {
    if (currentLocation && mapRef.current) {
      setAutoFollowEnabled(true);
      mapRef.current.animateToRegion({
        ...currentLocation,
        latitudeDelta: 0.005,
        longitudeDelta: 0.005,
      }, 1000);
    }
  };

  const handleZoomIn = () => {
    mapRef.current?.getCamera().then(camera => {
      if (camera.zoom !== undefined) {
        camera.zoom += 1;
        mapRef.current?.animateCamera(camera);
      }
    });
  };

  const handleZoomOut = () => {
    mapRef.current?.getCamera().then(camera => {
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
    setIsMapReady,
    handleSearch,
    handlePlaceSelect,
    handleRecenter,
    handleZoomIn,
    handleZoomOut,
    toggleMapType,
    clearSearch,
    handleCategoryPress,
    setSelectedPlace
  };
}

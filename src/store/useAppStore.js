/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DEFAULT_DOWNLOAD_STATE, } from '../models/types';
export const useAppStore = create()(persist((set, get) => ({
    // --- Offline map ---
    offlineData: { isDownloaded: false },
    setOfflineDownloaded: (val) => set((state) => ({
        offlineData: {
            ...state.offlineData,
            isDownloaded: val,
            downloadDate: val ? new Date().toISOString() : undefined,
            sizeMB: val ? 24.5 : 0,
        },
    })),
    setOfflineMapAvailable: (val) => set((state) => ({ offlineData: { ...state.offlineData, isDownloaded: val } })),
    updateOfflineData: (data) => set((state) => ({ offlineData: { ...state.offlineData, ...data } })),
    // --- Download flow ---
    downloadState: DEFAULT_DOWNLOAD_STATE,
    setDownloadState: (partial) => set((state) => ({ downloadState: { ...state.downloadState, ...partial } })),
    resetDownloadState: () => set({ downloadState: DEFAULT_DOWNLOAD_STATE }),
    // --- Settings ---
    settings: {
        mapMode: 'standard',
        autoFollowLocation: true,
        keepNorthFixed: false,
        darkMode: false,
        voiceInstructions: true,
        walkingSpeed: 1.4,
        autoReroute: true,
        distanceUnit: 'meters',
        language: 'en',
        mapSize: 24.5,
    },
    updateSettings: (newSettings) => set((state) => ({ settings: { ...state.settings, ...newSettings } })),
    // --- GPS ---
    currentLocation: null,
    setCurrentLocation: (loc) => {
        set({ currentLocation: loc });
        if (loc)
            set({ lastKnownLocation: loc });
    },
    lastKnownLocation: null,
    setLastKnownLocation: (loc) => set({ lastKnownLocation: loc }),
    snappedLocation: null,
    setSnappedLocation: (loc) => set({ snappedLocation: loc }),
    // --- Permissions / connectivity ---
    hasLocationPermission: false,
    setHasLocationPermission: (val) => set({ hasLocationPermission: val }),
    hasInternet: true,
    setHasInternet: (val) => set({ hasInternet: val }),
    // --- Navigation ---
    isNavigating: false,
    destination: null,
    startNavigation: (dest) => set({ isNavigating: true, destination: dest }),
    stopNavigation: () => set({ isNavigating: false, destination: null, activeRoute: null, routeInstructions: [], reroutePending: false }),
    activeRoute: null,
    setActiveRoute: (route) => set({ activeRoute: route }),
    routeInstructions: [],
    setRouteInstructions: (instructions) => set({ routeInstructions: instructions }),
    reroutePending: false,
    setReroutePending: (val) => set({ reroutePending: val }),
    // --- Place selection ---
    selectedPlace: null,
    setSelectedPlace: (place) => set({ selectedPlace: place }),
    // --- Route planner ---
    routePlannerOrigin: null,
    routePlannerDest: null,
    setRoutePlannerOrigin: (place) => set({ routePlannerOrigin: place }),
    setRoutePlannerDest: (place) => set({ routePlannerDest: place }),
    clearRoutePlanner: () => set({ routePlannerOrigin: null, routePlannerDest: null, routeAlternatives: [], selectedRouteIndex: 0 }),
    // --- Route alternatives ---
    routeAlternatives: [],
    setRouteAlternatives: (alts) => set({ routeAlternatives: alts }),
    selectedRouteIndex: 0,
    setSelectedRouteIndex: (idx) => set({ selectedRouteIndex: idx }),
    // --- Search ---
    searchQuery: '',
    setSearchQuery: (query) => set({ searchQuery: query }),
    searchResults: [],
    setSearchResults: (results) => set({ searchResults: results }),
    recentSearches: [],
    addRecentSearch: (place) => set((state) => {
        const filtered = state.recentSearches.filter((p) => p.id !== place.id);
        return { recentSearches: [place, ...filtered].slice(0, 10) };
    }),
    clearRecentSearches: () => set({ recentSearches: [] }),
    // --- Favorites ---
    favorites: [],
    addFavorite: (fav) => set((state) => {
        const exists = state.favorites.find((f) => f.placeId === fav.placeId);
        if (exists)
            return state;
        return { favorites: [...state.favorites, fav] };
    }),
    removeFavorite: (placeId) => set((state) => ({ favorites: state.favorites.filter((f) => f.placeId !== placeId) })),
    isFavorite: (placeId) => get().favorites.some((f) => f.placeId === placeId),
    // --- UI ---
    isMuted: false,
    setIsMuted: (val) => set({ isMuted: val }),
}), {
    name: 'ijtema-app-store',
    storage: createJSONStorage(() => AsyncStorage),
    // Only persist these keys — runtime GPS and transient UI state are not persisted
    partialize: (state) => ({
        offlineData: state.offlineData,
        downloadState: state.downloadState,
        settings: state.settings,
        recentSearches: state.recentSearches,
        favorites: state.favorites,
        lastKnownLocation: state.lastKnownLocation,
    }),
}));

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  UserSettings,
  OfflineData,
  Place,
  Coordinate,
  RoutePreview,
  RouteAlternative,
  NavigationInstruction,
  SearchResult,
  DownloadState,
  DEFAULT_DOWNLOAD_STATE,
  FavoritePlace,
} from '../models/types';

export type RouteSelectionMode = 'idle' | 'selectingStart' | 'selectingDestination';

interface AppState {
  // --- Offline map ---
  offlineData: OfflineData;
  setOfflineDownloaded: (val: boolean) => void;
  setOfflineMapAvailable: (val: boolean) => void;
  updateOfflineData: (data: Partial<OfflineData & { version?: string; lastUpdated?: string }>) => void;

  // --- Download flow ---
  downloadState: DownloadState;
  setDownloadState: (state: Partial<DownloadState>) => void;
  resetDownloadState: () => void;

  // --- Settings (persisted) ---
  settings: UserSettings;
  updateSettings: (newSettings: Partial<UserSettings>) => void;

  // --- GPS ---
  currentLocation: Coordinate | null;
  setCurrentLocation: (loc: Coordinate | null) => void;
  lastKnownLocation: Coordinate | null;
  setLastKnownLocation: (loc: Coordinate | null) => void;
  snappedLocation: Coordinate | null;
  setSnappedLocation: (loc: Coordinate | null) => void;

  // --- Permissions / connectivity ---
  hasLocationPermission: boolean;
  setHasLocationPermission: (val: boolean) => void;
  hasInternet: boolean;
  setHasInternet: (val: boolean) => void;

  // --- Navigation ---
  isNavigating: boolean;
  destination: Place | null;
  startNavigation: (destination: Place, route?: RoutePreview | null, instructions?: NavigationInstruction[]) => void;
  stopNavigation: () => void;
  activeRoute: RoutePreview | null;
  setActiveRoute: (route: RoutePreview | null) => void;
  routeInstructions: NavigationInstruction[];
  setRouteInstructions: (instructions: NavigationInstruction[]) => void;
  reroutePending: boolean;
  setReroutePending: (val: boolean) => void;

  // --- Place selection ---
  selectedPlace: Place | null;
  setSelectedPlace: (place: Place | null) => void;

  // --- Route planner (From/To, Phase 3) ---
  routePlannerOrigin: Place | null;       // null = use current GPS
  routePlannerDest: Place | null;
  setRoutePlannerOrigin: (place: Place | null) => void;
  setRoutePlannerDest: (place: Place | null) => void;
  clearRoutePlanner: () => void;
  routeSelectionMode: RouteSelectionMode;
  setRouteSelectionMode: (mode: RouteSelectionMode) => void;

  // --- Route alternatives (Phase 9) ---
  routeAlternatives: RouteAlternative[];
  setRouteAlternatives: (alts: RouteAlternative[]) => void;
  selectedRouteIndex: number;
  setSelectedRouteIndex: (idx: number) => void;

  // --- Search ---
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  searchResults: SearchResult[];
  setSearchResults: (results: SearchResult[]) => void;
  recentSearches: Place[];
  addRecentSearch: (place: Place) => void;
  clearRecentSearches: () => void;

  // --- Favorites (persisted) ---
  favorites: FavoritePlace[];
  addFavorite: (fav: FavoritePlace) => void;
  removeFavorite: (placeId: string) => void;
  isFavorite: (placeId: string) => boolean;

  // --- UI state ---
  isMuted: boolean;
  setIsMuted: (val: boolean) => void;
  showGraphNodes: boolean;
  setShowGraphNodes: (val: boolean) => void;
  showRastaNames: boolean;
  setShowRastaNames: (val: boolean) => void;
  showBlockPolygons: boolean;
  setShowBlockPolygons: (val: boolean) => void;
  showRouteDiagnostics: boolean;
  setShowRouteDiagnostics: (val: boolean) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      // --- Offline map ---
      offlineData: { isDownloaded: false },
      setOfflineDownloaded: (val) =>
        set((state) => ({
          offlineData: {
            ...state.offlineData,
            isDownloaded: val,
            downloadDate: val ? new Date().toISOString() : undefined,
            sizeMB: val ? 24.5 : 0,
          },
        })),
      setOfflineMapAvailable: (val) =>
        set((state) => ({ offlineData: { ...state.offlineData, isDownloaded: val } })),
      updateOfflineData: (data) =>
        set((state) => ({ offlineData: { ...state.offlineData, ...data } })),

      // --- Download flow ---
      downloadState: DEFAULT_DOWNLOAD_STATE,
      setDownloadState: (partial) =>
        set((state) => ({ downloadState: { ...state.downloadState, ...partial } })),
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
      updateSettings: (newSettings) =>
        set((state) => ({ settings: { ...state.settings, ...newSettings } })),

      // --- GPS ---
      currentLocation: null,
      setCurrentLocation: (loc) => {
        set({ currentLocation: loc });
        if (loc) set({ lastKnownLocation: loc });
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
      startNavigation: (dest, route = null, instructions = []) =>
        set({
          isNavigating: true,
          destination: dest,
          activeRoute: route,
          routeInstructions: instructions,
        }),
      stopNavigation: () =>
        set({ isNavigating: false, destination: null, activeRoute: null, routeInstructions: [], reroutePending: false }),
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
      clearRoutePlanner: () =>
        set({
          routePlannerOrigin: null,
          routePlannerDest: null,
          routeAlternatives: [],
          selectedRouteIndex: 0,
          activeRoute: null,
          routeInstructions: [],
        }),
      routeSelectionMode: 'idle',
      setRouteSelectionMode: (mode) => set({ routeSelectionMode: mode }),

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
      addRecentSearch: (place) =>
        set((state) => {
          const filtered = state.recentSearches.filter((p) => p.id !== place.id);
          return { recentSearches: [place, ...filtered].slice(0, 10) };
        }),
      clearRecentSearches: () => set({ recentSearches: [] }),

      // --- Favorites ---
      favorites: [],
      addFavorite: (fav) =>
        set((state) => {
          const exists = state.favorites.find((f) => f.placeId === fav.placeId);
          if (exists) return state;
          return { favorites: [...state.favorites, fav] };
        }),
      removeFavorite: (placeId) =>
        set((state) => ({ favorites: state.favorites.filter((f) => f.placeId !== placeId) })),
      isFavorite: (placeId) => get().favorites.some((f) => f.placeId === placeId),

      // --- UI ---
      isMuted: false,
      setIsMuted: (val) => set({ isMuted: val }),
      showGraphNodes: false,
      setShowGraphNodes: (val) => set({ showGraphNodes: val }),
      showRastaNames: false,
      setShowRastaNames: (val) => set({ showRastaNames: val }),
      showBlockPolygons: true,
      setShowBlockPolygons: (val) => set({ showBlockPolygons: val }),
      showRouteDiagnostics: false,
      setShowRouteDiagnostics: (val) => set({ showRouteDiagnostics: val }),
    }),
    {
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
        showGraphNodes: state.showGraphNodes,
        showRastaNames: state.showRastaNames,
        showBlockPolygons: state.showBlockPolygons,
        showRouteDiagnostics: state.showRouteDiagnostics,
      }),
    }
  )
);

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
  V2ActiveRoute,
  V2NavigationInstruction,
  RouteAlternative,
  NavigationInstruction,
  SearchResult,
  DownloadState,
  DEFAULT_DOWNLOAD_STATE,
  FavoritePlace,
  OfflineMapStatus,
  LocationSource,
} from '../models/types';
import { MapFeatureFlagsService } from '../services/MapFeatureFlagsService';
import { V2PlaceAdapter } from '../services/V2PlaceAdapter';

export type RouteSelectionMode = 'idle' | 'selectingStart' | 'selectingDestination';

function sanitizePersistedPlace(place: Place | null | undefined): Place | null {
  if (!place) return null;
  if (!MapFeatureFlagsService.useIjtemaV2Map()) return place;
  return place.sourceVersion === 'v2' ? place : null;
}

function sanitizePersistedPlaces(places: Place[] | undefined): Place[] {
  if (!Array.isArray(places)) return [];
  return places
    .map((place) => sanitizePersistedPlace(place))
    .filter((place): place is Place => Boolean(place));
}

function sanitizePersistedFavorite(favorite: FavoritePlace): FavoritePlace | null {
  if (!MapFeatureFlagsService.useIjtemaV2Map()) return favorite;
  return V2PlaceAdapter.getPlaceById(favorite.placeId) ? favorite : null;
}

function sanitizePersistedFavorites(favorites: FavoritePlace[] | undefined): FavoritePlace[] {
  if (!Array.isArray(favorites)) return [];
  return favorites
    .map((favorite) => sanitizePersistedFavorite(favorite))
    .filter((favorite): favorite is FavoritePlace => Boolean(favorite));
}

interface AppState {
  // --- Offline map ---
  offlineData: OfflineData;
  offlineMapStatus: OfflineMapStatus;
  offlineMapStatusMessage: string | null;
  setOfflineDownloaded: (val: boolean) => void;
  setOfflineMapAvailable: (val: boolean) => void;
  setOfflineMapStatus: (status: OfflineMapStatus, message?: string | null) => void;
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
  currentLocationSource: LocationSource | null;
  setCurrentLocation: (loc: Coordinate | null, source?: LocationSource) => void;
  lastKnownLocation: Coordinate | null;
  lastKnownLocationUpdatedAt: string | null;
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
  startNavigation: (destination: Place, route?: RoutePreview | V2ActiveRoute | null, instructions?: Array<NavigationInstruction | V2NavigationInstruction>) => void;
  stopNavigation: () => void;
  activeRoute: RoutePreview | V2ActiveRoute | null;
  setActiveRoute: (route: RoutePreview | V2ActiveRoute | null) => void;
  routeInstructions: Array<NavigationInstruction | V2NavigationInstruction>;
  setRouteInstructions: (instructions: Array<NavigationInstruction | V2NavigationInstruction>) => void;
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
  showGatesLayer: boolean;
  setShowGatesLayer: (val: boolean) => void;
  showRastasLayer: boolean;
  setShowRastasLayer: (val: boolean) => void;
  showSpecialRoutesLayer: boolean;
  setShowSpecialRoutesLayer: (val: boolean) => void;
  showRouteDiagnostics: boolean;
  setShowRouteDiagnostics: (val: boolean) => void;
  developerModeEnabled: boolean;
  setDeveloperModeEnabled: (val: boolean) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      // --- Offline map ---
      offlineData: { isDownloaded: false },
      offlineMapStatus: 'not_downloaded',
      offlineMapStatusMessage: null,
      setOfflineDownloaded: (val) =>
        set((state) => ({
          offlineData: {
            ...state.offlineData,
            isDownloaded: val,
            downloadDate: val ? new Date().toISOString() : undefined,
            sizeMB: val ? 24.5 : 0,
          },
          offlineMapStatus: val ? 'downloaded' : 'not_downloaded',
          offlineMapStatusMessage: null,
        })),
      setOfflineMapAvailable: (val) =>
        set((state) => ({
          offlineData: { ...state.offlineData, isDownloaded: val },
          offlineMapStatus: val ? 'downloaded' : 'not_downloaded',
          offlineMapStatusMessage: null,
        })),
      setOfflineMapStatus: (status, message = null) =>
        set(() => ({
          offlineMapStatus: status,
          offlineMapStatusMessage: message,
        })),
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
        autoFollowLocation: false,
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
      currentLocationSource: null,
      setCurrentLocation: (loc, source = 'live') => {
        const now = new Date().toISOString();
        set({ currentLocation: loc, currentLocationSource: loc ? source : null });
        if (loc && source !== 'remembered' && source !== 'manual') {
          set({ lastKnownLocation: loc, lastKnownLocationUpdatedAt: now });
        }
      },
      lastKnownLocation: null,
      lastKnownLocationUpdatedAt: null,
      setLastKnownLocation: (loc) => set({ lastKnownLocation: loc, lastKnownLocationUpdatedAt: loc ? new Date().toISOString() : null }),
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
      showGatesLayer: true,
      setShowGatesLayer: (val) => set({ showGatesLayer: val }),
      showRastasLayer: true,
      setShowRastasLayer: (val) => set({ showRastasLayer: val }),
      showSpecialRoutesLayer: true,
      setShowSpecialRoutesLayer: (val) => set({ showSpecialRoutesLayer: val }),
      showRouteDiagnostics: false,
      setShowRouteDiagnostics: (val) => set({ showRouteDiagnostics: val }),
      developerModeEnabled: false,
      setDeveloperModeEnabled: (val) => set({ developerModeEnabled: val }),
    }),
    {
      name: 'ijtema-app-store',
      storage: createJSONStorage(() => AsyncStorage),
      version: 2,
      migrate: (persistedState) => {
        if (!persistedState || typeof persistedState !== 'object') return persistedState;
        const state = persistedState as Partial<AppState>;
        return {
          ...state,
          recentSearches: sanitizePersistedPlaces(state.recentSearches),
          favorites: sanitizePersistedFavorites(state.favorites),
          selectedPlace: sanitizePersistedPlace(state.selectedPlace),
          routePlannerOrigin: sanitizePersistedPlace(state.routePlannerOrigin),
          routePlannerDest: sanitizePersistedPlace(state.routePlannerDest),
        };
      },
      // Only persist these keys — runtime GPS and transient UI state are not persisted
      partialize: (state) => ({
        offlineData: state.offlineData,
        offlineMapStatus: state.offlineMapStatus,
        offlineMapStatusMessage: state.offlineMapStatusMessage,
        downloadState: state.downloadState,
        settings: state.settings,
        recentSearches: sanitizePersistedPlaces(state.recentSearches),
        favorites: sanitizePersistedFavorites(state.favorites),
        lastKnownLocation: state.lastKnownLocation,
        lastKnownLocationUpdatedAt: state.lastKnownLocationUpdatedAt,
        showGraphNodes: state.showGraphNodes,
        showRastaNames: state.showRastaNames,
        showBlockPolygons: state.showBlockPolygons,
        showGatesLayer: state.showGatesLayer,
        showRastasLayer: state.showRastasLayer,
        showSpecialRoutesLayer: state.showSpecialRoutesLayer,
        showRouteDiagnostics: state.showRouteDiagnostics,
        developerModeEnabled: state.developerModeEnabled,
      }),
    }
  )
);

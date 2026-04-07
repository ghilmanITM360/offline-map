/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { create } from 'zustand';
import { 
  UserSettings, 
  OfflineData, 
  Place, 
  Coordinate, 
  RoutePreview, 
  NavigationInstruction, 
  SearchResult
} from '../models/types';

interface AppState {
  offlineData: OfflineData;
  setOfflineDownloaded: (val: boolean) => void;
  setOfflineMapAvailable: (val: boolean) => void;
  updateOfflineData: (data: Partial<OfflineData & { version?: string; lastUpdated?: string }>) => void;
  downloadProgress: number;
  setDownloadProgress: (progress: number) => void;
  
  settings: UserSettings;
  updateSettings: (newSettings: Partial<UserSettings>) => void;
  
  currentLocation: Coordinate | null;
  setCurrentLocation: (loc: Coordinate | null) => void;
  snappedLocation: Coordinate | null;
  setSnappedLocation: (loc: Coordinate | null) => void;
  
  hasLocationPermission: boolean;
  setHasLocationPermission: (val: boolean) => void;
  hasInternet: boolean;
  setHasInternet: (val: boolean) => void;
  
  isNavigating: boolean;
  destination: Place | null;
  startNavigation: (destination: Place) => void;
  stopNavigation: () => void;
  activeRoute: RoutePreview | null;
  setActiveRoute: (route: RoutePreview | null) => void;
  routeInstructions: NavigationInstruction[];
  setRouteInstructions: (instructions: NavigationInstruction[]) => void;
  
  selectedPlace: Place | null;
  setSelectedPlace: (place: Place | null) => void;
  
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  searchResults: SearchResult[];
  setSearchResults: (results: SearchResult[]) => void;
  recentSearches: Place[];
  addRecentSearch: (place: Place) => void;
  
  autoFollowEnabled: boolean;
  setAutoFollowEnabled: (val: boolean) => void;
  isMuted: boolean;
  setIsMuted: (val: boolean) => void;
}

export const useAppStore = create<AppState>((set) => ({
  offlineData: { isDownloaded: false },
  setOfflineDownloaded: (val) => set((state) => ({
    offlineData: { ...state.offlineData, isDownloaded: val, downloadDate: val ? new Date().toISOString() : undefined, sizeMB: val ? 24.5 : 0 }
  })),
  setOfflineMapAvailable: (val) => set((state) => ({
    offlineData: { ...state.offlineData, isDownloaded: val }
  })),
  updateOfflineData: (data) => set((state) => ({
    offlineData: { ...state.offlineData, ...data }
  })),
  downloadProgress: 0,
  setDownloadProgress: (progress) => set({ downloadProgress: progress }),
  
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
    mapSize: 24.5
  },
  updateSettings: (newSettings) => set((state) => ({
    settings: { ...state.settings, ...newSettings }
  })),
  
  currentLocation: null,
  setCurrentLocation: (loc) => set({ currentLocation: loc }),
  snappedLocation: null,
  setSnappedLocation: (loc) => set({ snappedLocation: loc }),
  
  hasLocationPermission: false,
  setHasLocationPermission: (val) => set({ hasLocationPermission: val }),
  hasInternet: true,
  setHasInternet: (val) => set({ hasInternet: val }),
  
  isNavigating: false,
  destination: null,
  startNavigation: (dest) => set({ isNavigating: true, destination: dest }),
  stopNavigation: () => set({ isNavigating: false, destination: null, activeRoute: null, routeInstructions: [] }),
  activeRoute: null,
  setActiveRoute: (route) => set({ activeRoute: route }),
  routeInstructions: [],
  setRouteInstructions: (instructions) => set({ routeInstructions: instructions }),
  
  selectedPlace: null,
  setSelectedPlace: (place) => set({ selectedPlace: place }),
  
  searchQuery: '',
  setSearchQuery: (query) => set({ searchQuery: query }),
  searchResults: [],
  setSearchResults: (results) => set({ searchResults: results }),
  recentSearches: [],
  addRecentSearch: (place) => set((state) => {
    const filtered = state.recentSearches.filter(p => p.id !== place.id);
    return { recentSearches: [place, ...filtered].slice(0, 10) };
  }),
  
  autoFollowEnabled: true,
  setAutoFollowEnabled: (val) => set({ autoFollowEnabled: val }),
  isMuted: false,
  setIsMuted: (val) => set({ isMuted: val }),
}));

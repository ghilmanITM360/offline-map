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
import { isValidCoordinate } from '../utils/isValidCoordinate';
import { UnfinishedJourney, createUnfinishedJourney, parseUnfinishedJourney } from '../utils/unfinishedJourney';

export type RouteSelectionMode = 'idle' | 'selectingStart' | 'selectingDestination';
/** What the Directory is being opened to choose; null = plain browsing. */
export type DirectoryPurpose = 'start' | 'destination';
/** A Directory answer. Quick start options carry no place: the initiator already owns the location. */
export type DirectoryChoice =
  | { purpose: DirectoryPurpose; place: Place }
  | { purpose: 'start'; quick: 'current_location' | 'last_known' };

function sanitizePersistedPlace(place: Place | null | undefined): Place | null {
  if (!place || typeof place !== 'object' || Array.isArray(place) || typeof place.id !== 'string') return null;
  if (!MapFeatureFlagsService.useIjtemaV2Map()) return place;
  return place.sourceVersion === 'v2' ? place : null;
}

function sanitizePersistedPlaces(places: unknown): Place[] {
  if (!Array.isArray(places)) return [];
  return places
    .map((place) => sanitizePersistedPlace(place))
    .filter((place): place is Place => Boolean(place));
}

function sanitizePersistedFavorite(favorite: FavoritePlace | null | undefined): FavoritePlace | null {
  if (!favorite || typeof favorite !== 'object' || Array.isArray(favorite) || typeof favorite.placeId !== 'string') return null;
  if (!MapFeatureFlagsService.useIjtemaV2Map()) return favorite;
  return V2PlaceAdapter.getPlaceById(favorite.placeId) ? favorite : null;
}

function sanitizePersistedFavorites(favorites: unknown): FavoritePlace[] {
  if (!Array.isArray(favorites)) return [];
  return favorites
    .map((favorite) => sanitizePersistedFavorite(favorite))
    .filter((favorite): favorite is FavoritePlace => Boolean(favorite));
}

function sanitizePersistedSettings(value: unknown, defaults: UserSettings): UserSettings {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return defaults;
  const persisted = value as Record<string, unknown>;
  const settings = { ...defaults };
  if (persisted.mapMode === 'standard' || persisted.mapMode === 'satellite' || persisted.mapMode === 'hybrid') {
    settings.mapMode = persisted.mapMode;
  }
  if (persisted.distanceUnit === 'meters' || persisted.distanceUnit === 'feet') {
    settings.distanceUnit = persisted.distanceUnit;
  }
  if (persisted.language === 'en' || persisted.language === 'ur') settings.language = persisted.language;
  const booleanKeys = ['autoFollowLocation', 'keepNorthFixed', 'darkMode', 'voiceInstructions', 'autoReroute'] as const;
  for (const key of booleanKeys) {
    if (typeof persisted[key] === 'boolean') settings[key] = persisted[key];
  }
  for (const key of ['walkingSpeed', 'mapSize'] as const) {
    const candidate = persisted[key];
    if (typeof candidate === 'number' && Number.isFinite(candidate) && candidate > 0) settings[key] = candidate;
  }
  return settings;
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
  // Android permission precision ('fine'/'coarse'/'none'); iOS or pre-check defaults to 'none'.
  // Independent of fix accuracy in meters — a fine-permission fix can still be a weak (>50m) fix.
  locationPermissionPrecision: 'fine' | 'coarse' | 'none';
  setLocationPermissionPrecision: (val: 'fine' | 'coarse' | 'none') => void;
  hasInternet: boolean;
  setHasInternet: (val: boolean) => void;

  // --- Cold-launch camera (Phase: map-first nav) ---
  // False only until the map's very first onMapReady resolves its cold-launch camera
  // move (venue-overview fit) — distinct from OnboardingStatusService's welcome-screen
  // flag, which flips true earlier, at Welcome, before Main ever mounts.
  hasSeenMapOverview: boolean;
  setHasSeenMapOverview: (val: boolean) => void;

  // --- First-time "you are here" location tooltip (Explore Mode parity fix) ---
  // Flips true the first time the location tooltip has been shown once — never shown again.
  hasSeenLocationTutorial: boolean;
  setHasSeenLocationTutorial: (val: boolean) => void;

  // --- Navigation ---
  // `isNavigating` is the single raw "a nav session is bracketed by
  // startNavigation()/stopNavigation()" signal — this store is its only writer (see those two
  // actions below; nothing else may `set({ isNavigating: ... })`). MapMode (useMapMode.ts) is a
  // stricter, *derived* concept built on top of it — NAVIGATION/ARRIVAL additionally require the
  // active route to match the live feature-flag/source-version shape (see
  // NavigationViewModelV2's `route` and NavigationViewModel(v1)'s `destination`-gated route) —
  // so MapMode can legitimately read false while isNavigating is true (e.g. an emergency
  // EXPO_PUBLIC_USE_IJTEMA_V2_NAVIGATION=false rollback still runs the v2 nav runtime but hides
  // its chrome). Direct reads of this raw field are sanctioned ONLY where a consumer genuinely
  // needs the primitive session-active signal ahead of/independent from MapMode — currently
  // HomeViewModel.ts (camera-follow/compass gating, which must keep working even if MapMode's
  // NAVIGATION chrome is flag-suppressed) and HomeScreen.tsx's activePreviewRoute memo (MapMode
  // itself depends on activePreviewRoute, so that one consumer, structurally, cannot read mode
  // without a circular dependency). See scripts/test-navigation-architecture-audit.ts Finding 6
  // for the regression guard enforcing this closed list — add a new direct reader there too.
  isNavigating: boolean;
  navigationSessionId: number;
  destination: Place | null;
  startNavigation: (destination: Place, route?: RoutePreview | V2ActiveRoute | null, instructions?: Array<NavigationInstruction | V2NavigationInstruction>) => void;
  stopNavigation: () => void;
  // #139 Option B: coordinate-free marker that survives process death (the ONLY navigation fact
  // that does). Set by startNavigation, cleared by stopNavigation / arrival / dismiss / recovery.
  // Read it through selectUnfinishedJourney so the 2 h expiry is applied on every read.
  unfinishedJourney: UnfinishedJourney | null;
  clearUnfinishedJourney: () => void;
  /**
   * "Get new route": consumes the marker and hands its destination to the normal place-select
   * flow (pendingDirectorySelection). Never starts or resumes anything; the next Start
   * Navigation is a brand new session. Returns the place, or null when there is nothing valid.
   */
  beginRecovery: () => Place | null;
  activeRoute: RoutePreview | V2ActiveRoute | null;
  setActiveRoute: (route: RoutePreview | V2ActiveRoute | null) => void;
  routeInstructions: Array<NavigationInstruction | V2NavigationInstruction>;
  setRouteInstructions: (instructions: Array<NavigationInstruction | V2NavigationInstruction>) => void;
  reroutePending: boolean;
  setReroutePending: (val: boolean) => void;

  // --- Place selection ---
  selectedPlace: Place | null;
  setSelectedPlace: (place: Place | null) => void;

  // --- Locations directory hand-off ---
  // Ephemeral bridge from the Locations Directory screen (a RootStack sibling of Main,
  // reached before or pushed on top of it) into HomeViewModel's existing
  // handlePlaceSelect — never persisted, cleared the instant it's consumed. See
  // useHomeViewModel's consuming effect. Deliberately not `selectedPlace` itself: that
  // field belongs to HomeViewModel/CameraManager's synchronous selection flow, and the
  // directory screen may set this before HomeScreen has even mounted.
  pendingDirectorySelection: Place | null;
  setPendingDirectorySelection: (place: Place | null) => void;
  // The Directory is the one place chooser. An initiator (Get Directions) sets the purpose before opening it, the
  // Directory shows that question and, instead of browsing, stores the chosen place in directoryChoice and returns;
  // the initiator consumes (and clears) the choice. Both are ephemeral and never persisted.
  directoryPurpose: DirectoryPurpose | null;
  setDirectoryPurpose: (purpose: DirectoryPurpose | null) => void;
  directoryChoice: DirectoryChoice | null;
  setDirectoryChoice: (choice: DirectoryChoice | null) => void;

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

// --- Module-level (non-persisted, non-store) hydration outcome tracker ---
//
// Declared before useAppStore/create() below because persist's onRehydrateStorage callback
// (see the onRehydrateStorage option further down) is invoked *synchronously* as part of
// create()'s own setup — zustand's hydrate() runs once, immediately, at store creation, not
// deferred to a later microtask. beginHydrationAttempt() below therefore runs before this
// module has finished evaluating top-to-bottom; defining it (and the state it closes over)
// after the store would reference `let` bindings still in their temporal dead zone and throw
// "Cannot access before initialization" the moment this module is imported anywhere.
//
// zustand's own persist.hasHydrated()/onFinishHydration() only ever fire on a *successful*
// rehydration pass (see node_modules/zustand/middleware.js hydrate(): the .catch() branch
// calls onRehydrateStorage's callback with an error but never flips _hasHydrated or notifies
// finishHydrationListeners). That made a known, already-logged rehydration failure
// indistinguishable from a genuine AsyncStorage hang — both silently rode out the same
// five-second timeout in waitForStoreHydration below.
//
// This tracker is fed exclusively from the onRehydrateStorage callback below, which zustand
// guarantees fires exactly once per hydrate() attempt on both the success and failure paths.
// It is deliberately plain module state, not a store field: recording it via set() would
// schedule an extra persisted write-back on every rehydration (see the onRehydrateStorage
// comment below for why that previously crashed the plain-Node scripts/*.ts suite).
type HydrationOutcome = 'success' | 'failure';
interface HydrationSettleEvent {
  generation: number;
  outcome: HydrationOutcome;
  error?: unknown;
}

let hydrationGeneration = 0;
let lastHydrationSettleEvent: HydrationSettleEvent | null = null;
const hydrationOutcomeListeners = new Set<(event: HydrationSettleEvent) => void>();

/** Opens a new hydration attempt. Called once per hydrate() call, including the automatic one at store creation. */
function beginHydrationAttempt(): number {
  hydrationGeneration += 1;
  return hydrationGeneration;
}

/**
 * Records the outcome of a hydration attempt and notifies every still-pending waiter.
 *
 * `lastHydrationSettleEvent` only ever advances forward: a late settle from an older,
 * already-superseded generation (only reachable in tests that call persist.rehydrate()
 * repeatedly, or across a Fast Refresh module recreation) must not clobber the recorded
 * state for a newer generation that has already settled. Listeners are still notified with
 * their own event unconditionally — each one filters by its own exact generation below — so
 * an old generation's genuinely-pending waiter is unaffected by this ordering guard.
 */
function settleHydrationAttempt(generation: number, outcome: HydrationOutcome, error?: unknown): void {
  const event: HydrationSettleEvent = { generation, outcome, error };
  if (!lastHydrationSettleEvent || generation >= lastHydrationSettleEvent.generation) {
    lastHydrationSettleEvent = event;
  }
  // Iterate a snapshot: a listener's own cleanup (see subscribeHydrationOutcome) mutates the
  // Set it's stored in as part of firing, which would otherwise skip entries mid-forEach.
  Array.from(hydrationOutcomeListeners).forEach((listener) => listener(event));
}

/**
 * Notifies `listener` once the attempt numbered exactly `generation` settles (resolves
 * synchronously against the latest known outcome if that exact generation already settled).
 * Matching is exact, not `>=`: a waiter opened for generation N must only ever be resolved by
 * generation N settling. Under `>=`, a newer generation N+1 settling first (e.g. a fast
 * superseding rehydrate() in tests, or a Fast Refresh module recreation racing an in-flight
 * wait from the previous module instance) would incorrectly resolve a still-pending N waiter
 * with a result that was never actually produced for its own attempt.
 */
function subscribeHydrationOutcome(
  generation: number,
  listener: (event: HydrationSettleEvent) => void
): () => void {
  if (lastHydrationSettleEvent && lastHydrationSettleEvent.generation === generation) {
    listener(lastHydrationSettleEvent);
    return () => {};
  }
  const wrapped = (event: HydrationSettleEvent) => {
    if (event.generation !== generation) return;
    hydrationOutcomeListeners.delete(wrapped);
    listener(event);
  };
  hydrationOutcomeListeners.add(wrapped);
  return () => hydrationOutcomeListeners.delete(wrapped);
}

/** The unfinished journey if one exists and is still inside its 2 h window (expiry evaluated on read). */
export const selectUnfinishedJourney = (state: Pick<AppState, 'unfinishedJourney'>, nowMs: number = Date.now()) =>
  parseUnfinishedJourney(state.unfinishedJourney, nowMs);
export const selectHasUnfinishedJourney = (state: Pick<AppState, 'unfinishedJourney'>, nowMs: number = Date.now()) =>
  selectUnfinishedJourney(state, nowMs) !== null;

function partializeAppState(state: AppState) {
  return {
    offlineData: state.offlineData,
    offlineMapStatus: state.offlineMapStatus,
    offlineMapStatusMessage: state.offlineMapStatusMessage,
    downloadState: state.downloadState,
    settings: state.settings,
    recentSearches: sanitizePersistedPlaces(state.recentSearches),
    favorites: sanitizePersistedFavorites(state.favorites),
    lastKnownLocation: state.lastKnownLocation,
    lastKnownLocationUpdatedAt: state.lastKnownLocationUpdatedAt,
    unfinishedJourney: state.unfinishedJourney,
    hasSeenMapOverview: state.hasSeenMapOverview,
    hasSeenLocationTutorial: state.hasSeenLocationTutorial,
    showGraphNodes: state.showGraphNodes,
    showRastaNames: state.showRastaNames,
    showBlockPolygons: state.showBlockPolygons,
    showGatesLayer: state.showGatesLayer,
    showRastasLayer: state.showRastasLayer,
    showSpecialRoutesLayer: state.showSpecialRoutesLayer,
    showRouteDiagnostics: state.showRouteDiagnostics,
    developerModeEnabled: state.developerModeEnabled,
  };
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
        // #147: a NaN/Infinity/out-of-range fix must never reach progress, reroute, arrival or snapping.
        if (loc && !isValidCoordinate(loc)) return;
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
      locationPermissionPrecision: 'none',
      setLocationPermissionPrecision: (val) => set({ locationPermissionPrecision: val }),
      hasInternet: true,
      setHasInternet: (val) => set({ hasInternet: val }),

      hasSeenMapOverview: false,
      setHasSeenMapOverview: (val) => set({ hasSeenMapOverview: val }),

      hasSeenLocationTutorial: false,
      setHasSeenLocationTutorial: (val) => set({ hasSeenLocationTutorial: val }),

      // --- Navigation ---
      isNavigating: false,
      navigationSessionId: 0,
      destination: null,
      startNavigation: (dest, route = null, instructions = []) =>
        set((state) => ({
          isNavigating: true,
          navigationSessionId: state.navigationSessionId + 1,
          destination: dest,
          activeRoute: route,
          routeInstructions: instructions,
          unfinishedJourney: createUnfinishedJourney(dest.id, Date.now()),
        })),
      stopNavigation: () =>
        set({
          isNavigating: false,
          destination: null,
          activeRoute: null,
          routeInstructions: [],
          reroutePending: false,
          unfinishedJourney: null,
        }),
      unfinishedJourney: null,
      clearUnfinishedJourney: () => set({ unfinishedJourney: null }),
      beginRecovery: () => {
        const state = get();
        // A live journey owns the marker; recovery only applies to a journey that did not survive.
        if (state.isNavigating) return null;
        const journey = selectUnfinishedJourney(state);
        if (!journey) return null;
        const place = V2PlaceAdapter.getPlaceById(journey.destinationId);
        set({ unfinishedJourney: null, ...(place ? { pendingDirectorySelection: place } : {}) });
        return place;
      },
      activeRoute: null,
      setActiveRoute: (route) => set({ activeRoute: route }),
      routeInstructions: [],
      setRouteInstructions: (instructions) => set({ routeInstructions: instructions }),
      reroutePending: false,
      setReroutePending: (val) => set({ reroutePending: val }),

      // --- Place selection ---
      selectedPlace: null,
      setSelectedPlace: (place) => set({ selectedPlace: place }),

      // --- Locations directory hand-off ---
      pendingDirectorySelection: null,
      setPendingDirectorySelection: (place) => set({ pendingDirectorySelection: place }),
      directoryPurpose: null,
      setDirectoryPurpose: (purpose) => set({ directoryPurpose: purpose }),
      directoryChoice: null,
      setDirectoryChoice: (choice) => set({ directoryChoice: choice }),

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
      onRehydrateStorage: () => {
        // Deliberately does NOT call any store set()/action here — every set() on this
        // persisted store schedules its own write-back to AsyncStorage (see zustand's persist
        // middleware), and that write-back is itself unguarded. In an environment where
        // AsyncStorage is unavailable (e.g. the plain-Node scripts/*.ts test suite, which has
        // no real AsyncStorage shim), a set() called from here previously turned a benign,
        // already-handled read failure into an unhandled promise rejection that crashed the
        // whole process. See waitForStoreHydration() below, which watches a module-level
        // (non-persisted) hydration outcome tracker fed only from this callback — no store
        // mutation involved.
        //
        // zustand calls this outer factory once per hydrate() attempt (including the initial,
        // automatic one at store creation), so it's the correct place to open a new hydration
        // "generation" — see beginHydrationAttempt() below.
        const generation = beginHydrationAttempt();
        return (_state, error) => {
          if (error) {
            // Known failure (bad JSON, storage.getItem rejection, migrate/merge throw, ...):
            // leave in-memory defaults in place rather than throwing or hanging, and let any
            // waiter resolve immediately instead of idling out the full timeout window.
            console.error('[useAppStore] Failed to rehydrate persisted state — continuing with default values.', error);
            settleHydrationAttempt(generation, 'failure', error);
          } else {
            settleHydrationAttempt(generation, 'success');
          }
        };
      },
      migrate: (persistedState) => {
        if (!persistedState || typeof persistedState !== 'object') return persistedState;
        const state = persistedState as Partial<AppState>;
        return {
          ...state,
          selectedPlace: sanitizePersistedPlace(state.selectedPlace),
          routePlannerOrigin: sanitizePersistedPlace(state.routePlannerOrigin),
          routePlannerDest: sanitizePersistedPlace(state.routePlannerDest),
        };
      },
      merge: (persistedState, currentState) => {
        if (!persistedState || typeof persistedState !== 'object' || Array.isArray(persistedState)) {
          return currentState;
        }
        // partialize constrains writes only. Apply that same boundary to every read,
        // including same-version blobs and explicit rehydration during a live journey.
        const persisted = persistedState as Record<string, unknown>;
        const allowedKeys = Object.keys(partializeAppState(currentState));
        const allowedState = Object.fromEntries(
          allowedKeys.filter((key) => Object.prototype.hasOwnProperty.call(persisted, key))
            .map((key) => [key, persisted[key]])
        );
        return {
          ...currentState,
          ...allowedState,
          settings: sanitizePersistedSettings(persisted.settings, currentState.settings),
          recentSearches: Object.prototype.hasOwnProperty.call(persisted, 'recentSearches')
            ? sanitizePersistedPlaces(persisted.recentSearches) : currentState.recentSearches,
          favorites: Object.prototype.hasOwnProperty.call(persisted, 'favorites')
            ? sanitizePersistedFavorites(persisted.favorites) : currentState.favorites,
          // Fails closed (unknown version, extra keys, expired, future-dated -> null). The expired or
          // invalid blob entry is dropped from storage by the next normal write.
          // A live journey owns its marker: a stale blob must never wipe it (explicit rehydrate mid-trip).
          unfinishedJourney: Object.prototype.hasOwnProperty.call(persisted, 'unfinishedJourney') && !currentState.isNavigating
            ? parseUnfinishedJourney(persisted.unfinishedJourney, Date.now()) : currentState.unfinishedJourney,
        };
      },
      // Only persist these keys — runtime GPS and transient UI state are not persisted
      partialize: partializeAppState,
    }
  )
);

const HYDRATION_TIMEOUT_MS = 5000;

export type HydrationWaitOutcome = 'success' | 'failure' | 'timeout' | 'aborted';
export interface HydrationWaitResult {
  outcome: HydrationWaitOutcome;
}

/**
 * Single canonical way to wait for the persisted store's one-shot AsyncStorage rehydration.
 *
 * Resolves as soon as the current hydration attempt settles:
 * - 'success' — the persisted state (or in-memory defaults on a fresh install) is in the store.
 * - 'failure' — a known, already-logged rehydration error occurred; in-memory defaults stand.
 *   This resolves as soon as the failure is known, without waiting out `timeoutMs`.
 * - 'timeout' — a genuine hang (no callback at all within `timeoutMs`); a degraded-startup
 *   fallback, not an impossible path — callers must treat it the same as 'failure'.
 * - 'aborted' — `signal` fired before the attempt settled (e.g. the caller unmounted).
 *
 * Every internal subscription (the outcome listener and the timeout) is torn down on whichever
 * of these four outcomes occurs first, so concurrent callers never leak listeners into each other.
 */
export function waitForStoreHydration(timeoutMs = HYDRATION_TIMEOUT_MS, signal?: AbortSignal): Promise<HydrationWaitResult> {
  if (useAppStore.persist.hasHydrated()) return Promise.resolve({ outcome: 'success' });
  const generation = hydrationGeneration;
  return new Promise((resolve) => {
    let settled = false;
    // Idempotent no-op placeholder, replaced with the real unsubscribe function immediately
    // below. subscribeHydrationOutcome() can invoke its listener *synchronously*, inside the
    // same call that produces the real unsubscribe function, whenever this exact generation
    // already settled before this waiter was created — a `const unsubscribe = subscribe(...)`
    // pattern would leave `unsubscribe` in its temporal dead zone at the moment that
    // synchronous replay tries to call it from within `finish`. Pre-binding it to a no-op
    // means that replay path calls a valid (harmless) function instead of throwing.
    let unsubscribe: () => void = () => {};
    const finish = (result: HydrationWaitResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      unsubscribe();
      signal?.removeEventListener('abort', onAbort);
      resolve(result);
    };
    const onAbort = () => finish({ outcome: 'aborted' });
    const timeoutId = setTimeout(() => {
      console.warn(`[useAppStore] Hydration timed out after ${timeoutMs}ms — proceeding with current in-memory state.`);
      finish({ outcome: 'timeout' });
    }, timeoutMs);
    unsubscribe = subscribeHydrationOutcome(generation, (event) => {
      if (event.outcome === 'failure') {
        console.warn('[useAppStore] Hydration failed — proceeding with current in-memory state.', event.error);
      }
      finish({ outcome: event.outcome });
    });
    // `!settled` guards against the synchronous-replay path above: subscribeHydrationOutcome()
    // can call its listener (and therefore finish()) synchronously, inside the
    // `unsubscribe = subscribeHydrationOutcome(...)` call itself, whenever this exact
    // generation already settled before this waiter was created. Without this guard, an
    // already-resolved promise would still reach `signal.addEventListener` below and attach a
    // listener nothing will ever remove.
    if (signal && !settled) {
      if (signal.aborted) finish({ outcome: 'aborted' });
      else signal.addEventListener('abort', onAbort, { once: true });
    }
  });
}

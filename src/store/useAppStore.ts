/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { create } from 'zustand';
import { persist, createJSONStorage, StateStorage } from 'zustand/middleware';
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

  // --- Permissions / connectivity ---
  hasLocationPermission: boolean;
  setHasLocationPermission: (val: boolean) => void;
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

// zustand's persist middleware writes to storage on every set() call, regardless of whether
// the persisted (partialize'd) fields actually changed. partialize below already excludes
// pure GPS/navigation runtime state (currentLocation, activeRoute, routeInstructions, ...),
// but `lastKnownLocation`/`lastKnownLocationUpdatedAt` genuinely are persisted (needed at next
// cold start / when live GPS is unavailable — see DirectionsViewModel's "remembered location"
// start option) and setCurrentLocation() updates both on every live GPS fix, ~1/sec during
// navigation — a plain identical-value dedupe never catches this because the timestamp differs
// every tick. This wrapper both (a) skips a truly identical write outright and (b) throttles
// genuinely-changing writes to at most one per PERSIST_WRITE_THROTTLE_MS, always flushing the
// latest pending value on the trailing edge so nothing is lost — bounding "how stale can the
// on-disk remembered location be" to the throttle window, which that feature's own
// minutes-granularity age label already tolerates, instead of writing to disk every GPS tick.
const PERSIST_WRITE_THROTTLE_MS = 4000;

export function createDedupingStorage(storage: StateStorage, throttleMs = PERSIST_WRITE_THROTTLE_MS): StateStorage {
  let lastWritten: string | null = null;
  let lastWriteAt = 0;
  let pendingTimer: ReturnType<typeof setTimeout> | null = null;
  let pendingName: string | null = null;
  let pendingValue: string | null = null;

  const flush = (name: string, value: string) => {
    lastWritten = value;
    lastWriteAt = Date.now();
    pendingTimer = null;
    pendingName = null;
    pendingValue = null;
    return storage.setItem(name, value);
  };

  return {
    getItem: (name) => storage.getItem(name),
    setItem: (name, value) => {
      if (value === lastWritten) return;
      const elapsed = Date.now() - lastWriteAt;
      if (lastWriteAt === 0 || elapsed >= throttleMs) {
        return flush(name, value);
      }
      pendingName = name;
      pendingValue = value;
      if (!pendingTimer) {
        pendingTimer = setTimeout(() => {
          if (pendingName != null && pendingValue != null) void flush(pendingName, pendingValue);
        }, throttleMs - elapsed);
      }
    },
    removeItem: (name) => {
      lastWritten = null;
      lastWriteAt = 0;
      pendingName = null;
      pendingValue = null;
      if (pendingTimer) {
        clearTimeout(pendingTimer);
        pendingTimer = null;
      }
      return storage.removeItem(name);
    },
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
        const now = new Date().toISOString();
        set({ currentLocation: loc, currentLocationSource: loc ? source : null });
        if (loc && source !== 'remembered' && source !== 'manual') {
          set({ lastKnownLocation: loc, lastKnownLocationUpdatedAt: now });
        }
      },
      lastKnownLocation: null,
      lastKnownLocationUpdatedAt: null,
      setLastKnownLocation: (loc) => set({ lastKnownLocation: loc, lastKnownLocationUpdatedAt: loc ? new Date().toISOString() : null }),

      // --- Permissions / connectivity ---
      hasLocationPermission: false,
      setHasLocationPermission: (val) => set({ hasLocationPermission: val }),
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
        })),
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
      storage: createJSONStorage(() => createDedupingStorage(AsyncStorage)),
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
      }),
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

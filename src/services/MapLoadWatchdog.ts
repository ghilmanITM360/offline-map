/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Issue #28: replaces the old one-way `mapLoadFailed` boolean latch with a small explicit
// state machine, so a Google basemap that loads successfully AFTER the 7s watchdog fires
// (common on slow/software-rendered devices) can recover instead of being stuck in
// LOCAL_TILES/GRAPH_ONLY fallback for the rest of the session. Each load attempt carries a
// generation number so a late event from an attempt that's no longer current (e.g. after a
// connectivity-driven reset) is ignored rather than resurrecting stale state.

export type MapLoadState =
  | 'INACTIVE' // not attempting Google (offline, or no Maps key) — resolveBaseMapMode owns this case directly
  | 'GOOGLE_STARTING' // attempt in flight, watchdog armed
  | 'GOOGLE_READY' // onMapLoaded arrived before the watchdog fired
  | 'OFFLINE_FALLBACK' // watchdog fired before onMapLoaded arrived
  | 'GOOGLE_RECOVERED'; // onMapLoaded arrived late, after OFFLINE_FALLBACK, same generation

export interface MapLoadWatchdogState {
  state: MapLoadState;
  generation: number;
}

export const MAP_LOAD_WATCHDOG_TIMEOUT_MS = 7000;

export function createInactiveWatchdogState(generation: number): MapLoadWatchdogState {
  return { state: 'INACTIVE', generation };
}

export function beginMapLoadAttempt(generation: number): MapLoadWatchdogState {
  return { state: 'GOOGLE_STARTING', generation };
}

export function applyMapLoaded(current: MapLoadWatchdogState, eventGeneration: number): MapLoadWatchdogState {
  if (current.state === 'INACTIVE' || eventGeneration !== current.generation) return current;
  if (current.state === 'OFFLINE_FALLBACK') return { ...current, state: 'GOOGLE_RECOVERED' };
  if (current.state === 'GOOGLE_STARTING') return { ...current, state: 'GOOGLE_READY' };
  return current;
}

export function applyWatchdogTimeout(current: MapLoadWatchdogState, timeoutGeneration: number): MapLoadWatchdogState {
  if (current.state !== 'GOOGLE_STARTING' || timeoutGeneration !== current.generation) return current;
  return { ...current, state: 'OFFLINE_FALLBACK' };
}

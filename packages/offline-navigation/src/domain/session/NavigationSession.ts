/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// B4a-1: headless navigation session lifecycle. Consolidates rules the app currently spreads across
// useAppStore.startNavigation/stopNavigation (one session per trip, a fresh id per start),
// OutsideRouteRequestCoordinator (one current request; begin/cancel supersede and abort it) and the
// generation/mounted guards in NavigationViewModelV2, DirectionsViewModel and useManualLiveUpgrade.
// It owns no GPS subscription and never starts navigation by itself; the host injects the id and calls start().

export type NavigationSessionState = 'idle' | 'active' | 'cancelled' | 'disposed';

export interface NavigationSessionRequest {
  readonly generation: number;
  /** Aborted when the request is superseded, or the session is cancelled or disposed. */
  readonly signal: AbortSignal;
  /** True only while this is the session's current request and the session is active. */
  canCommit(): boolean;
  /** Runs `apply` only if the request can still commit, then retires it; returns whether `apply` ran. */
  commit(apply: () => void): boolean;
}

export interface NavigationSession {
  /** Host-supplied; uniqueness is the host's (as navigationSessionId is the store's). */
  readonly id: string;
  readonly state: NavigationSessionState;
  /** idle -> active only (cancel() also accepts idle -> cancelled). A cancelled or disposed session never restarts; a new trip is a new session. */
  start(): boolean;
  /** Supersedes (aborts) any current request. Outside an active session the handle is born aborted. */
  beginRequest(): NavigationSessionRequest;
  cancel(): void;
  /** Idempotent. Aborts work and drops listeners without notifying them. */
  dispose(): void;
  subscribe(listener: (state: NavigationSessionState) => void): () => void;
}

export function createNavigationSession(id: string): NavigationSession {
  if (typeof id !== 'string' || id.length === 0) throw new Error('navigation session id must be a non-empty string');
  let state: NavigationSessionState = 'idle';
  let generation = 0;
  let current: { generation: number; controller: AbortController } | null = null;
  const listeners = new Set<(state: NavigationSessionState) => void>();

  const abortCurrent = () => {
    current?.controller.abort();
    current = null;
  };
  const transition = (next: NavigationSessionState) => {
    state = next;
    for (const listener of [...listeners]) {
      if (state !== next) return; // a listener disposed or cancelled the session mid-notification
      if (listeners.has(listener)) listener(next); // skip one unsubscribed mid-notification
    }
  };

  return {
    id,
    get state() {
      return state;
    },
    start() {
      if (state !== 'idle') return false;
      transition('active');
      return true;
    },
    beginRequest() {
      abortCurrent();
      generation += 1;
      const entry = { generation, controller: new AbortController() };
      if (state === 'active') current = entry;
      else entry.controller.abort();
      const canCommit = () => state === 'active' && current === entry && !entry.controller.signal.aborted;
      return {
        generation: entry.generation,
        signal: entry.controller.signal,
        canCommit,
        commit(apply) {
          if (!canCommit()) return false;
          current = null;
          apply();
          return true;
        },
      };
    },
    cancel() {
      if (state === 'cancelled' || state === 'disposed') return;
      abortCurrent();
      transition('cancelled');
    },
    dispose() {
      if (state === 'disposed') return;
      listeners.clear();
      abortCurrent();
      state = 'disposed';
    },
    subscribe(listener) {
      if (state === 'disposed') return () => {};
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

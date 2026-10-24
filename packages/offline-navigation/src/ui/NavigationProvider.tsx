/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { createContext, useContext, useEffect, useSyncExternalStore } from 'react';
import type { NavigationController, NavigationControllerState } from '../domain/navigation';

const NavigationContext = createContext<NavigationController | null>(null);

/** The host's app-lifecycle capability, injected (for example from React Native's AppState). */
export interface NavigationLifecycleAdapter {
  /** Calls `listener` each time the app returns to the foreground; returns the unsubscribe function. */
  onForeground(listener: () => void): () => void;
}

export interface NavigationProviderProps {
  /** The host owns the controller's lifetime (create it once, dispose it when the app is done with navigation). */
  controller: NavigationController;
  lifecycle?: NavigationLifecycleAdapter;
  /** How often GPS loss is re-checked while live navigation runs. Default 1000 ms. */
  tickMs?: number;
  children: React.ReactNode;
}

// Binds one controller to React: shares it with the hooks below, drives the GPS-loss clock only while live, and
// resumes live navigation on foreground. It owns no navigation state, so it can never become a second authority.
export function NavigationProvider({ controller, lifecycle, tickMs = 1000, children }: NavigationProviderProps) {
  const isLive = useSyncExternalStore(controller.subscribe, () => controller.getState().phase === 'live');
  useEffect(() => {
    if (!isLive) return undefined;
    const id = setInterval(controller.tick, tickMs);
    return () => clearInterval(id);
  }, [controller, isLive, tickMs]);
  useEffect(() => lifecycle?.onForeground(() => void controller.resume()), [controller, lifecycle]);
  return <NavigationContext.Provider value={controller}>{children}</NavigationContext.Provider>;
}

export function useNavigationController(): NavigationController {
  const controller = useContext(NavigationContext);
  if (!controller) throw new Error('useNavigationController must be used inside <NavigationProvider>');
  return controller;
}

/** The controller's state, or a selection from it. Re-renders on every state change; select to render less. */
export function useNavigationState(): NavigationControllerState;
export function useNavigationState<T>(selector: (state: NavigationControllerState) => T): T;
export function useNavigationState<T>(selector?: (state: NavigationControllerState) => T): NavigationControllerState | T {
  const controller = useNavigationController();
  const state = useSyncExternalStore(controller.subscribe, controller.getState);
  return selector ? selector(state) : state;
}

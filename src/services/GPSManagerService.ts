/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as Location from 'expo-location';
import { AppState, AppStateStatus } from 'react-native';
import { Coordinate } from '../models/types';

type LocationCallback = (coord: Coordinate) => void;
type LocationTrackingMode = 'follow' | 'navigation';

/**
 * Singleton GPS subscription manager.
 * Maintains exactly one watchPositionAsync subscription for the whole app.
 * Screens/viewmodels subscribe/unsubscribe via addListener/removeListener.
 * The store-update callback is injected at startup (see RootNavigator) to keep
 * this service fully decoupled from the Zustand store.
 */
class GPSManager {
  private subscription: Location.LocationSubscription | null = null;
  private subscriptionMode: LocationTrackingMode | null = null;
  private readonly listeners: Map<LocationCallback, LocationTrackingMode> = new Map();
  private appStateSubscription: { remove: () => void } | null = null;
  private appState: AppStateStatus = AppState.currentState;
  private reconcileInFlight: Promise<void> | null = null;
  private reconcileAgain = false;
  /** Optional callback injected externally to update the global store. */
  private storeUpdater: LocationCallback | null = null;

  /** Call once at app start to wire the GPS manager to the global store. */
  setStoreUpdater(cb: LocationCallback): void {
    this.storeUpdater = cb;
  }

  private getRequestedMode(): LocationTrackingMode | null {
    if (this.listeners.size === 0) return null;
    return Array.from(this.listeners.values()).includes('navigation') ? 'navigation' : 'follow';
  }

  private getWatchOptions(mode: LocationTrackingMode): Location.LocationOptions {
    if (mode === 'navigation') {
      return {
        accuracy: Location.Accuracy.High,
        timeInterval: 1000,
        distanceInterval: 2,
      };
    }

    return {
      accuracy: Location.Accuracy.Balanced,
      timeInterval: 5000,
      distanceInterval: 10,
    };
  }

  private ensureAppStateListener(): void {
    if (this.appStateSubscription) return;
    this.appStateSubscription = AppState.addEventListener('change', (nextState) => {
      this.appState = nextState;
      if (nextState !== 'active') {
        this.stop();
        return;
      }
      this.requestReconcile();
    });
  }

  private requestReconcile(): void {
    if (this.reconcileInFlight) {
      this.reconcileAgain = true;
      return;
    }

    this.reconcileInFlight = this.runQueuedReconcile()
      .catch((err) => {
        console.warn('[GPSManager] reconcile failed:', err);
      })
      .finally(() => {
        this.reconcileInFlight = null;
      });
  }

  private async runQueuedReconcile(): Promise<void> {
    do {
      this.reconcileAgain = false;
      await this.reconcileSubscription();
    } while (this.reconcileAgain);
  }

  private async reconcileSubscription(): Promise<void> {
    const mode = this.getRequestedMode();
    if (!mode || this.appState !== 'active') {
      this.stop();
      return;
    }
    await this.start(mode);
  }

  async start(mode: LocationTrackingMode = this.getRequestedMode() ?? 'follow'): Promise<void> {
    if (this.appState !== 'active') return;
    if (this.subscription && this.subscriptionMode === mode) return; // already running at the right duty cycle
    if (this.subscription && this.subscriptionMode !== mode) {
      this.stop();
    }

    const { status } = await Location.getForegroundPermissionsAsync();
    if (status !== 'granted') return;

    const nextSubscription = await Location.watchPositionAsync(
      this.getWatchOptions(mode),
      (location) => {
        const coord: Coordinate = {
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
          heading: location.coords.heading ?? 0, // fixed: normalize null/undefined heading values coming from Expo Location
          accuracy: location.coords.accuracy ?? 0, // fixed: normalize null/undefined accuracy values coming from Expo Location
        };

        // Update global store via the injected callback (no direct store import)
        this.storeUpdater?.(coord);

        // Notify all registered listeners (NavigationViewModel, etc.)
        this.listeners.forEach((_mode, cb) => cb(coord));
      }
    );

    if (this.appState !== 'active' || this.getRequestedMode() !== mode) {
      nextSubscription.remove();
      return;
    }

    this.subscription = nextSubscription;
    this.subscriptionMode = mode;
  }

  stop(): void {
    if (this.subscription) {
      this.subscription.remove();
      this.subscription = null;
      this.subscriptionMode = null;
    }
  }

  addListener(cb: LocationCallback, mode: LocationTrackingMode = 'follow'): void {
    this.listeners.set(cb, mode);
    this.ensureAppStateListener();
    this.requestReconcile();
  }

  removeListener(cb: LocationCallback): void {
    this.listeners.delete(cb);
    this.requestReconcile();
  }
}

export const GPSManagerService = new GPSManager();

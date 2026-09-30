/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as Location from 'expo-location';
import { AppState, AppStateStatus } from 'react-native';
import { Coordinate } from '../models/types';
import { NAVIGATION_WATCH_TIME_INTERVAL_MS } from '../constants/navigation';
import { OnboardingStatusService } from './OnboardingStatusService';
import { isValidCoordinate } from '../utils/isValidCoordinate';

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
  private watchGeneration = 0;
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
        timeInterval: NAVIGATION_WATCH_TIME_INTERVAL_MS,
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

    const generation = ++this.watchGeneration;
    const isCurrentWatch = () => generation === this.watchGeneration && this.appState === 'active';
    const { status } = await Location.getForegroundPermissionsAsync();
    if (status !== 'granted' || !isCurrentWatch()) return;
    // Services-off check (LOC-01/#45): watchPositionAsync's underlying FusedLocationProviderClient
    // request triggers a native Play Services "enable location" resolution dialog when services are
    // off. Each dismissal counts as an app resume, which re-runs reconcileSubscription() and calls
    // start() again — an unbounded dialog-reappears-on-dismiss loop. Bail out before the native call.
    if (!(await Location.hasServicesEnabledAsync()) || !isCurrentWatch()) return;
    // Fire-and-forget: clearSkippedLocationPermissionOnGrant never throws (errors are logged
    // and swallowed internally) and starting the actual GPS watch below must not wait on it.
    void OnboardingStatusService.clearSkippedLocationPermissionOnGrant(true);

    const nextSubscription = await Location.watchPositionAsync(
      this.getWatchOptions(mode),
      (location) => {
        // Native removal cannot retract callbacks already queued for an old watch.
        // Only the current foreground generation may update navigation consumers.
        if (isCurrentWatch()) this.publishFix(location);
      },
    );

    if (!isCurrentWatch() || this.getRequestedMode() !== mode) {
      if (generation === this.watchGeneration) this.watchGeneration += 1;
      nextSubscription.remove();
      return;
    }

    this.subscription = nextSubscription;
    this.subscriptionMode = mode;
  }

  private publishFix(location: Location.LocationObject): Coordinate | null {
    // #147: a NaN/Infinity/out-of-range sensor fix is dropped before the store or any listener
    // (V1 navigation, Home camera follow) can consume it.
    if (!isValidCoordinate(location.coords)) return null;
    const coord: Coordinate = {
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
      // undefined (not 0) when the device has no reliable heading — 0 is a valid
      // "facing true north" reading and must stay distinguishable from "unknown".
      heading: location.coords.heading == null || location.coords.heading < 0 ? undefined : location.coords.heading,
      accuracy: location.coords.accuracy ?? 0, // fixed: normalize null/undefined accuracy values coming from Expo Location
      // NAV-P0-001/AUD-05: native fix timestamp, preserved end to end so navigation can tell a
      // fresh sensor observation from callback-arrival time (a stale/cached fix delivered on
      // listener (re)start, or a duplicate delivery racing forceFix against the ambient watch).
      observedAtMs: location.timestamp,
    };

    // Update global store via the injected callback (no direct store import)
    this.storeUpdater?.(coord);

    // Notify all registered listeners (NavigationViewModel, etc.)
    this.listeners.forEach((_mode, cb) => cb(coord));
    return coord;
  }

  /**
   * One-shot fresh fix, bypassing watchPositionAsync's natural cadence. Used on
   * app-foreground resume during active navigation: after a multi-minute background
   * gap (phone locked mid-walk), waiting for the ambient watch subscription's next
   * callback could take a while (device needs to reacquire GPS lock) — this forces
   * an immediate fix instead, so route progress/ETA don't sit stale on-screen after
   * unlock. Publishes through the same store-updater/listener path as a normal fix,
   * so callers don't need any special-case handling.
   */
  async forceFix(): Promise<Coordinate | null> {
    if (this.appState !== 'active') return null;
    const { status } = await Location.getForegroundPermissionsAsync();
    if (status !== 'granted') return null;
    void OnboardingStatusService.clearSkippedLocationPermissionOnGrant(true);
    try {
      const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      return this.publishFix(location);
    } catch (err) {
      console.warn('[GPSManager] forceFix failed:', err);
      return null;
    }
  }

  stop(): void {
    // Invalidate before native removal, including setups still awaiting a handle.
    this.watchGeneration += 1;
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

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as Location from 'expo-location';
import { useAppStore } from '../store/useAppStore';
import { Coordinate } from '../models/types';

type LocationCallback = (coord: Coordinate) => void;

/**
 * Singleton GPS subscription manager.
 * Maintains exactly one watchPositionAsync subscription for the whole app.
 * Screens subscribe/unsubscribe via addListener/removeListener.
 */
class GPSManager {
  private subscription: Location.LocationSubscription | null = null;
  private listeners: Set<LocationCallback> = new Set();

  async start(): Promise<void> {
    if (this.subscription) return; // already running

    const { status } = await Location.getForegroundPermissionsAsync();
    if (status !== 'granted') return;

    this.subscription = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.High,
        timeInterval: 1000,
        distanceInterval: 2,
      },
      (location) => {
        const coord: Coordinate = {
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
          heading: location.coords.heading ?? 0,
          accuracy: location.coords.accuracy ?? 0,
        };

        // Update global store
        const store = useAppStore.getState();
        store.setCurrentLocation(coord);

        // Notify all registered listeners (NavigationViewModel, etc.)
        this.listeners.forEach((cb) => cb(coord));
      }
    );
  }

  stop(): void {
    if (this.subscription) {
      this.subscription.remove();
      this.subscription = null;
    }
  }

  addListener(cb: LocationCallback): void {
    this.listeners.add(cb);
    // Auto-start when first listener attaches
    if (this.listeners.size === 1 && !this.subscription) {
      this.start();
    }
  }

  removeListener(cb: LocationCallback): void {
    this.listeners.delete(cb);
    // Auto-stop when no listeners remain
    if (this.listeners.size === 0) {
      this.stop();
    }
  }
}

export const GPSManagerService = new GPSManager();

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import * as Location from 'expo-location';
/**
 * Singleton GPS subscription manager.
 * Maintains exactly one watchPositionAsync subscription for the whole app.
 * Screens/viewmodels subscribe/unsubscribe via addListener/removeListener.
 * The store-update callback is injected at startup (see RootNavigator) to keep
 * this service fully decoupled from the Zustand store.
 */
class GPSManager {
    subscription = null;
    listeners = new Set();
    /** Optional callback injected externally to update the global store. */
    storeUpdater = null;
    /** Call once at app start to wire the GPS manager to the global store. */
    setStoreUpdater(cb) {
        this.storeUpdater = cb;
    }
    async start() {
        if (this.subscription)
            return; // already running
        const { status } = await Location.getForegroundPermissionsAsync();
        if (status !== 'granted')
            return;
        this.subscription = await Location.watchPositionAsync({
            accuracy: Location.Accuracy.High,
            timeInterval: 1000,
            distanceInterval: 2,
        }, (location) => {
            const coord = {
                latitude: location.coords.latitude,
                longitude: location.coords.longitude,
                heading: location.coords.heading ?? 0, // fixed: normalize null/undefined heading values coming from Expo Location
                accuracy: location.coords.accuracy ?? 0, // fixed: normalize null/undefined accuracy values coming from Expo Location
            };
            // Update global store via the injected callback (no direct store import)
            this.storeUpdater?.(coord);
            // Notify all registered listeners (NavigationViewModel, etc.)
            this.listeners.forEach((cb) => cb(coord));
        });
    }
    stop() {
        if (this.subscription) {
            this.subscription.remove();
            this.subscription = null;
        }
    }
    addListener(cb) {
        this.listeners.add(cb);
        // Auto-start when first listener attaches
        if (this.listeners.size === 1 && !this.subscription) {
            void this.start().catch((err) => {
                console.warn('[GPSManager] start failed:', err); // fixed: prevent watchPositionAsync failures from surfacing as unhandled promise rejections
            });
        }
    }
    removeListener(cb) {
        this.listeners.delete(cb);
        // Auto-stop when no listeners remain
        if (this.listeners.size === 0) {
            this.stop();
        }
    }
}
export const GPSManagerService = new GPSManager();

import type { LiveFixCoordinate, NavigationLocationAdapter, VenueCoordinate } from '@muslim-ummah/offline-navigation';

export interface SimulatedLocation extends NavigationLocationAdapter {
  /** Moves the simulated walker and reports the fix to a running watch. */
  moveTo(point: VenueCoordinate): void;
}

// A stand-in for the platform location service (expo-location, the host's own native module, ...): precise
// permission already granted, one fix source. Every fix is stamped with the clock the controller also uses.
export function createSimulatedLocation(start: VenueCoordinate): SimulatedLocation {
  let current = start;
  let listener: ((fix: LiveFixCoordinate) => void) | null = null;
  const fix = (): LiveFixCoordinate => ({ latitude: current.lat, longitude: current.lng, accuracy: 5, observedAtMs: Date.now() });
  const granted = { granted: true, canAskAgain: true, precision: 'fine', servicesState: 'enabled' } as const;
  return {
    getPermission: async () => granted,
    requestPermission: async () => granted,
    getCurrentFix: async () => fix(),
    watch: (onFix) => {
      listener = onFix;
      return () => { listener = null; };
    },
    moveTo: (point) => {
      current = point;
      listener?.(fix());
    },
  };
}

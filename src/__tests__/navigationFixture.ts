import type { Place, RoutePreview, V2ActiveRoute, NavigationInstruction, V2NavigationInstruction } from '../models/types';
import { useAppStore } from '../store/useAppStore';
import { createUnfinishedJourney } from '../utils/unfinishedJourney';

/** Seeds an already-running engine fixture. Activation authority is tested separately in LiveActivationAuthority. */
export function seedRunningNavigation(destination: Place, route: RoutePreview | V2ActiveRoute | null = null, instructions: Array<NavigationInstruction | V2NavigationInstruction> = []) {
  const state = useAppStore.getState();
  useAppStore.setState({
    isNavigating: true, navigationSessionId: state.navigationSessionId + 1,
    destination, activeRoute: route, routeInstructions: instructions,
    unfinishedJourney: createUnfinishedJourney(destination.id, Date.now()), routeGuide: null,
    hasLocationPermission: true, locationPermissionPrecision: 'fine', locationServicesState: 'enabled',
    currentLocationSource: 'live',
  });
}

/** Publishes a valid preview and explicit current native facts, then exercises the real store boundary. */
export function activatePublishedFixture(destination: Place, origin = destination.coordinate) {
  const preview: RoutePreview = {
    id: 'published-store-fixture', sourceVersion: 'v2', nodes: [], segments: [],
    coordinates: [origin, { latitude: origin.latitude + 0.001, longitude: origin.longitude }],
    totalDistance: 111, estimatedTimeMin: 2,
  };
  const currentLocation = { ...origin, accuracy: 5, observedAtMs: Date.now() };
  useAppStore.setState({
    hasLocationPermission: true, locationPermissionPrecision: 'fine', locationServicesState: 'enabled',
    currentLocationSource: 'live', currentLocation, routePlannerOrigin: null,
    routePlannerDest: destination, activeRoute: preview,
  });
  expect(useAppStore.getState().startNavigation(destination, preview, [])).toBe(true);
  return currentLocation;
}

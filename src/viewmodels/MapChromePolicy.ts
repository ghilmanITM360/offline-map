import type { MapMode } from './useMapMode';

/** Visibility only: canonical MapMode retains priority and lifecycle ownership. */
export function resolveMapChromePolicy(mode: MapMode) {
  return {
    search: mode === 'EXPLORE' || mode === 'SEARCH',
    searchResults: mode === 'SEARCH',
    chips: mode === 'EXPLORE',
    browseControls: mode === 'EXPLORE',
    browseStatus: mode === 'EXPLORE',
    placeSheet: mode === 'PLACE_SELECTED' || mode === 'DETAILS',
    routeSheet: mode === 'ROUTE_PREVIEW',
    recenter: mode === 'PLACE_SELECTED' || mode === 'ROUTE_PREVIEW',
    navigation: mode === 'NAVIGATION',
    // Navigation's compass toggles between north-up and heading follow; zoom/layers
    // have no navigation role. Recenter belongs to NavigationChrome V1/V2.
    compass: mode === 'NAVIGATION',
    arrival: mode === 'ARRIVAL',
  };
}

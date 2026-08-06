import type { MapMode } from '../../../viewmodels/useMapMode';

export interface MapMarkerOwnership {
  showBrowseUser: boolean;
  showBrowseSelection: boolean;
  showNavigationStart: boolean;
  showNavigationDestination: boolean;
  showNavigationUser: boolean;
}

/** One policy for every map marker identity. Arrival keeps navigation's destination
 * and snapped user identity, falling back to Home's user marker only when needed. */
export function resolveMapMarkerOwnership(
  mode: MapMode,
  hasNavigationUserLocation: boolean,
): MapMarkerOwnership {
  if (mode === 'ARRIVAL') {
    return {
      showBrowseUser: !hasNavigationUserLocation,
      showBrowseSelection: false,
      showNavigationStart: false,
      showNavigationDestination: true,
      showNavigationUser: hasNavigationUserLocation,
    };
  }
  if (mode === 'NAVIGATION') {
    return {
      showBrowseUser: false,
      showBrowseSelection: false,
      showNavigationStart: true,
      showNavigationDestination: true,
      showNavigationUser: hasNavigationUserLocation,
    };
  }
  return {
    showBrowseUser: true,
    showBrowseSelection: true,
    showNavigationStart: false,
    showNavigationDestination: false,
    showNavigationUser: false,
  };
}

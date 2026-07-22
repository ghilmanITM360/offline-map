/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useMemo } from 'react';

/**
 * Seven mutually-exclusive modes for HomeScreen's map surface, replacing the old
 * ScreenMode selector. Priority order below (top wins) mirrors the stacking contract in
 * `src/views/styles/zLayers.ts`. MAP_SETTINGS (the layers sheet) is intentionally not a
 * MapMode value — it's a modal that overlays whichever mode is active underneath, tracked
 * by its own `layersSheetVisible` flag, same as before this refactor.
 */
export type MapMode =
  | 'EXPLORE'
  | 'SEARCH'
  | 'PLACE_SELECTED'
  | 'DETAILS'
  | 'ROUTE_PREVIEW'
  | 'NAVIGATION'
  | 'ARRIVAL';

export interface MapModeInputs {
  arrived: boolean;
  showNavOverlay: boolean;
  isSearchFocused: boolean;
  detailsExpanded: boolean;
  directionsDestination: unknown;
  activePreviewRoute: unknown;
  selectedPlace: unknown;
}

/**
 * Pure priority-chain selector — same shape as the old deriveScreenMode, extended with
 * three inputs (isSearchFocused, detailsExpanded, arrived) that used to be checked
 * independently at JSX call sites instead of folded into the mode itself. Folding them in
 * is what actually removes the "two modes true at once" class of bug — e.g. search could
 * previously stay focused while a route was also being previewed underneath it, because
 * `isSearchFocused` and `mode` were unrelated pieces of state.
 */
export function deriveMapMode(inputs: MapModeInputs): MapMode {
  if (inputs.arrived) return 'ARRIVAL';
  if (inputs.showNavOverlay) return 'NAVIGATION';
  if (inputs.isSearchFocused) return 'SEARCH';
  if (inputs.detailsExpanded) return 'DETAILS';
  if (inputs.directionsDestination || inputs.activePreviewRoute) return 'ROUTE_PREVIEW';
  if (inputs.selectedPlace) return 'PLACE_SELECTED';
  return 'EXPLORE';
}

export function useMapMode(inputs: MapModeInputs): MapMode {
  return useMemo(
    () => deriveMapMode(inputs),
    [
      inputs.arrived,
      inputs.showNavOverlay,
      inputs.isSearchFocused,
      inputs.detailsExpanded,
      inputs.directionsDestination,
      inputs.activePreviewRoute,
      inputs.selectedPlace,
    ],
  );
}

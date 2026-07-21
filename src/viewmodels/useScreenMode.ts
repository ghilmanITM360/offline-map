/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useMemo } from 'react';

/**
 * Six mutually-exclusive modes for HomeScreen's map surface. Priority order below (top
 * wins) mirrors the stacking contract in `src/views/styles/zLayers.ts`: a modal dialog
 * (MAP_SETTINGS) always outranks live navigation chrome, which outranks the directions
 * form, which outranks a route preview, which outranks a selected place, which falls back
 * to plain exploration.
 */
export type ScreenMode =
  | 'EXPLORE'
  | 'PLACE_SELECTED'
  | 'ROUTE_PREVIEW'
  | 'DIRECTIONS_FORM'
  | 'ACTIVE_NAVIGATION'
  | 'MAP_SETTINGS';

export interface ScreenModeInputs {
  layersSheetVisible: boolean;
  showNavOverlay: boolean;
  directionsDestination: unknown;
  activePreviewRoute: unknown;
  selectedPlace: unknown;
}

/**
 * Pure priority-chain selector over existing HomeScreen flags — holds no state of its
 * own, so two modes can never be true at the same time by construction (there's only
 * ever one `return`). Callers don't need to clear other flags on a mode change; the next
 * highest-priority truthy input just wins.
 */
export function deriveScreenMode(inputs: ScreenModeInputs): ScreenMode {
  if (inputs.layersSheetVisible) return 'MAP_SETTINGS';
  if (inputs.showNavOverlay) return 'ACTIVE_NAVIGATION';
  if (inputs.directionsDestination) return 'DIRECTIONS_FORM';
  if (inputs.activePreviewRoute) return 'ROUTE_PREVIEW';
  if (inputs.selectedPlace) return 'PLACE_SELECTED';
  return 'EXPLORE';
}

export function useScreenMode(inputs: ScreenModeInputs): ScreenMode {
  return useMemo(
    () => deriveScreenMode(inputs),
    [
      inputs.layersSheetVisible,
      inputs.showNavOverlay,
      inputs.directionsDestination,
      inputs.activePreviewRoute,
      inputs.selectedPlace,
    ],
  );
}

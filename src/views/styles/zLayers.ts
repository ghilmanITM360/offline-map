/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Single source of truth for RN View z-order across the map screens. Replaces the
// scattered per-style zIndex literals (5/8/10/12/18/20) that used to be invented
// ad hoc in HomeScreen.tsx/mapControlStyles.ts. These values only order siblings
// within the same parent View — they do NOT and cannot make a plain sibling View
// paint above the native Android map surface, or above a
// BottomSheetModal's portal-rendered content. Anything that must reliably cover
// the map (bottom sheets, full-screen pages, dialogs) uses BottomSheetModal or
// RN's <Modal>, which render through a separate native layer instead of relying
// on zIndex. See docs/ARCHITECTURE.md for the full layer-order rationale.
export const Z = {
  // Map polygons/route lines/markers are MapLibre layers, ordered by mount order — see
  // OverlayScene.tsx; they are not RN Views and take no zIndex.
  mapAnnotation: 0,
  // Floating chrome that sits over the map but below any open sheet/full page:
  // search bar, zoom/compass/layers/recenter controls, banners, debug overlays,
  // route preview card.
  mapControls: 10,
  // Handle/indicator drawn inside a bottom sheet's own header.
  sheetHandle: 20,
  // Only relevant if a full-screen surface is ever forced into the same tree as
  // an absolute View instead of Modal/Portal — prefer Modal/BottomSheetModal.
  fullScreenPage: 100,
  dialog: 1000,
} as const;

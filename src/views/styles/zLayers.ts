/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Single source of truth for RN View z-order across the map screens. Replaces the
// scattered per-style zIndex literals (5/8/10/12/18/20) that used to be invented
// ad hoc in HomeScreen.tsx/mapControlStyles.ts. These values only order siblings
// within the same parent View — they do NOT and cannot make a plain sibling View
// paint above react-native-maps' native Android MapView surface, or above a
// BottomSheetModal's portal-rendered content. Anything that must reliably cover
// the map (bottom sheets, full-screen pages, dialogs) uses BottomSheetModal or
// RN's <Modal>, which render through a separate native layer instead of relying
// on zIndex. See docs/MAP_DATA_ARCHITECTURE.md for the full layer-order rationale.
export const Z = {
  // Map polygons/route lines/labels (react-native-maps internal zIndex prop on
  // Marker/Polygon/Polyline/LocalTile) — ordered separately, see BlockLayer.tsx /
  // GateLayer.tsx / RastaLayer.tsx and scripts/test-layer-zindex-v2.ts.
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

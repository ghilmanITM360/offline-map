/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { spacing } from '../theme';
import type { MapMode } from './useMapMode';

/**
 * Single source of truth for "how far up from the screen's bottom edge must a
 * floating map control sit right now" — Google Maps' rule: when a bottom sheet
 * (or any bottom-anchored overlay) opens, controls move upward and never overlap
 * it. Before this, HomeScreen's controlStack/navControls and the recenter button
 * duplicated in NavigationChromeV1/V2 each hand-rolled their own bottom-offset
 * formula with their own undocumented magic numbers (140, 56, 12/16) that could
 * silently drift apart from each other and from the real measured heights of
 * whatever they were stacking above. Every floating-control bottom offset in the
 * app should be built from the primitives below instead of a new inline formula.
 */

// Gap always kept between a floating control and whatever sits below it.
export const OVERLAY_CONTROL_GAP = spacing.lg; // 16
// Floor used when the device reports no/near-zero safe-area bottom inset (most Android).
export const MIN_BOTTOM_FLOOR = spacing.lg; // 16
// mapControlStyles.recenterButton width/height — kept in sync via scripts/test-overlay-insets.ts.
export const RECENTER_BUTTON_SIZE = 56;
// Approximate navigation trip-info bar height, used only for the single frame before
// its real onLayout height is measured (see resolveNavBarHeight).
export const NAV_BAR_FALLBACK_HEIGHT = 140;
// Google's attribution logo needs real headroom to render at all — Maps Android SDK
// silently omits the logo (not just clips it) once mapPadding.bottom leaves it too
// little unobscured space, observed at ~71dp remaining (DETAILS' 92% snap on a real
// device). 96dp still clipped the logo's top sliver against the sheet on-device (the
// SDK reserves its own internal margin beyond the padding boundary), so this sits
// well above both empirical floors (ATTR-001 follow-up).
export const MIN_TOP_VISIBLE_MAP_FOR_ATTRIBUTION = 160;

export type OverlayState =
  | { kind: 'none' }
  | { kind: 'measured'; height: number }
  | { kind: 'sheet'; windowHeight: number; snapPoints: readonly string[]; sheetIndex: number };

/** Height (px) of whatever overlay currently covers the bottom of the map. 0 if none. */
export function resolveOverlayExtent(overlay: OverlayState): number {
  switch (overlay.kind) {
    case 'none':
      return 0;
    case 'measured':
      return Math.max(overlay.height, 0);
    case 'sheet': {
      if (overlay.sheetIndex < 0) return 0;
      // @gorhom/bottom-sheet reports `snapPoints.length` (one past our last defined
      // snap) when dynamic sizing expands the sheet to fit content taller than our
      // tallest snap point — that's MORE covered than our last snap, not "no overlay",
      // so treat any index at/beyond the array as fully covering the map. Silently
      // falling back to 0 here previously left the sheet's real extent unaccounted for.
      if (overlay.sheetIndex >= overlay.snapPoints.length) return overlay.windowHeight;
      const raw = overlay.snapPoints[overlay.sheetIndex];
      const pct = raw ? parseFloat(raw) : 0;
      return ((Number.isFinite(pct) ? pct : 0) / 100) * overlay.windowHeight;
    }
    default:
      return 0;
  }
}

/** Bottom offset for an element stacked `gap` above something that itself sits at
 * `belowBottomOffset` and is `belowHeight` tall. */
export function stackAbove(belowBottomOffset: number, belowHeight: number, gap: number = OVERLAY_CONTROL_GAP): number {
  return belowBottomOffset + belowHeight + gap;
}

/** Bottom offset for the floating map-controls cluster (layers/compass/zoom/recenter)
 * shown outside active navigation — clears whatever overlay (bottom sheet, in any snap
 * state, or the route preview card) is currently covering the map. */
export function computeMapControlsInset(insetsBottom: number, overlay: OverlayState): number {
  const floor = Math.max(insetsBottom, MIN_BOTTOM_FLOOR);
  const extent = resolveOverlayExtent(overlay);
  return stackAbove(floor, extent, OVERLAY_CONTROL_GAP);
}

/** Trip-info bar height for navigation-mode stacking — its real measured height once
 * onLayout has fired, else a floor + fallback estimate for the single frame before that. */
export function resolveNavBarHeight(measuredHeight: number, insetsBottom: number): number {
  return measuredHeight || Math.max(insetsBottom, MIN_BOTTOM_FLOOR) + NAV_BAR_FALLBACK_HEIGHT;
}

/** Bottom offset for navigation's recenter button — stacks directly above the trip-info bar. */
export function computeNavRecenterInset(navBarHeight: number): number {
  return stackAbove(0, navBarHeight, OVERLAY_CONTROL_GAP);
}

/** Bottom offset for navigation's compass/zoom control stack — stacks above the recenter button. */
export function computeNavControlsInset(navBarHeight: number): number {
  return stackAbove(computeNavRecenterInset(navBarHeight), RECENTER_BUTTON_SIZE, OVERLAY_CONTROL_GAP);
}

export interface MapContentInsetInputs {
  mode: MapMode;
  top: number;
  right: number;
  bottomSafeArea: number;
  windowHeight: number;
  snapPoints: readonly string[];
  sheetIndex: number;
  navBarHeight: number;
  /** Measured height of NavigationChromeV1/V2's top instruction+banner stack
   * ("navigation-top-stack"). Only meaningful in NAVIGATION mode — HomeScreen's
   * EXPLORE-mode search bar/chip overlay (what `top` is normally derived from) doesn't
   * render during navigation, so its stale height must not bound label placement while
   * the (usually much taller) navigation banner stack is what's actually covering the
   * top of the map. */
  navTopHeight: number;
}

/** Canonical visible-map rectangle used by projected labels. Floating controls own
 * top/right; sheets, trip bar, arrival surface, and safe area own bottom. */
export function computeMapContentInsets(inputs: MapContentInsetInputs): {
  top: number;
  right: number;
  bottom: number;
  left: number;
} {
  const safeBottom = Math.max(inputs.bottomSafeArea, 0);
  let bottom = safeBottom;
  let top = inputs.top;
  if (inputs.mode === 'ARRIVAL') {
    bottom = Math.max(inputs.windowHeight, safeBottom);
  } else if (inputs.mode === 'NAVIGATION') {
    bottom = Math.max(resolveNavBarHeight(inputs.navBarHeight, safeBottom), safeBottom);
    top = inputs.navTopHeight > 0 ? inputs.navTopHeight + OVERLAY_CONTROL_GAP : inputs.top;
  } else if (
    inputs.mode === 'PLACE_SELECTED' ||
    inputs.mode === 'DETAILS' ||
    inputs.mode === 'ROUTE_PREVIEW'
  ) {
    const sheetExtent = resolveOverlayExtent({
      kind: 'sheet',
      windowHeight: inputs.windowHeight,
      snapPoints: inputs.snapPoints,
      sheetIndex: inputs.sheetIndex,
    });
    // Clamp so a tall sheet (e.g. DETAILS' 92% snap) never squeezes out the Google
    // logo's headroom entirely — see MIN_TOP_VISIBLE_MAP_FOR_ATTRIBUTION. Must account
    // for `top` too: the visible band is (windowHeight - top - bottom), and top is not
    // always 0 here, so clamping bottom alone against windowHeight can still leave (or
    // even go negative on) a degenerate band once top is factored in.
    const maxBottomForAttribution = Math.max(inputs.windowHeight - top - MIN_TOP_VISIBLE_MAP_FOR_ATTRIBUTION, safeBottom);
    bottom = Math.min(Math.max(safeBottom, sheetExtent), maxBottomForAttribution);
  }
  return { top, right: inputs.right, bottom, left: 0 };
}

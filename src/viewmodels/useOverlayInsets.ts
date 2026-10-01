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
// Route Preview must show both route endpoints/markers, not merely attribution.
// Keep a larger usable map band when its sheet reaches the maximum practical snap.
export const MIN_TOP_VISIBLE_MAP_FOR_ROUTE_PREVIEW = 280;

/** Maximum height (px, measured up from the screen's bottom edge) anything bottom-anchored
 * may occupy while still leaving MIN_TOP_VISIBLE_MAP_FOR_ATTRIBUTION of clear map above it.
 * Shared by two call sites that must never disagree: the mapPadding clamp below (what we
 * tell the Google Maps SDK is obstructed) and the BottomSheetModal's own maxDynamicContentSize
 * (what we actually let the sheet grow to, HomeScreen.tsx) — if they drifted apart, the SDK
 * could draw the logo in a spot the real sheet still covers. That's exactly how Route Preview
 * clipped the logo before dynamic sizing was capped: @gorhom/bottom-sheet's enableDynamicSizing
 * (on by default, v5) sizes the sheet to fit its content with no ceiling unless
 * maxDynamicContentSize is set, so a tall enough card stack could render past the mapPadding
 * clamp's assumed extent even though the padding math itself was already correct. */
export function computeMaxSheetOcclusionForAttribution(
  windowHeight: number,
  top: number,
  safeBottom: number,
  minimumVisibleMapHeight: number = MIN_TOP_VISIBLE_MAP_FOR_ATTRIBUTION,
): number {
  return Math.max(windowHeight - top - minimumVisibleMapHeight, safeBottom);
}

/** Lifts the middle (place-preview) snap by the bottom system inset so what is visible above the
 * navigation bar is still the intended share of the container. The sheet's container runs to the window
 * bottom, so on a 48 dp three-button bar the primary CTA at the end of the 50% preview sat behind the bar.
 * Only the middle snap moves; the collapsed and expanded snaps keep their meaning. */
export function insetAwareSnapPoints(snapPoints: readonly string[], containerHeight: number, bottomInset: number): string[] {
  if (bottomInset <= 0 || containerHeight <= 0 || snapPoints.length < 3) return [...snapPoints];
  const middle = parseFloat(snapPoints[1]);
  const top = parseFloat(snapPoints[snapPoints.length - 1]);
  if (!Number.isFinite(middle) || !Number.isFinite(top)) return [...snapPoints];
  const lifted = Math.min(middle + (bottomInset / containerHeight) * 100, top - 1);
  const next = [...snapPoints];
  next[1] = `${Math.round(lifted * 10) / 10}%`;
  return next;
}

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

/** Placement of the browse map-control stack from the sheet's MEASURED top edge (window-space Y,
 * gorhom's `animatedPosition`) rather than a declared snap percentage — gorhom applies the percentages
 * to its own container (window minus topInset) and dynamic sizing adds detents, so the estimate in
 * resolveOverlayExtent overshoots by up to ~217 dp (#208 F1). A sheet top at/after the window bottom
 * (closed, or gorhom's pre-layout sentinel) means no overlay. `visible` is false when the stack no longer
 * fits between the search/chip overlays and the sheet; the caller hides it rather than overlap either.
 * Runs on the UI thread inside useAnimatedStyle. */
export function resolveControlStackPlacement(inputs: {
  sheetTopY: number;
  windowHeight: number;
  floor: number;
  topOverlayBottom: number;
  stackHeight: number;
}): { bottom: number; visible: boolean } {
  'worklet';
  const { sheetTopY, windowHeight, floor, topOverlayBottom, stackHeight } = inputs;
  const resting = Math.max(floor, MIN_BOTTOM_FLOOR) + OVERLAY_CONTROL_GAP;
  if (!Number.isFinite(sheetTopY) || sheetTopY >= windowHeight) return { bottom: resting, visible: true };
  const bottom = Math.max(windowHeight - sheetTopY + OVERLAY_CONTROL_GAP, resting);
  const visible = sheetTopY - OVERLAY_CONTROL_GAP - topOverlayBottom >= stackHeight;
  return { bottom, visible };
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
  if (inputs.mode === 'ARRIVAL') {
    bottom = Math.max(inputs.windowHeight, safeBottom);
  } else if (inputs.mode === 'NAVIGATION') {
    bottom = Math.max(resolveNavBarHeight(inputs.navBarHeight, safeBottom), safeBottom);
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
    const minimumVisibleMapHeight = inputs.mode === 'ROUTE_PREVIEW'
      ? MIN_TOP_VISIBLE_MAP_FOR_ROUTE_PREVIEW
      : MIN_TOP_VISIBLE_MAP_FOR_ATTRIBUTION;
    const maxBottomForAttribution = computeMaxSheetOcclusionForAttribution(
      inputs.windowHeight,
      inputs.top,
      safeBottom,
      minimumVisibleMapHeight,
    );
    bottom = Math.min(Math.max(safeBottom, sheetExtent), maxBottomForAttribution);
  }
  return { top: inputs.top, right: inputs.right, bottom, left: 0 };
}

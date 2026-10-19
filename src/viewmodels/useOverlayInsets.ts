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
// The map's attribution button (MapLibre, bottom of the map) needs real headroom above the sheet: with too little
// unobscured map it ends up behind the sheet. Measured at ~71 dp remaining on a real device at the 92% snap, and 96 dp
// still clipped its top edge, so this sits well above both empirical floors (ATTR-001 follow-up).
export const MIN_TOP_VISIBLE_MAP_FOR_ATTRIBUTION = 160;
// Route Preview must show both route endpoints/markers, not merely attribution.
// Keep a larger usable map band when its sheet reaches the maximum practical snap.
export const MIN_TOP_VISIBLE_MAP_FOR_ROUTE_PREVIEW = 280;

/** Maximum height (px, measured up from the screen's bottom edge) anything bottom-anchored
 * may occupy while still leaving MIN_TOP_VISIBLE_MAP_FOR_ATTRIBUTION of clear map above it.
 * Shared by two call sites that must never disagree: the label/attribution inset clamp below (what we
 * tell the map is obstructed) and the BottomSheetModal's own maxDynamicContentSize
 * (what we actually let the sheet grow to, HomeScreen.tsx) — if they drifted apart, the attribution
 * button could be placed where the real sheet still covers it. That's exactly how Route Preview
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

/** Height (dp) of the place preview's content above the navigation bar, from the title to the bottom of the
 * Directions button: 50% of the 479.6 dp container measured on the API 36 emulator, where the button just clears
 * the bar. A shorter window gives a smaller container, so 50% alone would hide the button behind the bar. */
export const PLACE_PREVIEW_CONTENT_DP = 0.5 * 479.6;

/** The preview content grows less than the font does (the button and padding are fixed): about 29% taller at 200%
 * on the API 36 emulator, where the Directions button was cut off at the resting snap. Linear between 100% and 200%. */
export function placeContentFontFactor(fontScale: number): number {
  return 1 + 0.29 * (Math.min(Math.max(fontScale, 1), 2) - 1);
}

/** Lifts the middle (place-preview) snap by the bottom system inset so what is visible above the
 * navigation bar is still the intended share of the container. The sheet's container runs to the window
 * bottom, so on a 48 dp three-button bar the primary CTA at the end of the 50% preview sat behind the bar.
 * On a short container the middle snap grows further, up to just under the top snap, so the primary button stays
 * visible. Only the middle snap moves; the collapsed and expanded snaps keep their meaning. */
/** Height the collapsed Directions peek needs above the system navigation bar: drag pill + a 48 dp row + margin. */
export const DIRECTIONS_PEEK_HEIGHT_DP = 72;

/**
 * Route preview detents (#307). The collapsed one holds the peek row, so it must clear the system navigation bar:
 * the sheet's container runs to the window bottom, behind the bar, and a bare 15% (~72 dp) left only a sliver above a
 * 48 dp three-button bar. The partial detent is lifted by the same inset so its visible
 * viewport does not lose the Route Guide controls behind that bar. The full detent keeps
 * its meaning; content and pinned footers already apply their own safe-area padding.
 */
export function routePreviewSnapPoints(containerHeight: number, bottomInset: number): string[] {
  if (containerHeight <= 0) return ['15%', '79%', '92%'];
  const safeBottom = Math.max(bottomInset, 0);
  const needed = ((safeBottom + DIRECTIONS_PEEK_HEIGHT_DP) / containerHeight) * 100;
  const collapsed = Math.min(Math.max(15, Math.ceil(needed)), 40);
  const partial = Math.min(79 + (safeBottom / containerHeight) * 100, 91);
  return [`${collapsed}%`, `${Math.round(partial * 10) / 10}%`, '92%'];
}

// A sliver of map kept above the FULL sheet, below the status bar, so it still reads as a sheet you can drag down.
export const FULL_SHEET_TOP_GAP = 8;

/**
 * Height (dp, up from the window bottom) of the sheet at its FULL detent: everything below the status bar. The
 * window already includes the bottom system bar, so the pinned footer (which pads itself by the bottom inset) keeps
 * its actions clear of it; the body scrolls in between. Derived, not a fixed share: a share of the container left FULL
 * at about half of a phone screen once the map band and the top overlay were cut out of that container.
 */
export function fullSheetHeight(windowHeight: number, topInset: number): number {
  return Math.max(windowHeight - Math.max(topInset, 0) - FULL_SHEET_TOP_GAP, 0);
}

/** Replaces the declared top detent with FULL, as a share of the same container the other detents are shares of.
 * Never shrinks it, and leaves the lower detents (collapsed, middle) exactly as they were. */
export function withFullDetent(snapPoints: readonly string[], containerHeight: number, fullHeight: number): string[] {
  if (containerHeight <= 0 || snapPoints.length < 3) return [...snapPoints];
  const declared = parseFloat(snapPoints[snapPoints.length - 1]);
  if (!Number.isFinite(declared) || fullHeight <= (declared / 100) * containerHeight) return [...snapPoints];
  const next = [...snapPoints];
  next[next.length - 1] = `${(fullHeight / containerHeight) * 100}%`;
  return next;
}

/** Grows the middle detent until it holds the drag handle and the whole pinned footer, so the primary actions are
 * not behind the system bar at that detent. On a short container (320 dp, 200% font) the 79% share is smaller than three
 * stacked buttons. `footerHeight` already includes the bottom inset. Apply after withFullDetent: it never passes just
 * under the top detent, and never shrinks the middle one. */
export function withFooterFitDetent(snapPoints: readonly string[], containerHeight: number, footerHeight: number): string[] {
  if (containerHeight <= 0 || footerHeight <= 0 || snapPoints.length < 3) return [...snapPoints];
  const middle = parseFloat(snapPoints[1]);
  const top = parseFloat(snapPoints[snapPoints.length - 1]);
  if (!Number.isFinite(middle) || !Number.isFinite(top)) return [...snapPoints];
  const fit = ((footerHeight + DIRECTIONS_PEEK_HEIGHT_DP) / containerHeight) * 100;
  const next = [...snapPoints];
  next[1] = `${Math.min(Math.max(middle, Math.ceil(fit)), top - 1)}%`;
  return next;
}

export function insetAwareSnapPoints(
  snapPoints: readonly string[],
  containerHeight: number,
  bottomInset: number,
  fontScale: number = 1,
): string[] {
  if (bottomInset <= 0 || containerHeight <= 0 || snapPoints.length < 3) return [...snapPoints];
  const middle = parseFloat(snapPoints[1]);
  const top = parseFloat(snapPoints[snapPoints.length - 1]);
  if (!Number.isFinite(middle) || !Number.isFinite(top)) return [...snapPoints];
  const lifted = Math.min(
    Math.max(middle + (bottomInset / containerHeight) * 100, ((PLACE_PREVIEW_CONTENT_DP * placeContentFontFactor(fontScale) + bottomInset) / containerHeight) * 100),
    top - 1,
  );
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
  // A sheet's extent is measured from the window bottom, so it already contains the bottom inset: stack above
  // whichever is larger instead of adding both (#208 F1). A measured card still rests on the floor.
  if (overlay.kind === 'sheet') return stackAbove(0, Math.max(extent, floor), OVERLAY_CONTROL_GAP);
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

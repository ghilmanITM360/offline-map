/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { routePreviewSnapPoints,
  computeMapContentInsets,
  computeMapControlsInset,
  computeMaxSheetOcclusionForAttribution,
  computeNavControlsInset,
  computeNavRecenterInset,
  insetAwareSnapPoints,
  PLACE_PREVIEW_CONTENT_DP,
  MIN_BOTTOM_FLOOR,
  MIN_TOP_VISIBLE_MAP_FOR_ATTRIBUTION,
  MIN_TOP_VISIBLE_MAP_FOR_ROUTE_PREVIEW,
  NAV_BAR_FALLBACK_HEIGHT,
  OVERLAY_CONTROL_GAP,
  RECENTER_BUTTON_SIZE,
  resolveControlStackPlacement,
  resolveNavBarHeight,
  resolveOverlayExtent,
  stackAbove,
} from '../viewmodels/useOverlayInsets';

describe('resolveOverlayExtent', () => {
  it('is 0 when nothing is covering the map', () => {
    expect(resolveOverlayExtent({ kind: 'none' })).toBe(0);
  });

  it('returns a measured overlay height verbatim (route preview card)', () => {
    expect(resolveOverlayExtent({ kind: 'measured', height: 184 })).toBe(184);
  });

  it('clamps a negative measured height to 0', () => {
    expect(resolveOverlayExtent({ kind: 'measured', height: -10 })).toBe(0);
  });

  it('is 0 for a closed sheet (index -1)', () => {
    expect(resolveOverlayExtent({ kind: 'sheet', windowHeight: 800, snapPoints: ['15%', '50%', '92%'], sheetIndex: -1 })).toBe(0);
  });

  it('resolves LocationSheet preview (50% snap) against window height', () => {
    expect(resolveOverlayExtent({ kind: 'sheet', windowHeight: 800, snapPoints: ['15%', '50%', '92%'], sheetIndex: 1 })).toBe(400);
  });

  it('resolves LocationSheet details (92% snap) against window height', () => {
    expect(resolveOverlayExtent({ kind: 'sheet', windowHeight: 800, snapPoints: ['15%', '50%', '92%'], sheetIndex: 2 })).toBe(736);
  });

  it('resolves the peeked (15%) snap state, distinct from the 50% default', () => {
    expect(resolveOverlayExtent({ kind: 'sheet', windowHeight: 800, snapPoints: ['15%', '50%', '92%'], sheetIndex: 0 })).toBe(120);
  });

  it('treats an out-of-bounds sheetIndex (dynamic-sizing "fit to content" past the last snap) as fully covering the map, not uncovered', () => {
    // @gorhom/bottom-sheet reports index === snapPoints.length when dynamic sizing
    // expands the sheet beyond our tallest defined snap (92%) — observed on-device as
    // sheetIndex=3 against a 3-entry snapPoints array, which previously fell through to
    // 0 (treated as "no overlay") and left the Google logo positioned as if the sheet
    // covered nothing (ATTR-001 follow-up).
    expect(resolveOverlayExtent({ kind: 'sheet', windowHeight: 800, snapPoints: ['15%', '50%', '92%'], sheetIndex: 3 })).toBe(800);
  });
});

describe('stackAbove', () => {
  it('sums the base offset, base height, and gap', () => {
    expect(stackAbove(10, 20, 5)).toBe(35);
  });

  it('defaults to OVERLAY_CONTROL_GAP when no gap is passed', () => {
    expect(stackAbove(10, 20)).toBe(10 + 20 + OVERLAY_CONTROL_GAP);
  });
});

describe('computeMapControlsInset — LocationSheet preview/details, route preview, EXPLORE', () => {
  const windowHeight = 800;
  const snapPoints = ['15%', '50%', '92%'];

  it('EXPLORE (no overlay): sits at the safe-area floor + gap', () => {
    expect(computeMapControlsInset(0, { kind: 'none' })).toBe(MIN_BOTTOM_FLOOR + OVERLAY_CONTROL_GAP);
  });

  it('respects a safe-area inset taller than the floor', () => {
    expect(computeMapControlsInset(40, { kind: 'none' })).toBe(40 + OVERLAY_CONTROL_GAP);
  });

  it('LocationSheet preview (PLACE_SELECTED, 50% snap): clears the sheet, not just the floor', () => {
    const inset = computeMapControlsInset(0, { kind: 'sheet', windowHeight, snapPoints, sheetIndex: 1 });
    expect(inset).toBe(400 + OVERLAY_CONTROL_GAP); // the sheet's extent already runs to the window bottom
    expect(inset).toBeGreaterThan(400); // controls sit above the sheet's top edge
  });

  it('LocationSheet details (DETAILS, 92% snap): clears the taller sheet', () => {
    const inset = computeMapControlsInset(0, { kind: 'sheet', windowHeight, snapPoints, sheetIndex: 2 });
    expect(inset).toBeGreaterThan(736);
    expect(inset).toBeGreaterThan(computeMapControlsInset(0, { kind: 'sheet', windowHeight, snapPoints, sheetIndex: 1 }));
  });

  it('Route preview card: clears the card at its measured height', () => {
    const inset = computeMapControlsInset(0, { kind: 'measured', height: 184 });
    expect(inset).toBe(MIN_BOTTOM_FLOOR + 184 + OVERLAY_CONTROL_GAP);
  });

  it('never overlaps: inset always covers the overlay extent plus a positive gap', () => {
    for (const overlay of [
      { kind: 'none' as const },
      { kind: 'measured' as const, height: 184 },
      { kind: 'sheet' as const, windowHeight, snapPoints, sheetIndex: 0 },
      { kind: 'sheet' as const, windowHeight, snapPoints, sheetIndex: 1 },
      { kind: 'sheet' as const, windowHeight, snapPoints, sheetIndex: 2 },
    ]) {
      const inset = computeMapControlsInset(0, overlay);
      expect(inset).toBeGreaterThanOrEqual(resolveOverlayExtent(overlay) + OVERLAY_CONTROL_GAP);
    }
  });
});

describe('computeMapContentInsets — Google attribution must always have room to render (ATTR-001 follow-up)', () => {
  const windowHeight = 800;
  const snapPoints = ['15%', '50%', '92%'];
  const baseInputs = {
    top: 0,
    right: 80,
    bottomSafeArea: 0,
    windowHeight,
    snapPoints,
    navBarHeight: 0,
    navTopHeight: 0,
  };

  it('DETAILS at the 92% snap leaves at least MIN_TOP_VISIBLE_MAP_FOR_ATTRIBUTION of unobscured map at the top', () => {
    // 92% of 800 is 736, leaving only 64px of raw headroom — less than the reserved
    // minimum, so this only passes once computeMapContentInsets clamps bottom for it.
    const insets = computeMapContentInsets({ ...baseInputs, mode: 'DETAILS', sheetIndex: 2 });
    expect(windowHeight - insets.top - insets.bottom).toBeGreaterThanOrEqual(MIN_TOP_VISIBLE_MAP_FOR_ATTRIBUTION);
  });

  it('ROUTE_PREVIEW expanded to the 92% snap also reserves room for attribution', () => {
    const insets = computeMapContentInsets({ ...baseInputs, mode: 'ROUTE_PREVIEW', sheetIndex: 2 });
    expect(windowHeight - insets.top - insets.bottom).toBeGreaterThanOrEqual(MIN_TOP_VISIBLE_MAP_FOR_ATTRIBUTION);
  });

  it('PLACE_SELECTED at the ordinary 50% snap is unaffected by the clamp', () => {
    const insets = computeMapContentInsets({ ...baseInputs, mode: 'PLACE_SELECTED', sheetIndex: 1 });
    expect(insets.bottom).toBe(400); // exactly 50% of 800, same as before the fix
  });

  it('regression: a non-zero top (real device: 232dp leftover search-bar inset) must not let the band go negative', () => {
    // Exact runtime values captured on-device (Pixel 7 Pro, 3.5x density) that produced
    // a genuinely negative band (-136) pre-fix, hiding the Google logo entirely: the
    // first clamp only accounted for `bottom` against `windowHeight`, ignoring `top`.
    const insets = computeMapContentInsets({
      ...baseInputs,
      top: 232,
      windowHeight: 891.4285714285714,
      mode: 'DETAILS',
      sheetIndex: 2,
    });
    const band = 891.4285714285714 - insets.top - insets.bottom;
    expect(band).toBeGreaterThanOrEqual(MIN_TOP_VISIBLE_MAP_FOR_ATTRIBUTION);
  });
});

describe('computeMaxSheetOcclusionForAttribution — shared ceiling for mapPadding and BottomSheetModal.maxDynamicContentSize (ATTR-001 follow-up)', () => {
  // @gorhom/bottom-sheet's dynamic sizing (default on, v5) has no ceiling on its own —
  // without a shared cap, the sheet's *actual* rendered height and the padding clamp
  // computeMapContentInsets already applies could drift apart, letting the SDK draw the
  // logo somewhere a taller-than-assumed sheet still covers (Route Preview's clip).
  it('leaves exactly MIN_TOP_VISIBLE_MAP_FOR_ATTRIBUTION of headroom when that leaves more room than the safe area floor', () => {
    expect(computeMaxSheetOcclusionForAttribution(800, 0, 0)).toBe(800 - MIN_TOP_VISIBLE_MAP_FOR_ATTRIBUTION);
  });

  it('accounts for a non-zero top overlay (search bar/chip row) the same way computeMapContentInsets does', () => {
    expect(computeMaxSheetOcclusionForAttribution(800, 144, 0)).toBe(800 - 144 - MIN_TOP_VISIBLE_MAP_FOR_ATTRIBUTION);
  });

  it('never goes below the safe-area floor even on a short/degenerate window', () => {
    expect(computeMaxSheetOcclusionForAttribution(200, 100, 34)).toBe(34);
  });

  it('matches computeMapContentInsets\' own clamp for the same inputs, so the sheet ceiling and the padding clamp cannot drift apart', () => {
    const windowHeight = 800;
    const snapPoints = ['15%', '50%', '92%'];
    const top = 0;
    const bottomSafeArea = 24;
    const insets = computeMapContentInsets({
      mode: 'ROUTE_PREVIEW',
      top,
      right: 80,
      bottomSafeArea,
      windowHeight,
      snapPoints,
      sheetIndex: 2,
      navBarHeight: 0,
      navTopHeight: 0,
    });
    expect(insets.bottom).toBe(computeMaxSheetOcclusionForAttribution(
      windowHeight,
      top,
      bottomSafeArea,
      MIN_TOP_VISIBLE_MAP_FOR_ROUTE_PREVIEW,
    ));
  });
});

describe('Navigation mode: trip bar -> recenter -> compass/zoom stack', () => {
  it('resolveNavBarHeight uses the real measured height once it exists', () => {
    expect(resolveNavBarHeight(210, 34)).toBe(210);
  });

  it('resolveNavBarHeight falls back to a floor + fixed estimate before the first layout', () => {
    expect(resolveNavBarHeight(0, 34)).toBe(34 + NAV_BAR_FALLBACK_HEIGHT);
    expect(resolveNavBarHeight(0, 0)).toBe(MIN_BOTTOM_FLOOR + NAV_BAR_FALLBACK_HEIGHT);
  });

  it('recenter button sits directly above the trip bar', () => {
    expect(computeNavRecenterInset(210)).toBe(210 + OVERLAY_CONTROL_GAP);
  });

  it('compass/zoom stack sits above the recenter button, which sits above the trip bar', () => {
    const navBarHeight = 210;
    const recenterBottom = computeNavRecenterInset(navBarHeight);
    const controlsBottom = computeNavControlsInset(navBarHeight);
    expect(controlsBottom).toBe(recenterBottom + RECENTER_BUTTON_SIZE + OVERLAY_CONTROL_GAP);
    expect(controlsBottom).toBeGreaterThan(recenterBottom + RECENTER_BUTTON_SIZE); // never touches the recenter button
  });

  it('HomeScreen navControls and NavigationChrome recenter derive from the same trip-bar height, so they cannot drift apart', () => {
    const navBarHeight = resolveNavBarHeight(0, 24); // pre-layout fallback frame
    const recenterBottom = computeNavRecenterInset(navBarHeight);
    const navControlsBottom = computeNavControlsInset(navBarHeight);
    expect(navControlsBottom).toBeGreaterThan(recenterBottom);
  });
});

describe('computeMapControlsInset — extent is measured from the window bottom (#208 F1)', () => {
  it('does not add the bottom safe-area inset on top of a sheet extent that already includes it', () => {
    // A sheet reaches the window bottom, behind the 48 dp navigation bar, so its extent already contains the bar.
    // The old stackAbove(floor, extent, gap) counted the bar twice and left the stack 48 dp above the sheet.
    const windowHeight = 480;
    const inset = computeMapControlsInset(48, { kind: 'sheet', windowHeight, snapPoints: ['15%', '60%', '92%'], sheetIndex: 1 });
    expect(inset).toBeCloseTo(0.6 * windowHeight + OVERLAY_CONTROL_GAP, 5);
  });

  it('still rests above the bottom inset when nothing covers the map', () => {
    expect(computeMapControlsInset(48, { kind: 'none' })).toBe(48 + OVERLAY_CONTROL_GAP);
  });
});

describe('insetAwareSnapPoints (#128: place-preview CTA under the 3-button navigation bar)', () => {
  const base = ['15%', '50%', '92%'];

  it('leaves the snaps alone when the device has no bottom system inset', () => {
    expect(insetAwareSnapPoints(base, 480, 0)).toEqual(base);
  });

  it('adds the bottom inset to the middle snap only, so the visible part above the bar is still 50% of the container', () => {
    // 3-button navigation: 48 dp bar on the 479.6 dp container measured on the API 36 emulator.
    const [low, mid, high] = insetAwareSnapPoints(base, 479.6, 48);
    expect(low).toBe('15%');
    expect(high).toBe('92%');
    expect(parseFloat(mid)).toBeCloseTo(50 + (48 / 479.6) * 100, 1);
  });

  it('gesture navigation (24 dp) gets a smaller lift than 3-button (48 dp)', () => {
    const gesture = parseFloat(insetAwareSnapPoints(base, 479.6, 24)[1]);
    const threeButton = parseFloat(insetAwareSnapPoints(base, 479.6, 48)[1]);
    expect(gesture).toBeGreaterThan(50);
    expect(threeButton).toBeGreaterThan(gesture);
  });

  it('a larger system font raises the middle snap so the Directions button is not cut off at rest', () => {
    const normal = parseFloat(insetAwareSnapPoints(base, 479.6, 24)[1]);
    const large = parseFloat(insetAwareSnapPoints(base, 479.6, 24, 2)[1]);
    expect(large).toBeGreaterThan(normal);
    expect(large).toBeCloseTo(((PLACE_PREVIEW_CONTENT_DP * 1.29 + 24) / 479.6) * 100, 1);
    expect(insetAwareSnapPoints(base, 479.6, 24, 1)).toEqual(insetAwareSnapPoints(base, 479.6, 24));
  });

  it('on a short container the middle snap grows until the preview content, with its CTA, clears the bar', () => {
    // A 711 dp tall window leaves a ~371 dp container: 50% plus the 48 dp bar (233 dp visible) would leave the
    // 240 dp of preview content, and its Directions button, behind the three-button bar.
    const container = 371;
    const mid = parseFloat(insetAwareSnapPoints(base, container, 48)[1]);
    expect((mid / 100) * container).toBeGreaterThanOrEqual(PLACE_PREVIEW_CONTENT_DP + 48 - 1);
    expect(mid).toBeLessThan(92);
  });

  it('on a tall container the content minimum changes nothing', () => {
    const mid = parseFloat(insetAwareSnapPoints(base, 900, 48)[1]);
    expect(mid).toBeCloseTo(50 + (48 / 900) * 100, 1);
  });

  it('never lifts the middle snap to or past the top snap', () => {
    const [, mid] = insetAwareSnapPoints(base, 100, 80);
    expect(parseFloat(mid)).toBeLessThan(92);
  });

  it('returns the input unchanged for an unusable container height', () => {
    expect(insetAwareSnapPoints(base, 0, 48)).toEqual(base);
    expect(insetAwareSnapPoints(base, -10, 48)).toEqual(base);
  });
});

describe('resolveControlStackPlacement — follows the real sheet top (#208 F1)', () => {
  const base = { windowHeight: 914, floor: 16, topOverlayBottom: 275, stackHeight: 230 };

  it('sits OVERLAY_CONTROL_GAP above the measured sheet top, not above a declared snap percentage', () => {
    // Place preview on the 1080x2400 emulator: the sheet top is ~674dp down, i.e. ~240dp of sheet.
    const placement = resolveControlStackPlacement({ ...base, sheetTopY: 674 });
    expect(placement).toEqual({ bottom: 914 - 674 + OVERLAY_CONTROL_GAP, visible: true });
  });

  it('falls back to the resting offset for gorhom\'s pre-layout sentinel and a closed sheet', () => {
    for (const sheetTopY of [914, 2400, Number.NaN, Infinity]) {
      expect(resolveControlStackPlacement({ ...base, sheetTopY })).toEqual({ bottom: 32, visible: true });
    }
  });

  it('never goes below the safe-area floor', () => {
    expect(resolveControlStackPlacement({ ...base, floor: 48, sheetTopY: 910 }).bottom).toBe(48 + OVERLAY_CONTROL_GAP);
  });

  it('hides the stack instead of letting it reach the search/chip row when the sheet is too tall', () => {
    // 92% detent: only ~160dp of map remains below the overlays, less than the 230dp stack.
    expect(resolveControlStackPlacement({ ...base, sheetTopY: 435 })).toEqual({ bottom: 914 - 435 + OVERLAY_CONTROL_GAP, visible: false });
    expect(resolveControlStackPlacement({ ...base, sheetTopY: 0 }).visible).toBe(false);
  });

  it('stays visible exactly when the stack fits between the overlays and the sheet', () => {
    const fits = base.topOverlayBottom + base.stackHeight + OVERLAY_CONTROL_GAP;
    expect(resolveControlStackPlacement({ ...base, sheetTopY: fits }).visible).toBe(true);
    expect(resolveControlStackPlacement({ ...base, sheetTopY: fits - 1 }).visible).toBe(false);
  });
});


describe('routePreviewSnapPoints (#307, EMU-N1): Directions detents must clear the system navigation bar', () => {
  it('keeps the existing detents with gesture navigation and no bottom inset', () => {
    expect(routePreviewSnapPoints(900, 0)).toEqual(['15%', '79%', '92%']);
  });

  it('lifts collapsed and partial on a three-button bar while leaving full unchanged', () => {
    const [collapsed, middle, top] = routePreviewSnapPoints(480, 48);
    expect(parseFloat(collapsed)).toBeGreaterThanOrEqual(((48 + 72) / 480) * 100);
    expect(parseFloat(middle)).toBeCloseTo(79 + (48 / 480) * 100, 1);
    expect(top).toBe('92%');
  });

  it('adds only the actual inset at partial so a minimal gesture inset does not create excess space', () => {
    const [, noInset] = routePreviewSnapPoints(640, 0);
    const [, gestureInset] = routePreviewSnapPoints(640, 8);
    expect(parseFloat(gestureInset) - parseFloat(noInset)).toBeCloseTo((8 / 640) * 100, 1);
  });

  it('never exceeds the middle detent on a very short container', () => {
    const [collapsed] = routePreviewSnapPoints(200, 60);
    expect(parseFloat(collapsed)).toBeLessThan(79);
  });
});

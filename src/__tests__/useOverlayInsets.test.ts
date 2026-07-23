/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  computeMapControlsInset,
  computeNavControlsInset,
  computeNavRecenterInset,
  MIN_BOTTOM_FLOOR,
  NAV_BAR_FALLBACK_HEIGHT,
  OVERLAY_CONTROL_GAP,
  RECENTER_BUTTON_SIZE,
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
    expect(inset).toBe(MIN_BOTTOM_FLOOR + 400 + OVERLAY_CONTROL_GAP);
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

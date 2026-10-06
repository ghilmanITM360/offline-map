/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// The sheet's FULL detent is derived from the real window and the top safe-area inset — it stops just below the
// status bar and gives the content the rest of the screen — instead of a fixed 92% of a container that already had a
// 160/280 dp map band cut out of it (which left FULL at roughly half of a phone screen).

import {
  FULL_SHEET_TOP_GAP,
  fullSheetHeight,
  MIN_TOP_VISIBLE_MAP_FOR_ROUTE_PREVIEW,
  routePreviewSnapPoints,
  withFullDetent,
} from '../viewmodels/useOverlayInsets';

describe('fullSheetHeight', () => {
  test('is the window minus the status bar and a small gap', () => {
    expect(fullSheetHeight(900, 48)).toBe(900 - 48 - FULL_SHEET_TOP_GAP);
  });

  test('works with no top inset (gesture phones without a cutout)', () => {
    expect(fullSheetHeight(800, 0)).toBe(800 - FULL_SHEET_TOP_GAP);
  });

  test('never goes negative on a degenerate window', () => {
    expect(fullSheetHeight(0, 48)).toBe(0);
    expect(fullSheetHeight(30, 48)).toBe(0);
  });
});

describe('withFullDetent', () => {
  const containerFor = (windowHeight: number) => windowHeight - MIN_TOP_VISIBLE_MAP_FOR_ROUTE_PREVIEW;

  test.each([
    ['411 x 900 phone', 900, 48],
    ['320 x 568 small phone', 568, 24],
    ['411 x 800 phone, no cutout', 800, 0],
  ])('%s: the top detent reaches FULL, the lower detents are untouched', (_name, windowHeight, topInset) => {
    const container = containerFor(windowHeight);
    const declared = routePreviewSnapPoints(container, 34);
    const next = withFullDetent(declared, container, fullSheetHeight(windowHeight, topInset));

    expect(next.slice(0, 2)).toEqual(declared.slice(0, 2));
    const fullPx = (parseFloat(next[2]) / 100) * container;
    expect(fullPx).toBeCloseTo(windowHeight - topInset - FULL_SHEET_TOP_GAP, 1);
    // FULL is far more than the old 92% of the reduced container.
    expect(fullPx).toBeGreaterThan((parseFloat(declared[2]) / 100) * container);
  });

  test('never shrinks the declared top detent', () => {
    const declared = ['15%', '50%', '92%'];
    expect(withFullDetent(declared, 400, 100)).toEqual(declared);
  });

  test('leaves snap lists it does not understand alone', () => {
    expect(withFullDetent(['15%', '50%'], 400, 800)).toEqual(['15%', '50%']);
    expect(withFullDetent(['15%', '50%', '92%'], 0, 800)).toEqual(['15%', '50%', '92%']);
  });
});

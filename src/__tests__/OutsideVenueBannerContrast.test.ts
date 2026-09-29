/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { staticColors } from '../theme';

// Relative-luminance WCAG 2.2 contrast ratio; see issue #150.
function channel(c: number) {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}
function luminance(hex: string) {
  const n = parseInt(hex.replace('#', ''), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}
function contrastRatio(hexA: string, hexB: string) {
  const [l1, l2] = [luminance(hexA), luminance(hexB)].sort((a, b) => b - a);
  return (l1 + 0.05) / (l2 + 0.05);
}

describe('Outside-Ijtema banner contrast (#150)', () => {
  test('white text on the banner background meets WCAG AA (>=4.5:1)', () => {
    const ratio = contrastRatio('#FFFFFF', staticColors.weakGpsBackground);
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });

  test('the previously-failing color would not have passed', () => {
    const ratio = contrastRatio('#FFFFFF', '#F29900');
    expect(ratio).toBeLessThan(4.5);
  });
});

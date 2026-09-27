/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { staticColors } from '../theme';

// Relative-luminance WCAG 2.2 contrast ratio — same method used elsewhere in this
// codebase's audit docs (docs/audit/ui-ux/SPLASH_SCREEN_DEEP_AUDIT.md).
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

describe('Permission screen loading-state button contrast (PERM-005)', () => {
  test('white spinner on the disabled/loading button background meets WCAG 1.4.11 (>=3:1)', () => {
    const ratio = contrastRatio('#FFFFFF', staticColors.focusedBlock);
    expect(ratio).toBeGreaterThanOrEqual(3);
  });

  test('the previously-failing color would not have passed', () => {
    const ratio = contrastRatio('#FFFFFF', '#A5D6A7');
    expect(ratio).toBeLessThan(3);
  });
});

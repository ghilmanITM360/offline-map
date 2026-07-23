/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Corner-radius scale derived from observed values (7, 8, 9, 12, 14, 16, 18, 20, 24, 28).
// `pill` is a sentinel for "half of height" (circular buttons, search bar) — apply as
// `Math.min(height, width) / 2` at the call site rather than a fixed number.
export const radii = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  pill: 999,
} as const;

export type RadiusToken = keyof typeof radii;

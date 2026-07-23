/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Scale derived from the padding/margin/gap values already in use across
// LocationSheet/HomeScreen/navOverlayStyles (4, 8, 10, 12, 14, 16, 18, 20, 24, 32) —
// rounded to a consistent step so new code stops picking arbitrary in-between values.
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export type SpacingToken = keyof typeof spacing;

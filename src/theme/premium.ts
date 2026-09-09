/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Design tokens for the three approved-reference "premium" surfaces (Welcome,
 * Locations Directory, Get Directions/Route Preview) — sampled by eye from the
 * approved screenshots, not app-wide theme colors. Deliberately separate from
 * `theme/colors.ts` (`staticColors`/`AppTheme`): those drive every other screen's
 * light/dark behavior, and this redesign is scoped to these three surfaces only
 * (see PR notes — do not mass-replace colors app-wide without evidence).
 */
export const premium = {
  canvas: '#FBF7EF',
  canvasAlt: '#F3EDE0',
  card: '#FFFFFF',
  border: '#E8E1D2',
  primary: '#0E5C46',
  primaryPressed: '#0A4536',
  primarySoft: '#E7F2EC',
  mint: '#DFF0E7',
  originBlue: '#1A73E8',
  originBlueSoft: '#E8F0FE',
  textPrimary: '#16241F',
  textMuted: '#79766B',
  illustration: '#CFE3D8',
} as const;

export type PremiumColorToken = keyof typeof premium;

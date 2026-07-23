/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export { staticColors, themeColors } from './colors';
export type { StaticColorToken } from './colors';
export { typography } from './typography';
export { spacing } from './spacing';
export type { SpacingToken } from './spacing';
export { radii } from './radii';
export type { RadiusToken } from './radii';
export { shadows } from './shadows';
export { markerSizes, markerColors } from './markers';
export type { MarkerSizeToken, MarkerColorToken } from './markers';

// Re-exported so `src/theme` is the single import surface for anything design-system
// related, without duplicating ThemeService's light/dark source of truth.
export { LIGHT_THEME, DARK_THEME } from '../services/ThemeService';
export type { AppTheme } from '../services/ThemeService';
export { useTheme } from '../services/useTheme';

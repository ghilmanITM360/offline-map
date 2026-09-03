/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { AppTheme } from '../services/ThemeService';

/**
 * Thin adapter over `ThemeService`'s `AppTheme` — not a second source of truth.
 * Chrome components that want the Phase 8A semantic names (backgroundPrimary,
 * textPrimary, etc.) read them through this instead of reaching into `AppTheme`
 * fields (background, text, ...) directly. `ThemeService`/`useTheme()` stay the
 * single place light/dark values are defined.
 */
export function themeColors(theme: AppTheme) {
  return {
    backgroundPrimary: theme.background,
    backgroundSecondary: theme.card,
    surface: theme.card,
    textPrimary: theme.text,
    textSecondary: theme.subtext,
    divider: theme.border,
    primary: theme.primary,
    accent: theme.accent,
    danger: theme.danger,
  };
}

/**
 * Colors that do not vary with light/dark mode: map-canvas rendering (block/route
 * polygons and polylines, markers) and status surfaces. None of these switched with
 * theme before this pass either — values here are copied verbatim from the call
 * sites they replace (BlockLayer.tsx, NavigationMapLayersV1/V2.tsx, HomeScreen.tsx,
 * navOverlayStyles.ts, LocationSheet.tsx) so migrating a file to these tokens is a
 * pixel-identical, behavior-preserving change.
 */
export const staticColors = {
  // status
  success: '#2E7D32',
  warning: '#F9AB00',
  warningBackground: '#FFF6E5',
  warningText: '#7C4A03',
  danger: '#D32F2F',
  dangerBackground: '#FDECEC',
  dangerBorder: '#F28B82',
  dangerText: '#C5221F',
  info: '#1A73E8',
  infoBackground: '#EEF3FD',
  infoBorder: '#D7E3FC',
  infoStrong: '#174EA6',

  // map / route semantics (Phase 8A task 2)
  selectedBlock: '#1A73E8',
  normalBlock: '#2E7D32',
  focusedBlock: '#1B5E20',
  selectedRoute: '#1A73E8',
  normalRoute: 'rgba(60,64,67,0.55)',
  routeInside: '#1A73E8',
  routeOutside: '#E67C00',
  // Dimmed variant of routeInside for the already-walked portion of the active-nav
  // route line (Google Maps style progress: behind = dim, ahead = bright).
  routeWalked: 'rgba(26,115,232,0.35)',
  // Phase 8B task 3 — shared white casing drawn under every route leg (preview
  // and active-nav alike) for contrast against varied map tile colors, replacing
  // each render site's own one-off translucent casing color.
  routeCasing: 'rgba(255,255,255,0.95)',
  userLocation: '#1A73E8',
  userAccuracyFill: 'rgba(66,133,244,0.15)',
  userAccuracyStroke: 'rgba(66,133,244,0.4)',
  destination: '#2E7D32',
  gateAccent: '#EA4335',
  // POI facility markers (masjid, food, water, medical, parking, terminals, help)
  // — distinct from block green / gate red / route blue so the map's tappable
  // object families stay visually distinguishable at a glance.
  facilityAccent: '#00897B',
  // Special routes / Shahr-e-Pindal polylines and labels — previously only existed
  // as raw literals duplicated across SpecialRouteLayer.tsx and mapLayerStyles.ts.
  // Values copied verbatim from those call sites (pixel-identical migration).
  specialRouteAccent: '#8E24AA',
  specialRouteAccentFocused: '#6A0DAD',

  // neutrals used on chrome that's white/dark regardless of app theme (button labels,
  // icons on colored surfaces, hairline borders drawn over the map)
  white: '#FFFFFF',
  black: '#000000',
  border: '#DADCE0',
  borderLight: '#E5E7EB',
  textMuted: '#80868B',
  iconMuted: '#5F6368',
  textPrimary: '#202124',

  // extra status/brand surfaces (Phase 8A.5 task 1) — navigation overlay banners, exit
  // button, arrival card, splash/drawer header, copied verbatim from their call sites.
  startMarker: '#0B8043',
  arrivalGreen: '#2E7D32',
  // Darkened from #F29900 during the accessibility font-size pass: white text on the
  // original orange failed WCAG AA (2.25:1). Same hue, lower lightness — #946500 passes
  // at 5.10:1.
  weakGpsBackground: '#946500',
  // Darkened from #F57C00 for the same reason: white rerouteText on it failed AA
  // (2.70:1). #A85100 keeps the hue, passes at 5.47:1.
  rerouteBackground: '#A85100',
  neutralSurface: '#F1F3F4',
  exitDanger: '#D32F2F',
  destNameMuted: '#888',
  drawerHeaderBackground: '#2E7D32',
  lightGreenSubtext: '#E8F5E9',
  drawerText: '#333',
  drawerDivider: '#EEEEEE',
  drawerFaint: '#AAA',
  switchThumbOff: '#F4F4F4',
  entryGateBackground: 'rgba(232,245,233,0.96)',
  entryGateBorder: '#A5D6A7',
  bannerTranslucentWhite: 'rgba(255,255,255,0.9)',
  routePreviewBorder: '#D2E3FC',
  routePreviewPill: '#E8F0FE',
  textSecondaryStrong: '#3C4043',

  // marker-specific (Phase 8A.5 task 2) — gate touch-target dot fill/warning, distinct
  // from the block/route blues above (verified not pixel-equal, kept separate).
  gateMarkerDot: '#1565C0',
  gateMarkerWarning: '#E65100',

  // LocationSheet-specific (Phase 8B task 2) — copied verbatim from LocationSheet.tsx's
  // own literals; kept distinct from similarly-named tokens above where the source value
  // actually differed (e.g. warningBackgroundAlt vs warningBackground).
  iconSubtle: '#70757A',
  sheetBackground: '#F5F7FA',
  textCaption: '#6B7280',
  warningBackgroundAlt: '#FFF3E0',
  gateChipBackground: '#FFF5F5',
  starActive: '#FBC02D',

  // HomeScreen search bar / search overlay (Phase 8B task 1) — copied verbatim.
  iconFaint: '#BDC1C6',
  recenterBlue: '#4285F4',
} as const;

export type StaticColorToken = keyof typeof staticColors;

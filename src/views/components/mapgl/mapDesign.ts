/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Ijtema map design system (#140). The map is for a person who has never used a map: calm ground, a few strong things.
// This file is the single place that says what outranks what; overlaySpec/basemapStyle read the numbers from here.

/** Most important first. Visual weight (size, colour contrast, line width) must follow this order. */
export const MAP_VISUAL_PRIORITY = [
  'user',
  'activeRoute',
  'destination',
  'start',
  'blocks',
  'gates',
  'majorPaths', // the venue's rastas
  'secondaryPaths', // basemap footways / minor roads
  'specialRoutes', // Shahr-e-Pindal
  'facilities',
  'surroundings', // basemap land, water, buildings, roads outside the venue
] as const;
export type MapVisualLayer = (typeof MAP_VISUAL_PRIORITY)[number];

/** Line widths (dp) of the static layers; the active route (7 + 11 casing) must out-weigh every one of them. */
export const MAP_LINE_WIDTH = {
  activeRoute: 7,
  activeRouteCasing: 11,
  /** Already-walked part of the active route: clearly secondary to the remaining part. */
  walkedRoute: 4.5,
  rastaLine: 4,
  rastaCasing: 6.5,
  rastaSelected: 6,
  rastaSelectedCasing: 11,
  specialRoute: 3.2,
  specialRouteFocused: 5,
  specialRouteSelected: 7,
  blockStroke: 1.2,
  blockStrokeFocused: 2,
  blockStrokeSelected: 3,
} as const;

export const MAP_COLORS = {
  rastaCasing: 'rgba(60,64,67,0.32)',
  rastaCasingFocused: 'rgba(32,33,36,0.50)',
  rastaCasingSelected: 'rgba(26,115,232,0.55)',
  special: 'rgba(142,36,170,0.80)',
  specialFocused: 'rgba(106,13,173,0.85)',
  specialSelected: '#6A0DAD',
  blockFill: 'rgba(46,125,50,0.10)',
  blockFillFocused: 'rgba(46,125,50,0.22)',
  blockFillSelected: 'rgba(26,115,232,0.30)',
} as const;

/** Special routes are distinguishable from walking paths by pattern as well as colour (colour-blind safe). */
export const SPECIAL_ROUTE_DASH = [3, 1.6];

/** Facility badges are secondary context: smaller at the venue overview, full size once the user is close. */
export const FACILITY_ICON_SIZE_BY_ZOOM = ['interpolate', ['linear'], ['zoom'], 14, 0.55, 16.5, 0.9];

/**
 * Destination pulse: ONE outward ring when a destination is chosen, then nothing. Phases are paint states of a
 * single layer, so the animation is MapLibre's own paint transition (no per-frame JS, no layer remount).
 * 'start' parks the ring small and visible without animating, 'out' expands and fades it, 'static' is the
 * reduced-motion emphasis, 'idle' is invisible.
 */
export type PulsePhase = 'idle' | 'start' | 'out' | 'static';
export const PULSE_DURATION_MS = 800;
export const PULSE_COLOR = '#1A73E8';
export const PULSE_PAINT: Record<PulsePhase, { radius: number; opacity: number; transitionMs: number }> = {
  idle: { radius: 10, opacity: 0, transitionMs: 0 },
  start: { radius: 10, opacity: 0.55, transitionMs: 0 },
  out: { radius: 44, opacity: 0, transitionMs: PULSE_DURATION_MS },
  static: { radius: 24, opacity: 0.3, transitionMs: 0 },
};

/** Route reveal (start -> destination) when a route becomes ready; presentation only, 600-900 ms. */
export const ROUTE_REVEAL_MS = 750;

/** The replaced route fades out over this long while the new one reveals (reroute). */
export const ROUTE_FADE_MS = 300;

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// One authoritative, copy-free answer to "what is this journey right now?". The Directions UI renders from it and
// never infers the state from coordinates, distances, provider names, start-source strings or route styling.

import {
  isJourneyStartable,
  selectJourneyPresentationState,
  type JourneyPresentationInput,
  type JourneyPresentationState,
} from '../services/JourneyPresentationState';

const walkingRoute = { outsideRoute: null };
const googleRoute = { outsideRoute: { provider: 'google' as const } };
const osmRoute = { outsideRoute: { provider: 'offline-osm' as const } };
const directRoute = { outsideRoute: { provider: 'direct-guide' as const } };

const base = (over: Partial<JourneyPresentationInput>): JourneyPresentationInput => ({
  loadState: 'ready',
  startSource: 'live_gps',
  route: walkingRoute,
  ...over,
});
const state = (over: Partial<JourneyPresentationInput>): JourneyPresentationState => selectJourneyPresentationState(base(over));

describe('selectJourneyPresentationState: one state per journey', () => {
  test('a route still being calculated is CALCULATING', () => {
    expect(state({ loadState: 'loading', route: null })).toBe('CALCULATING');
    expect(state({ loadState: 'idle', route: null })).toBe('CALCULATING');
  });

  test('no start yet is NEEDS_START, whatever the start source says', () => {
    for (const startSource of ['live_gps', 'manual_place', 'remembered_location', 'device_last_known'] as const) {
      expect(state({ loadState: 'needs_origin', startSource, route: null })).toBe('NEEDS_START');
    }
  });

  test('a ready route from a live fix is LIVE_READY, inside or on a real outside walking route', () => {
    expect(state({ route: walkingRoute })).toBe('LIVE_READY');
    expect(state({ route: googleRoute })).toBe('LIVE_READY');
    expect(state({ route: osmRoute })).toBe('LIVE_READY');
  });

  test('a ready route from a chosen, remembered or earlier-known start is MANUAL_GUIDE_READY', () => {
    for (const startSource of ['manual_place', 'remembered_location', 'device_last_known'] as const) {
      expect(state({ startSource })).toBe('MANUAL_GUIDE_READY');
    }
  });

  test('a straight-line outside guide is OUTSIDE_VENUE_GUIDE for every start source, never a walking route', () => {
    for (const startSource of ['live_gps', 'manual_place', 'remembered_location', 'device_last_known'] as const) {
      expect(state({ startSource, route: directRoute })).toBe('OUTSIDE_VENUE_GUIDE');
    }
  });

  test('failure and same place are their own states', () => {
    expect(state({ loadState: 'error', route: null })).toBe('ROUTE_FAILURE');
    expect(state({ loadState: 'same_place', route: null })).toBe('SAME_PLACE');
  });

  test('navigation states outrank the preview states', () => {
    expect(state({ navigation: 'active' })).toBe('ACTIVE_NAVIGATION');
    expect(state({ navigation: 'arrived' })).toBe('ARRIVED');
    expect(state({ navigation: 'arrived', loadState: 'error', route: null })).toBe('ARRIVED');
  });
});

describe('selectJourneyPresentationState: contradictory combinations are impossible', () => {
  test('"ready" with no route is a failure, never a ready route', () => {
    expect(state({ loadState: 'ready', route: null })).toBe('ROUTE_FAILURE');
    expect(isJourneyStartable('ROUTE_FAILURE')).toBe(false);
  });

  test('a stale route never survives a destination-only journey that has no start', () => {
    expect(state({ loadState: 'needs_origin', startSource: 'manual_place', route: directRoute })).toBe('NEEDS_START');
    expect(state({ loadState: 'needs_origin', startSource: 'live_gps', route: walkingRoute })).toBe('NEEDS_START');
  });

  test('same place never reads as a normal ready route, even if a route object is still around', () => {
    expect(state({ loadState: 'same_place', route: walkingRoute })).toBe('SAME_PLACE');
  });

  test('a failure never reads as startable, even with a leftover route', () => {
    expect(state({ loadState: 'error', route: walkingRoute })).toBe('ROUTE_FAILURE');
    expect(isJourneyStartable(state({ loadState: 'error', route: walkingRoute }))).toBe(false);
  });

  test('a straight-line guide is never reported as an internal walking route, whatever else is true', () => {
    for (const startSource of ['live_gps', 'manual_place'] as const) {
      const result = state({ startSource, route: directRoute });
      expect(result).not.toBe('LIVE_READY');
      expect(result).not.toBe('MANUAL_GUIDE_READY');
    }
  });

  test('arrival is never an active reroute or a preview', () => {
    const result = state({ navigation: 'arrived', route: directRoute });
    expect(result).toBe('ARRIVED');
    expect(result).not.toBe('ACTIVE_NAVIGATION');
  });

  test('only a ready route is startable', () => {
    const startable = new Set<JourneyPresentationState>(['LIVE_READY', 'MANUAL_GUIDE_READY', 'OUTSIDE_VENUE_GUIDE']);
    const all: JourneyPresentationState[] = [
      'CALCULATING', 'NEEDS_START', 'LIVE_READY', 'MANUAL_GUIDE_READY', 'OUTSIDE_VENUE_GUIDE',
      'ROUTE_FAILURE', 'SAME_PLACE', 'ACTIVE_NAVIGATION', 'ARRIVED',
    ];
    for (const s of all) expect(isJourneyStartable(s)).toBe(startable.has(s));
  });
});

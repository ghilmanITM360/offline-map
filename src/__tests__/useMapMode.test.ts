/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { deriveMapMode, MapModeInputs } from '../viewmodels/useMapMode';

const base: MapModeInputs = {
  arrived: false,
  showNavOverlay: false,
  detailsExpanded: false,
  directionsDestination: null,
  activePreviewRoute: null,
  selectedPlace: null,
};

describe('deriveMapMode', () => {
  it('defaults to EXPLORE with nothing active', () => {
    expect(deriveMapMode(base)).toBe('EXPLORE');
  });

  it('is PLACE_SELECTED when a place is selected', () => {
    expect(deriveMapMode({ ...base, selectedPlace: { id: 'p1' } })).toBe('PLACE_SELECTED');
  });

  it('is ROUTE_PREVIEW when picking a directions destination, even with no route yet', () => {
    expect(deriveMapMode({ ...base, directionsDestination: { id: 'p1' } })).toBe('ROUTE_PREVIEW');
  });

  it('is ROUTE_PREVIEW when an active preview route exists', () => {
    expect(deriveMapMode({ ...base, activePreviewRoute: { id: 'r1' } })).toBe('ROUTE_PREVIEW');
  });

  it('stays ROUTE_PREVIEW when both a directions destination and a preview route are set', () => {
    // This is the exact case a HomeScreen regression test caught: the merged ROUTE_PREVIEW
    // value must not silently distinguish "still picking a start point" from "route ready" —
    // callers that need that distinction check `directionsDestination` directly alongside mode.
    expect(
      deriveMapMode({ ...base, directionsDestination: { id: 'p1' }, activePreviewRoute: { id: 'r1' } }),
    ).toBe('ROUTE_PREVIEW');
  });

  it('DETAILS outranks PLACE_SELECTED/ROUTE_PREVIEW', () => {
    expect(deriveMapMode({ ...base, detailsExpanded: true, selectedPlace: { id: 'p1' } })).toBe('DETAILS');
    expect(
      deriveMapMode({ ...base, detailsExpanded: true, activePreviewRoute: { id: 'r1' } }),
    ).toBe('DETAILS');
  });

  it('NAVIGATION outranks DETAILS and everything below it', () => {
    expect(
      deriveMapMode({
        ...base,
        showNavOverlay: true,
        detailsExpanded: true,
        activePreviewRoute: { id: 'r1' },
      }),
    ).toBe('NAVIGATION');
  });

  it('ARRIVAL outranks everything, including NAVIGATION', () => {
    expect(deriveMapMode({ ...base, arrived: true, showNavOverlay: true })).toBe('ARRIVAL');
  });

  // Phase 7 (Google Maps style navigation experience) required transition tests, named to
  // match the feature spec verbatim.
  it('Start button changes ROUTE_PREVIEW -> NAVIGATION', () => {
    const routePreviewInputs = { ...base, activePreviewRoute: { id: 'r1' } };
    expect(deriveMapMode(routePreviewInputs)).toBe('ROUTE_PREVIEW');
    // Pressing Start flips showNavOverlay true (via startNavigation()/isNavigating in the
    // store) — activePreviewRoute is cleared once isNavigating is true (see HomeScreen's
    // activePreviewRoute memo), but NAVIGATION already outranks ROUTE_PREVIEW even if it
    // weren't, so the transition holds either way.
    expect(deriveMapMode({ ...routePreviewInputs, activePreviewRoute: null, showNavOverlay: true })).toBe('NAVIGATION');
  });

  it('Arrival detection changes NAVIGATION -> ARRIVAL', () => {
    const navigatingInputs = { ...base, showNavOverlay: true };
    expect(deriveMapMode(navigatingInputs)).toBe('NAVIGATION');
    // GPS reaching the destination flips the real arrived signal (navOverlay.arrived /
    // navOverlayV1.arrived in HomeScreen) true.
    expect(deriveMapMode({ ...navigatingInputs, arrived: true })).toBe('ARRIVAL');
  });

  it('Exit navigation returns to EXPLORE', () => {
    const arrivalInputs = { ...base, showNavOverlay: true, arrived: true };
    expect(deriveMapMode(arrivalInputs)).toBe('ARRIVAL');
    // Exiting clears isNavigating/activeRoute (showNavOverlay -> false) and resets the
    // arrived flag (NavigationViewModelV2's route-change effect / v1's destination-change
    // effect both reset arrived on exit) — with nothing else set, mode falls back to EXPLORE.
    expect(deriveMapMode({ ...arrivalInputs, showNavOverlay: false, arrived: false })).toBe('EXPLORE');
  });

  // Phase 7 stabilization audit — full lifecycle in one sequence, not just pairwise transitions.
  it('full lifecycle: NAVIGATION -> ARRIVAL -> EXPLORE', () => {
    expect(deriveMapMode({ ...base, showNavOverlay: true })).toBe('NAVIGATION');
    expect(deriveMapMode({ ...base, showNavOverlay: true, arrived: true })).toBe('ARRIVAL');
    expect(deriveMapMode({ ...base, showNavOverlay: false, arrived: false })).toBe('EXPLORE');
  });
});

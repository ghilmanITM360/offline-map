/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { deriveMapMode, MapModeInputs } from '../viewmodels/useMapMode';

const base: MapModeInputs = {
  arrived: false,
  showNavOverlay: false,
  isSearchFocused: false,
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

  it('SEARCH outranks PLACE_SELECTED/ROUTE_PREVIEW', () => {
    expect(
      deriveMapMode({
        ...base,
        isSearchFocused: true,
        selectedPlace: { id: 'p1' },
        activePreviewRoute: { id: 'r1' },
      }),
    ).toBe('SEARCH');
  });

  it('DETAILS outranks PLACE_SELECTED/ROUTE_PREVIEW but not SEARCH', () => {
    expect(deriveMapMode({ ...base, detailsExpanded: true, selectedPlace: { id: 'p1' } })).toBe('DETAILS');
    expect(
      deriveMapMode({ ...base, detailsExpanded: true, isSearchFocused: true, selectedPlace: { id: 'p1' } }),
    ).toBe('SEARCH');
  });

  it('NAVIGATION outranks SEARCH and everything below it', () => {
    expect(
      deriveMapMode({
        ...base,
        showNavOverlay: true,
        isSearchFocused: true,
        activePreviewRoute: { id: 'r1' },
      }),
    ).toBe('NAVIGATION');
  });

  it('ARRIVAL outranks everything, including NAVIGATION', () => {
    expect(deriveMapMode({ ...base, arrived: true, showNavOverlay: true })).toBe('ARRIVAL');
  });
});

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Animated } from 'react-native';

import { render, screen } from './test-utils';
import type { Place, RoutePreview } from '../models/types';
import type { NavigationOverlayV1 } from '../viewmodels/useNavigationOverlayV1';
import { NavigationMapLayersV1 } from '../views/components/navigation/NavigationMapLayersV1';

const destination: Place = {
  id: 'GATE_08',
  name: 'Gate 8',
  category: 'Gate',
  description: 'Official Gate 8.',
  coordinate: { latitude: 24.903, longitude: 67.103 },
  sourceVersion: 'v1',
};

const route: RoutePreview = {
  id: 'route-v1',
  nodes: ['A', 'B'],
  coordinates: [
    { latitude: 24.9, longitude: 67.1 },
    destination.coordinate,
  ],
  totalDistance: 300,
  estimatedTimeMin: 5,
  segments: [],
} as RoutePreview;

function overlay(overrides: Partial<NavigationOverlayV1> = {}): NavigationOverlayV1 {
  return {
    route,
    destination,
    snappedLocation: { latitude: 24.901, longitude: 67.101 },
    arrived: false,
    reroutePending: false,
    mapLayers: {
      venueBoundary: [
        { latitude: 24.89, longitude: 67.09 },
        { latitude: 24.91, longitude: 67.11 },
      ],
      blocks: [],
      edges: [],
    },
    userPulseAnim: new Animated.Value(0),
    currentLocationSource: 'gps',
    ...overrides,
  } as unknown as NavigationOverlayV1;
}

function expectNoBrowseMarkerSet() {
  expect(screen.queryByTestId('browse-user-location-marker')).not.toBeOnTheScreen();
  expect(screen.queryByTestId('browse-user-accuracy-circle')).not.toBeOnTheScreen();
  expect(screen.queryByTestId('selected-place-marker')).not.toBeOnTheScreen();
}

describe('NavigationMapLayersV1 marker ownership', () => {
  test('navigation renders one START, destination, and snapped user without browse identities', async () => {
    await render(<NavigationMapLayersV1 overlay={overlay()} />);

    expect(screen.getAllByTestId('navigation-start-marker')).toHaveLength(1);
    expect(screen.getAllByTestId('navigation-destination-marker')).toHaveLength(1);
    expect(screen.getAllByTestId('navigation-user-location-marker')).toHaveLength(1);
    expectNoBrowseMarkerSet();
  });

  test('arrival removes START and keeps exactly one destination and snapped user identity', async () => {
    await render(<NavigationMapLayersV1 overlay={overlay({ arrived: true })} />);

    expect(screen.queryByTestId('navigation-start-marker')).not.toBeOnTheScreen();
    expect(screen.getAllByTestId('navigation-destination-marker')).toHaveLength(1);
    expect(screen.getAllByTestId('navigation-user-location-marker')).toHaveLength(1);
    expectNoBrowseMarkerSet();
  });

  test('arrival without snapped location leaves user identity to the Home fallback', async () => {
    await render(<NavigationMapLayersV1 overlay={overlay({ arrived: true, snappedLocation: null })} />);

    expect(screen.queryByTestId('navigation-start-marker')).not.toBeOnTheScreen();
    expect(screen.getAllByTestId('navigation-destination-marker')).toHaveLength(1);
    expect(screen.queryByTestId('navigation-user-location-marker')).not.toBeOnTheScreen();
    expectNoBrowseMarkerSet();
  });

  test('#157: START, destination, and user markers expose an accessible name', async () => {
    await render(<NavigationMapLayersV1 overlay={overlay()} />);

    expect(screen.getByTestId('navigation-start-marker').props.accessibilityLabel).toBe('Start');
    expect(screen.getByTestId('navigation-destination-marker').props.accessibilityLabel).toBeTruthy();
    expect(screen.getByTestId('navigation-user-location-marker').props.accessibilityLabel).toBe('Your location');
  });

  test('#157: START, destination, and user markers carry a native title so TalkBack does not say "Map Marker"', async () => {
    // Android's Google Maps SDK names a marker from its title and ignores accessibilityLabel (react-native-maps#3500).
    await render(<NavigationMapLayersV1 overlay={overlay()} />);

    expect(screen.getByTestId('navigation-start-marker').props.title).toBeTruthy();
    expect(screen.getByTestId('navigation-destination-marker').props.title).toBeTruthy();
    expect(screen.getByTestId('navigation-user-location-marker').props.title).toBe('Your location');
  });
});

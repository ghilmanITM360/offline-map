import React from 'react';
import { Animated } from 'react-native';
import { render, screen } from './test-utils';
import { NavigationMapLayersV2 } from '../views/components/navigation/NavigationMapLayersV2';
import type { NavigationOverlayV2 } from '../viewmodels/useNavigationOverlayV2';
import type { V2ActiveRoute } from '../models/types';

const route: V2ActiveRoute = {
  id: 'route-1',
  routeId: 'route-1',
  sourceVersion: 'v2',
  coordinates: [
    { latitude: 24.9, longitude: 67.1 },
    { latitude: 24.903, longitude: 67.103 },
  ],
  nodes: ['A', 'B'],
  totalDistance: 300,
  estimatedTimeMin: 5,
  segments: [],
  origin: { coordinate: { latitude: 24.9, longitude: 67.1 }, label: 'Current location', type: 'inside_snap' },
  destination: { coordinate: { latitude: 24.903, longitude: 67.103 }, label: 'Gate 8', type: 'gate', gateId: 'GATE_08' },
  instructions: [],
  metadata: { startedOutside: false, usesOfficialGateEntry: false, graphVersion: 'test' },
};

function overlay(overrides: Partial<NavigationOverlayV2> = {}): NavigationOverlayV2 {
  return {
    route,
    arrived: false,
    snappedLocation: { latitude: 24.901, longitude: 67.101 },
    reroutePending: false,
    mapLayers: { rastas: [], specialRoutes: [], blocks: [], gates: [] },
    userPulseAnim: new Animated.Value(0),
    currentLocationSource: 'gps',
    ...overrides,
  } as unknown as NavigationOverlayV2;
}

describe('NavigationMapLayersV2 marker ownership', () => {
  test('navigation renders one START, destination, and snapped-user identity', async () => {
    await render(<NavigationMapLayersV2 overlay={overlay()} />);

    expect(screen.getAllByTestId('navigation-start-marker')).toHaveLength(1);
    expect(screen.getAllByTestId('navigation-destination-marker')).toHaveLength(1);
    expect(screen.getAllByTestId('navigation-user-location-marker')).toHaveLength(1);
  });

  test('arrival removes START while retaining one destination and snapped-user identity', async () => {
    await render(<NavigationMapLayersV2 overlay={overlay({ arrived: true })} />);

    expect(screen.queryByTestId('navigation-start-marker')).not.toBeOnTheScreen();
    expect(screen.getAllByTestId('navigation-destination-marker')).toHaveLength(1);
    expect(screen.getAllByTestId('navigation-user-location-marker')).toHaveLength(1);
  });

  test('arrival without snapped location leaves user identity to Home fallback', async () => {
    await render(<NavigationMapLayersV2 overlay={overlay({ arrived: true, snappedLocation: null })} />);

    expect(screen.queryByTestId('navigation-start-marker')).not.toBeOnTheScreen();
    expect(screen.getAllByTestId('navigation-destination-marker')).toHaveLength(1);
    expect(screen.queryByTestId('navigation-user-location-marker')).not.toBeOnTheScreen();
  });

  test('#157: START, destination, and user markers expose an accessible name', async () => {
    await render(<NavigationMapLayersV2 overlay={overlay()} />);

    expect(screen.getByTestId('navigation-start-marker').props.accessibilityLabel).toBeTruthy();
    expect(screen.getByTestId('navigation-destination-marker').props.accessibilityLabel).toBeTruthy();
    expect(screen.getByTestId('navigation-user-location-marker').props.accessibilityLabel).toBe('Your location');
  });
});

describe('AUD-10: hybrid inside-leg walked/remaining progress', () => {
  // Outside leg = coordinates[0..2] (indices 0,1,2 — 3 points), sharing its last point (the
  // gate, index 2) with the inside leg = coordinates[2..5] (4 points): [gate, inside1, inside2,
  // destination].
  const hybridRoute: V2ActiveRoute = {
    ...route,
    coordinates: [
      { latitude: 24.90, longitude: 67.10 }, // outside
      { latitude: 24.901, longitude: 67.101 }, // outside
      { latitude: 24.902, longitude: 67.102 }, // gate (shared boundary)
      { latitude: 24.903, longitude: 67.103 }, // inside1
      { latitude: 24.904, longitude: 67.104 }, // inside2
      { latitude: 24.905, longitude: 67.105 }, // destination
    ],
    outsideLegCoordinateCount: 2,
  };

  test('shows no walked progress before the user has moved past the gate', async () => {
    await render(
      <NavigationMapLayersV2
        overlay={overlay({ route: hybridRoute, snappedLocation: { latitude: 24.902, longitude: 67.102 } })}
      />,
    );

    expect(screen.queryByTestId('navigation-walked-polyline')).not.toBeOnTheScreen();
  });

  // The historical AUD-10 bug: internal walked/remaining progress was gated on whether the
  // route *ever had* an outside leg (a static, route-level flag), not on where the user
  // actually is now — so once a hybrid route started outside, walked progress stayed frozen
  // at "none" for the rest of the trip even long after the user passed the gate and walked
  // deep into the venue.
  test('shows walked progress once the user has passed the gate and is deep into the inside leg', async () => {
    await render(
      <NavigationMapLayersV2
        overlay={overlay({ route: hybridRoute, snappedLocation: { latitude: 24.904, longitude: 67.104 } })}
      />,
    );

    expect(screen.getByTestId('navigation-walked-polyline')).toBeOnTheScreen();
  });
});

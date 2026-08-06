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
});

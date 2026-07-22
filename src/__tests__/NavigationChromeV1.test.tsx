/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render, screen, userEvent } from './test-utils';

import { NavigationChromeV1 } from '../views/components/navigation/NavigationChromeV1';
import { NAV_TOUCH_TARGET_HIT_SLOP } from '../views/components/navigation/navOverlayStyles';
import type { NavigationOverlayV1 } from '../viewmodels/useNavigationOverlayV1';
import type { Place, RoutePreview } from '../models/types';

jest.useFakeTimers();

const destination: Place = {
  id: 'GATE_08',
  name: 'Gate 8',
  category: 'Gate',
  description: 'Official Gate 8.',
  coordinate: { latitude: 24.903, longitude: 67.103 },
  sourceVersion: 'v1',
};

const route: RoutePreview = {
  id: 'route-1',
  nodes: ['A', 'B'],
  coordinates: [
    { latitude: 24.9, longitude: 67.1 },
    { latitude: 24.903, longitude: 67.103 },
  ],
  totalDistance: 300,
  estimatedTimeMin: 5,
  segments: [],
} as unknown as RoutePreview;

const instructions = [
  { id: 'i1', text: 'Head toward Gate 8', distance: 300, type: 'straight', coordinate: { latitude: 24.9, longitude: 67.1 } },
];

function baseOverlay(overrides: Partial<NavigationOverlayV1> = {}): NavigationOverlayV1 {
  return {
    route,
    destination,
    instructions,
    currentStepIndex: 0,
    isMuted: false,
    setIsMuted: jest.fn(),
    remainingDistance: 300,
    arrived: false,
    reroutePending: false,
    isWeakGps: false,
    rerouteStatusMessage: null,
    snappedLocation: { latitude: 24.9, longitude: 67.1 },
    settings: { distanceUnit: 'meters', keepNorthFixed: false, voiceInstructions: true, walkingSpeed: 1.4, autoReroute: true },
    graphOnlyFallbackUsed: false,
    handleExit: jest.fn(),
    setIsAutoFollowing: jest.fn(),
    bottomBarHeight: 0,
    setBottomBarHeight: jest.fn(),
    ...overrides,
  } as unknown as NavigationOverlayV1;
}

// Legacy (v1) equivalent of the NavigationChromeV2 touch-target/handler-wiring tests, now that
// v1 navigation renders in-place on HomeScreen's MapView instead of a standalone NavigationScreen.
describe('NavigationChromeV1 — Exit/recenter/mute touch targets', () => {
  test('Exit, mute, and recenter buttons all carry hitSlop widening their tappable area', async () => {
    await render(<NavigationChromeV1 overlay={baseOverlay()} hasGoogleMapsKey />);

    expect(screen.getByTestId('nav-exit-button').props.hitSlop).toEqual(NAV_TOUCH_TARGET_HIT_SLOP);
    expect(screen.getByTestId('nav-mute-toggle').props.hitSlop).toEqual(NAV_TOUCH_TARGET_HIT_SLOP);
    expect(screen.getByTestId('nav-recenter-button').props.hitSlop).toEqual(NAV_TOUCH_TARGET_HIT_SLOP);
  });

  test('renders active navigation state (instruction + trip info)', async () => {
    await render(<NavigationChromeV1 overlay={baseOverlay()} hasGoogleMapsKey />);

    expect(screen.getByText('Head toward Gate 8')).toBeOnTheScreen();
    expect(screen.getByText('Gate 8')).toBeOnTheScreen();
  });

  test('pressing Exit invokes the real handleExit handler (no navigation object involved)', async () => {
    const handleExit = jest.fn();
    const user = userEvent.setup();
    await render(<NavigationChromeV1 overlay={baseOverlay({ handleExit })} hasGoogleMapsKey />);

    await user.press(screen.getByTestId('nav-exit-button'));

    expect(handleExit).toHaveBeenCalledTimes(1);
    expect(handleExit).toHaveBeenCalledWith();
  });

  test('pressing the mute toggle invokes setIsMuted with the flipped value', async () => {
    const setIsMuted = jest.fn();
    const user = userEvent.setup();
    await render(<NavigationChromeV1 overlay={baseOverlay({ isMuted: false, setIsMuted })} hasGoogleMapsKey />);

    await user.press(screen.getByTestId('nav-mute-toggle'));

    expect(setIsMuted).toHaveBeenCalledWith(true);
  });

  test('pressing recenter invokes setIsAutoFollowing(true)', async () => {
    const setIsAutoFollowing = jest.fn();
    const user = userEvent.setup();
    await render(<NavigationChromeV1 overlay={baseOverlay({ setIsAutoFollowing })} hasGoogleMapsKey />);

    await user.press(screen.getByTestId('nav-recenter-button'));

    expect(setIsAutoFollowing).toHaveBeenCalledWith(true);
  });

  test('renders nothing once the route is cleared (exit must not leave stale chrome mounted)', async () => {
    await render(<NavigationChromeV1 overlay={baseOverlay({ route: null })} hasGoogleMapsKey />);

    expect(screen.queryByTestId('nav-exit-button')).not.toBeOnTheScreen();
  });
});

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render, screen, userEvent, within } from './test-utils';

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
    requestNavigationExit: jest.fn(),
    completeArrivalNavigation: jest.fn(),
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
    await render(<NavigationChromeV1 overlay={baseOverlay()} hasBaseMap />);

    expect(screen.getByTestId('nav-exit-button').props.hitSlop).toEqual(NAV_TOUCH_TARGET_HIT_SLOP);
    expect(screen.getByTestId('nav-mute-toggle').props.hitSlop).toEqual(NAV_TOUCH_TARGET_HIT_SLOP);
    expect(screen.getByTestId('nav-recenter-button').props.hitSlop).toEqual(NAV_TOUCH_TARGET_HIT_SLOP);
  });

  test('renders active navigation state (instruction + trip info)', async () => {
    await render(<NavigationChromeV1 overlay={baseOverlay()} hasBaseMap />);

    // Instruction card shows the maneuver label + road name hierarchy (Google Maps style),
    // not the raw instructions[].text — see InstructionService.maneuverLabel/ROAD_NAME_FALLBACK.
    expect(screen.getByText('Continue Straight')).toBeOnTheScreen();
    expect(screen.getByText('Continue ahead')).toBeOnTheScreen();
    expect(screen.getByText('Gate 8')).toBeOnTheScreen();
  });

  test('keeps base-map status below the maneuver in the shared top stack', async () => {
    await render(<NavigationChromeV1 overlay={baseOverlay()} hasBaseMap={false} />);

    const stack = screen.getByTestId('navigation-top-stack-v1');
    expect(within(stack).getByText('Continue Straight')).toBeOnTheScreen();
    expect(within(stack).getByText('Base map tiles are unavailable.')).toBeOnTheScreen();
  });

  test('pressing Exit requests confirmation instead of stopping directly', async () => {
    const handleExit = jest.fn();
    const requestNavigationExit = jest.fn();
    const user = userEvent.setup();
    await render(<NavigationChromeV1 overlay={baseOverlay({ handleExit, requestNavigationExit })} hasBaseMap />);

    await user.press(screen.getByTestId('nav-exit-button'));

    expect(requestNavigationExit).toHaveBeenCalledTimes(1);
    expect(handleExit).not.toHaveBeenCalled();
  });

  test('pressing the mute toggle invokes setIsMuted with the flipped value', async () => {
    const setIsMuted = jest.fn();
    const user = userEvent.setup();
    await render(<NavigationChromeV1 overlay={baseOverlay({ isMuted: false, setIsMuted })} hasBaseMap />);

    await user.press(screen.getByTestId('nav-mute-toggle'));

    expect(setIsMuted).toHaveBeenCalledWith(true);
  });

  test('pressing recenter invokes setIsAutoFollowing(true)', async () => {
    const setIsAutoFollowing = jest.fn();
    const user = userEvent.setup();
    await render(<NavigationChromeV1 overlay={baseOverlay({ setIsAutoFollowing })} hasBaseMap />);

    await user.press(screen.getByTestId('nav-recenter-button'));

    expect(setIsAutoFollowing).toHaveBeenCalledWith(true);
  });

  test('renders nothing once the route is cleared (exit must not leave stale chrome mounted)', async () => {
    await render(<NavigationChromeV1 overlay={baseOverlay({ route: null })} hasBaseMap />);

    expect(screen.queryByTestId('nav-exit-button')).not.toBeOnTheScreen();
  });

  // Phase 7 (Google Maps style navigation experience): MapMode.ARRIVAL sheet must offer both
  // a Recenter map action and a Done action, per spec.
  describe('arrival sheet', () => {
    test('shows arrival with Done as its only action', async () => {
      await render(<NavigationChromeV1 overlay={baseOverlay({ arrived: true })} hasBaseMap />);

      expect(screen.getByText("You've Arrived!")).toBeOnTheScreen();
      expect(screen.queryByTestId('nav-arrived-recenter-button')).not.toBeOnTheScreen();
      expect(screen.getByTestId('nav-arrived-done-button')).toBeOnTheScreen();
    });

    test('arrival removes stale navigation status, Exit, and floating recenter', async () => {
      await render(<NavigationChromeV1 overlay={baseOverlay({ arrived: true, reroutePending: true, isWeakGps: true })} hasBaseMap={false} />);
      expect(screen.queryByTestId('navigation-top-stack-v1')).not.toBeOnTheScreen();
      expect(screen.queryByTestId('nav-exit-button')).not.toBeOnTheScreen();
      expect(screen.queryByTestId('nav-recenter-button')).not.toBeOnTheScreen();
    });

    test('pressing Done in the arrival sheet completes immediately', async () => {
      const handleExit = jest.fn();
      const completeArrivalNavigation = jest.fn();
      const user = userEvent.setup();
      await render(<NavigationChromeV1 overlay={baseOverlay({ arrived: true, handleExit, completeArrivalNavigation })} hasBaseMap />);

      await user.press(screen.getByTestId('nav-arrived-done-button'));

      expect(completeArrivalNavigation).toHaveBeenCalledTimes(1);
      expect(handleExit).not.toHaveBeenCalled();
    });
  });
});

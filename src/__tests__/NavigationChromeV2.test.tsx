/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render, screen, userEvent } from './test-utils';

import { NavigationChromeV2 } from '../views/components/navigation/NavigationChromeV2';
import { NAV_TOUCH_TARGET_HIT_SLOP } from '../views/components/navigation/navOverlayStyles';
import type { NavigationOverlayV2 } from '../viewmodels/useNavigationOverlayV2';
import type { V2ActiveRoute } from '../models/types';

jest.useFakeTimers();

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
  instructions: [
    {
      id: 'i1',
      text: 'Head toward Gate 8',
      distance: 300,
      distanceM: 300,
      routeIndex: 0,
      type: 'straight',
      coordinate: { latitude: 24.9, longitude: 67.1 },
    },
  ],
  metadata: { startedOutside: false, usesOfficialGateEntry: false, graphVersion: 'test' },
};

function baseOverlay(overrides: Partial<NavigationOverlayV2> = {}): NavigationOverlayV2 {
  return {
    route,
    instructions: route.instructions,
    currentStepIndex: 0,
    isMuted: false,
    setIsMuted: jest.fn(),
    remainingDistance: 300,
    etaMinutes: 5,
    arrived: false,
    reroutePending: false,
    isWeakGps: false,
    rerouteStatusMessage: null,
    snappedLocation: { latitude: 24.9, longitude: 67.1 },
    settings: { distanceUnit: 'meters', keepNorthFixed: false, voiceInstructions: true, walkingSpeed: 1.4, autoReroute: true },
    graphOnlyFallbackUsed: false,
    handleExit: jest.fn(),
    setIsAutoFollowing: jest.fn(),
    ...overrides,
  } as unknown as NavigationOverlayV2;
}

// Regression test for Phase 3 (Exit/recenter touch-target re-verification): Exit (~44px) and
// Mute (~44px) buttons sit below Android's 48dp minimum touch target, and Recenter (48px) has
// zero margin above it — none had hitSlop. Without the fix, these Pressables carry no hitSlop
// prop at all and this test fails.
describe('NavigationChromeV2 — Exit/recenter/mute touch targets', () => {
  test('Exit, mute, and recenter buttons all carry hitSlop widening their tappable area', async () => {
    await render(<NavigationChromeV2 overlay={baseOverlay()} hasGoogleMapsKey />);

    expect(screen.getByTestId('nav-exit-button').props.hitSlop).toEqual(NAV_TOUCH_TARGET_HIT_SLOP);
    expect(screen.getByTestId('nav-mute-toggle').props.hitSlop).toEqual(NAV_TOUCH_TARGET_HIT_SLOP);
    expect(screen.getByTestId('nav-recenter-button').props.hitSlop).toEqual(NAV_TOUCH_TARGET_HIT_SLOP);
  });

  test('pressing Exit invokes the real handleExit handler', async () => {
    const handleExit = jest.fn();
    const user = userEvent.setup();
    await render(<NavigationChromeV2 overlay={baseOverlay({ handleExit })} hasGoogleMapsKey />);

    await user.press(screen.getByTestId('nav-exit-button'));

    expect(handleExit).toHaveBeenCalledTimes(1);
  });

  test('pressing recenter invokes setIsAutoFollowing(true)', async () => {
    const setIsAutoFollowing = jest.fn();
    const user = userEvent.setup();
    await render(<NavigationChromeV2 overlay={baseOverlay({ setIsAutoFollowing })} hasGoogleMapsKey />);

    await user.press(screen.getByTestId('nav-recenter-button'));

    expect(setIsAutoFollowing).toHaveBeenCalledWith(true);
  });
});

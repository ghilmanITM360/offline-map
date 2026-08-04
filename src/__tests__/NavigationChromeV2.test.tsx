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

describe('NavigationChromeV2 — direct outside guide', () => {
  test('shows direct-guide warning and suppresses road instruction fields', async () => {
    const directRoute: V2ActiveRoute = {
      ...route,
      outsideLegCoordinateCount: 1,
      outsideRoute: {
        schemaVersion: 1,
        candidateId: 'nav-direct-1',
        requestId: 'nav-1',
        requestVersion: 1,
        provider: 'direct-guide',
        gateId: 'GATE_05',
        distanceM: 120,
        durationSeconds: null,
        coordinates: route.coordinates,
        steps: [],
        roadFollowing: false,
        distanceKind: 'direct-distance',
        warnings: [{ code: 'direct-guide-not-road-route' }],
        fallbackReason: 'outside-coverage',
        fallbackHistory: [],
      },
      instructions: [{
        ...route.instructions[0],
        text: 'Turn right on Imaginary Road',
        roadName: 'Imaginary Road',
      }],
      metadata: {
        ...route.metadata,
        startedOutside: true,
        entryGateId: 'GATE_05',
        usesOfficialGateEntry: true,
      },
    };
    await render(<NavigationChromeV2
      overlay={baseOverlay({ route: directRoute, instructions: directRoute.instructions })}
      hasGoogleMapsKey
    />);

    expect(screen.getByText('Direct guide — not a road route')).toBeOnTheScreen();
    expect(screen.getByText('Follow the direction line toward Gate 05.')).toBeOnTheScreen();
    expect(screen.queryByText('Imaginary Road')).not.toBeOnTheScreen();
    expect(screen.queryByText('Turn right on Imaginary Road')).not.toBeOnTheScreen();
    expect(screen.queryByText('5 min')).not.toBeOnTheScreen();
    expect(screen.queryByText(/ETA/)).not.toBeOnTheScreen();
  });
});

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

// Phase 7 (Google Maps style navigation experience): MapMode.ARRIVAL sheet must offer both
// a Recenter map action and a Done action, per spec.
describe('NavigationChromeV2 — arrival sheet', () => {
  test('shows You\'ve Arrived and offers Recenter + Done actions when arrived is true', async () => {
    await render(<NavigationChromeV2 overlay={baseOverlay({ arrived: true })} hasGoogleMapsKey />);

    expect(screen.getByText("You've Arrived!")).toBeOnTheScreen();
    expect(screen.getByTestId('nav-arrived-recenter-button')).toBeOnTheScreen();
    expect(screen.getByTestId('nav-arrived-done-button')).toBeOnTheScreen();
  });

  test('pressing Recenter in the arrival sheet invokes setIsAutoFollowing(true)', async () => {
    const setIsAutoFollowing = jest.fn();
    const user = userEvent.setup();
    await render(<NavigationChromeV2 overlay={baseOverlay({ arrived: true, setIsAutoFollowing })} hasGoogleMapsKey />);

    await user.press(screen.getByTestId('nav-arrived-recenter-button'));

    expect(setIsAutoFollowing).toHaveBeenCalledWith(true);
  });

  test('pressing Done in the arrival sheet invokes handleExit', async () => {
    const handleExit = jest.fn();
    const user = userEvent.setup();
    await render(<NavigationChromeV2 overlay={baseOverlay({ arrived: true, handleExit })} hasGoogleMapsKey />);

    await user.press(screen.getByTestId('nav-arrived-done-button'));

    expect(handleExit).toHaveBeenCalledTimes(1);
  });
});

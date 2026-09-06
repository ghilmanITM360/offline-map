/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render, screen, userEvent, within } from './test-utils';

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
    requestNavigationExit: jest.fn(),
    completeArrivalNavigation: jest.fn(),
    setIsAutoFollowing: jest.fn(),
    ...overrides,
  } as unknown as NavigationOverlayV2;
}

describe('NavigationChromeV2 — direct outside guide', () => {
  test('owns maneuver and subordinate status surfaces in one ordered top stack', async () => {
    const outsideRoute: V2ActiveRoute = {
      ...route,
      outsideLegCoordinateCount: 1,
      outsideRoute: {
        schemaVersion: 1,
        candidateId: 'nav-stack',
        requestId: 'nav-stack',
        requestVersion: 1,
        provider: 'offline-osm',
        gateId: 'GATE_05',
        distanceM: 120,
        durationSeconds: null,
        coordinates: route.coordinates,
        steps: [],
        roadFollowing: true,
        distanceKind: 'walking-route',
        warnings: [],
        fallbackHistory: [{ provider: 'google', code: 'proxy-unconfigured', retryable: true }],
      },
      metadata: { ...route.metadata, startedOutside: true, entryGateId: 'GATE_05', usesOfficialGateEntry: true },
    };

    await render(<NavigationChromeV2
      overlay={baseOverlay({ route: outsideRoute, instructions: outsideRoute.instructions })}
      hasBaseMap={false}
    />);

    const stack = screen.getByTestId('navigation-top-stack');
    const stackContent = within(stack);
    expect(stackContent.getByTestId('navigation-maneuver-surface')).toBeOnTheScreen();
    expect(stackContent.getByTestId('navigation-subordinate-surfaces')).toBeOnTheScreen();
    expect(stackContent.getByText('Offline walking route')).toBeOnTheScreen();
    expect(stackContent.getByText('Base map unavailable. Offline route guidance continues.')).toBeOnTheScreen();
  });

  test('shows only the highest-priority status when GPS lost and basemap loss both apply', async () => {
    await render(
      <NavigationChromeV2
        overlay={baseOverlay({ gpsSignalState: 'GPS_LOST', reroutePending: true, rerouteStatusMessage: 'Recalculating your route' })}
        hasBaseMap={false}
      />,
    );

    const stack = screen.getByTestId('navigation-top-stack');
    const stackContent = within(stack);
    expect(stackContent.getByText('Searching for GPS signal. Your position may be out of date.')).toBeOnTheScreen();
    expect(stackContent.queryByText('Recalculating your route')).not.toBeOnTheScreen();
    expect(stackContent.queryByText('Base map unavailable. Offline route guidance continues.')).not.toBeOnTheScreen();
  });

  test('active rerouting suppresses basemap degradation when GPS is healthy', async () => {
    await render(
      <NavigationChromeV2
        overlay={baseOverlay({ gpsSignalState: 'GPS_GOOD', reroutePending: true })}
        hasBaseMap={false}
      />,
    );

    const stack = within(screen.getByTestId('navigation-top-stack'));
    expect(stack.getByText('Recalculating your route…')).toBeOnTheScreen();
    expect(stack.queryByText('Base map unavailable. Offline route guidance continues.')).not.toBeOnTheScreen();
  });

  test('shows accurate road provider identity while outside leg is active', async () => {
    const offlineRoute: V2ActiveRoute = {
      ...route,
      outsideLegCoordinateCount: 1,
      outsideRoute: {
        schemaVersion: 1,
        candidateId: 'nav-offline-1',
        requestId: 'nav-offline',
        requestVersion: 1,
        provider: 'offline-osm',
        gateId: 'GATE_05',
        distanceM: 120,
        durationSeconds: null,
        coordinates: route.coordinates,
        steps: [],
        roadFollowing: true,
        distanceKind: 'walking-route',
        warnings: [],
        fallbackReason: 'proxy-unconfigured',
        fallbackHistory: [{ provider: 'google', code: 'proxy-unconfigured', retryable: true }],
      },
      metadata: { ...route.metadata, startedOutside: true, entryGateId: 'GATE_05', usesOfficialGateEntry: true },
    };

    await render(<NavigationChromeV2
      overlay={baseOverlay({ route: offlineRoute, instructions: offlineRoute.instructions })}
      hasBaseMap
    />);

    expect(screen.getByText('Offline walking route')).toBeOnTheScreen();
    expect(screen.getByText('Google walking route unavailable. Using offline walking roads.')).toBeOnTheScreen();
  });

  test('shows direct-guide warning, suppresses road fields, and uses confirmed Exit', async () => {
    const requestNavigationExit = jest.fn();
    const user = userEvent.setup();
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
      overlay={baseOverlay({ route: directRoute, instructions: directRoute.instructions, requestNavigationExit })}
      hasBaseMap
    />);

    expect(screen.getByText('Direct guide — not a road route')).toBeOnTheScreen();
    expect(screen.getByText('Direct guidance only. This path may not follow roads.')).toBeOnTheScreen();
    expect(screen.getByText('Follow the direction line toward Gate 05.')).toBeOnTheScreen();
    expect(screen.queryByText('Imaginary Road')).not.toBeOnTheScreen();
    expect(screen.queryByText('Turn right on Imaginary Road')).not.toBeOnTheScreen();
    expect(screen.queryByText('5 min')).not.toBeOnTheScreen();
    expect(screen.queryByText(/ETA/)).not.toBeOnTheScreen();
    await user.press(screen.getByTestId('nav-exit-button'));
    expect(requestNavigationExit).toHaveBeenCalledTimes(1);
  });

  test('connects retry and official-gate actions during active direct guidance', async () => {
    const retryOutsideRoute = jest.fn(async () => undefined);
    const selectOutsideGate = jest.fn(async () => undefined);
    const user = userEvent.setup();
    const directRoute: V2ActiveRoute = {
      ...route,
      outsideLegCoordinateCount: 1,
      outsideRoute: {
        schemaVersion: 1,
        candidateId: 'nav-direct-actions',
        requestId: 'nav-actions',
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
      metadata: { ...route.metadata, startedOutside: true, entryGateId: 'GATE_05', usesOfficialGateEntry: true },
    };
    await render(<NavigationChromeV2
      overlay={baseOverlay({
        route: directRoute,
        instructions: directRoute.instructions,
        retryOutsideRoute,
        selectOutsideGate,
        manualGateId: null,
        availableOutsideGates: [{ id: 'GATE_12', label: 'Gate 12' }],
      })}
      hasBaseMap
    />);

    await user.press(screen.getByRole('button', { name: 'Retry road route' }));
    await user.press(screen.getByRole('button', { name: 'Choose another gate' }));
    await user.press(screen.getByRole('button', { name: 'Use Gate 12' }));

    expect(retryOutsideRoute).toHaveBeenCalledTimes(1);
    expect(selectOutsideGate).toHaveBeenCalledWith('GATE_12');
  });
});

// Regression test for Phase 3 (Exit/recenter touch-target re-verification): Exit (~44px) and
// Mute (~44px) buttons sit below Android's 48dp minimum touch target, and Recenter (48px) has
// zero margin above it — none had hitSlop. Without the fix, these Pressables carry no hitSlop
// prop at all and this test fails.
describe('NavigationChromeV2 — Exit/recenter/mute touch targets', () => {
  test('Exit, mute, and recenter buttons all carry hitSlop widening their tappable area', async () => {
    await render(<NavigationChromeV2 overlay={baseOverlay()} hasBaseMap />);

    expect(screen.getByTestId('nav-exit-button').props.hitSlop).toEqual(NAV_TOUCH_TARGET_HIT_SLOP);
    expect(screen.getByTestId('nav-mute-toggle').props.hitSlop).toEqual(NAV_TOUCH_TARGET_HIT_SLOP);
    expect(screen.getByTestId('nav-recenter-button').props.hitSlop).toEqual(NAV_TOUCH_TARGET_HIT_SLOP);
  });

  test('pressing Exit requests confirmation instead of stopping directly', async () => {
    const handleExit = jest.fn();
    const requestNavigationExit = jest.fn();
    const user = userEvent.setup();
    await render(<NavigationChromeV2 overlay={baseOverlay({ handleExit, requestNavigationExit })} hasBaseMap />);

    await user.press(screen.getByTestId('nav-exit-button'));

    expect(requestNavigationExit).toHaveBeenCalledTimes(1);
    expect(handleExit).not.toHaveBeenCalled();
  });

  test('pressing recenter invokes setIsAutoFollowing(true)', async () => {
    const setIsAutoFollowing = jest.fn();
    const user = userEvent.setup();
    await render(<NavigationChromeV2 overlay={baseOverlay({ setIsAutoFollowing })} hasBaseMap />);

    await user.press(screen.getByTestId('nav-recenter-button'));

    expect(setIsAutoFollowing).toHaveBeenCalledWith(true);
  });
});

// Phase 7 (Google Maps style navigation experience): MapMode.ARRIVAL sheet must offer both
// a Recenter map action and a Done action, per spec.
describe('NavigationChromeV2 — arrival sheet', () => {
  test('shows arrival with Done as its only action', async () => {
    await render(<NavigationChromeV2 overlay={baseOverlay({ arrived: true })} hasBaseMap />);

    expect(screen.getByText("You've Arrived!")).toBeOnTheScreen();
    expect(screen.queryByTestId('nav-arrived-recenter-button')).not.toBeOnTheScreen();
    expect(screen.getByTestId('nav-arrived-done-button')).toBeOnTheScreen();
  });

  test('arrival removes stale navigation status, Exit, and floating recenter', async () => {
    await render(<NavigationChromeV2 overlay={baseOverlay({ arrived: true, reroutePending: true, isWeakGps: true })} hasBaseMap={false} />);
    expect(screen.queryByTestId('navigation-top-stack')).not.toBeOnTheScreen();
    expect(screen.queryByTestId('nav-exit-button')).not.toBeOnTheScreen();
    expect(screen.queryByTestId('nav-recenter-button')).not.toBeOnTheScreen();
  });

  test('pressing Done in the arrival sheet completes immediately', async () => {
    const handleExit = jest.fn();
    const completeArrivalNavigation = jest.fn();
    const user = userEvent.setup();
    await render(<NavigationChromeV2 overlay={baseOverlay({ arrived: true, handleExit, completeArrivalNavigation })} hasBaseMap />);

    await user.press(screen.getByTestId('nav-arrived-done-button'));

    expect(completeArrivalNavigation).toHaveBeenCalledTimes(1);
    expect(handleExit).not.toHaveBeenCalled();
  });
});

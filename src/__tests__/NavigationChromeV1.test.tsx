/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { AccessibilityInfo } from 'react-native';
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

  test('B-001: next-step preview shows short maneuver + road name, not the full raw sentence', async () => {
    const twoStepInstructions = [
      { id: 'i1', text: 'Head toward Gate 8', distance: 300, type: 'straight', coordinate: { latitude: 24.9, longitude: 67.1 } },
      {
        id: 'i2',
        text: 'Turn left at Rasta 11 & Rasta 04 Junction onto Rasta 09 & Rasta 01 Junction.',
        distance: 40,
        type: 'left',
        roadName: 'Rasta 05',
        coordinate: { latitude: 24.903, longitude: 67.103 },
      },
    ];
    await render(<NavigationChromeV1 overlay={baseOverlay({ instructions: twoStepInstructions })} hasBaseMap />);

    expect(screen.getByText('Then: Left Turn onto Rasta 05')).toBeOnTheScreen();
    expect(screen.queryByText(/Turn left at Rasta 11/)).toBeNull();
  });

  describe('next-step preview for an arrival maneuver names the destination', () => {
    const arrivalStep = { id: 'i2', text: 'Arrive at Gate 8', distance: 0, type: 'arrival', coordinate: { latitude: 24.903, longitude: 67.103 } };
    const withArrival = [instructions[0], arrivalStep];

    test('arrival shows "Arrive at <destination.name>", not a bare "Arrive"', async () => {
      await render(<NavigationChromeV1 overlay={baseOverlay({ instructions: withArrival })} hasBaseMap />);
      expect(screen.getByText('Then: Arrive at Gate 8')).toBeOnTheScreen();
      expect(screen.queryByText('Then: Arrive')).toBeNull();
    });

    test('long destination name renders in full text (single line, tail-ellipsized by layout)', async () => {
      const longName = 'Main Ijtema Ground Northern Parking Area Overflow Section Gate 12';
      await render(
        <NavigationChromeV1 overlay={baseOverlay({ instructions: withArrival, destination: { ...destination, name: longName } })} hasBaseMap />,
      );
      const text = screen.getByText(`Then: Arrive at ${longName}`);
      expect(text.props.numberOfLines).toBe(1);
    });

    test.each([null, { ...destination, name: '   ' }])('missing destination name (%p) falls back without undefined/empty text', async (dest) => {
      await render(<NavigationChromeV1 overlay={baseOverlay({ instructions: withArrival, destination: dest as Place | null })} hasBaseMap />);
      expect(screen.getByText('Then: Arrive at destination')).toBeOnTheScreen();
      expect(screen.queryByText(/undefined|at\s*$/)).toBeNull();
    });

    test('current arrival step shows the destination on the road-name line instead of "Continue ahead"', async () => {
      await render(<NavigationChromeV1 overlay={baseOverlay({ instructions: [arrivalStep] })} hasBaseMap />);
      expect(screen.getByText('Arrive')).toBeOnTheScreen();
      expect(screen.queryByText('Continue ahead')).toBeNull();
    });
  });

  test('keeps base-map status below the maneuver in the shared top stack', async () => {
    await render(<NavigationChromeV1 overlay={baseOverlay()} hasBaseMap={false} />);

    const stack = screen.getByTestId('navigation-top-stack-v1');
    expect(within(stack).getByText('Continue Straight')).toBeOnTheScreen();
    expect(within(stack).getByText("The map can't be shown. Directions still work.")).toBeOnTheScreen();
  });

  test('#66: shows only the highest-priority status when weak GPS, reroute, and basemap loss all apply', async () => {
    await render(
      <NavigationChromeV1
        overlay={baseOverlay({ isWeakGps: true, rerouteStatusMessage: 'Recalculating your route' })}
        hasBaseMap={false}
      />,
    );

    const stack = screen.getByTestId('navigation-top-stack-v1');
    const stackContent = within(stack);
    expect(stackContent.getByText('Weak signal. Directions may be slow.')).toBeOnTheScreen();
    expect(stackContent.queryByText('Recalculating your route')).not.toBeOnTheScreen();
    expect(stackContent.queryByText("The map can't be shown. Directions still work.")).not.toBeOnTheScreen();
  });

  test('#66: reroute status outranks basemap loss', async () => {
    await render(
      <NavigationChromeV1
        overlay={baseOverlay({ rerouteStatusMessage: 'Recalculating your route' })}
        hasBaseMap={false}
      />,
    );

    const stack = screen.getByTestId('navigation-top-stack-v1');
    const stackContent = within(stack);
    expect(stackContent.getByText('Recalculating your route')).toBeOnTheScreen();
    expect(stackContent.queryByText("The map can't be shown. Directions still work.")).not.toBeOnTheScreen();
  });

  test('#156: weak-GPS banner is a polite live region', async () => {
    await render(<NavigationChromeV1 overlay={baseOverlay({ isWeakGps: true })} hasBaseMap={false} />);
    expect(screen.getByText('Weak signal. Directions may be slow.').parent?.props.accessibilityLiveRegion).toBe('polite');
  });

  test('#156: reroute-hint banner is a polite live region', async () => {
    await render(<NavigationChromeV1 overlay={baseOverlay({ rerouteStatusMessage: 'Recalculating your route' })} hasBaseMap={false} />);
    expect(screen.getByText('Recalculating your route').parent?.props.accessibilityLiveRegion).toBe('polite');
  });

  test('#156: map-unavailable banner is a polite live region', async () => {
    await render(<NavigationChromeV1 overlay={baseOverlay()} hasBaseMap={false} />);
    expect(screen.getByText("The map can't be shown. Directions still work.").parent?.props.accessibilityLiveRegion).toBe('polite');
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
    test('shows You\'ve Arrived and offers Recenter + Done actions when arrived is true', async () => {
      await render(<NavigationChromeV1 overlay={baseOverlay({ arrived: true })} hasBaseMap />);

      expect(screen.getByText("You've Arrived!")).toBeOnTheScreen();
      expect(screen.getByTestId('nav-arrived-recenter-button')).toBeOnTheScreen();
      expect(screen.getByTestId('nav-arrived-done-button')).toBeOnTheScreen();
    });

    test('pressing Recenter in the arrival sheet invokes setIsAutoFollowing(true)', async () => {
      const setIsAutoFollowing = jest.fn();
      const user = userEvent.setup();
      await render(<NavigationChromeV1 overlay={baseOverlay({ arrived: true, setIsAutoFollowing })} hasBaseMap />);

      await user.press(screen.getByTestId('nav-arrived-recenter-button'));

      expect(setIsAutoFollowing).toHaveBeenCalledWith(true);
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

    test('#64: Android back press on the arrival modal completes navigation like Done, instead of trapping the user behind stale nav chrome', async () => {
      const completeArrivalNavigation = jest.fn();
      await render(<NavigationChromeV1 overlay={baseOverlay({ arrived: true, completeArrivalNavigation })} hasBaseMap />);

      screen.getByTestId('nav-arrival-modal').props.onRequestClose();

      expect(completeArrivalNavigation).toHaveBeenCalledTimes(1);
    });

    test('#64: announces arrival once for screen-reader users, naming the destination', async () => {
      const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
      announce.mockClear();

      await render(<NavigationChromeV1 overlay={baseOverlay({ arrived: true })} hasBaseMap />);

      expect(announce).toHaveBeenCalledTimes(1);
      expect(announce).toHaveBeenCalledWith(expect.stringContaining('Gate 8'));
    });
  });
});

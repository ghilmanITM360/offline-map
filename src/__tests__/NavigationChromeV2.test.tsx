/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { AccessibilityInfo, Animated, Dimensions, StyleSheet } from 'react-native';
import { act, render, screen, userEvent, within } from './test-utils';

import { NavigationChromeV2 } from '../views/components/navigation/NavigationChromeV2';
import { NAV_TOUCH_TARGET_HIT_SLOP } from '../views/components/navigation/navOverlayStyles';
import { NAV_TRANSITION_TIMINGS } from '../constants/navigationTransitions';
import type { NavigationOverlayV2 } from '../viewmodels/useNavigationOverlayV2';
import type { V2ActiveRoute } from '../models/types';
import { useLocaleStore } from '../i18n/localeStore';

jest.useFakeTimers();

// #100: chrome's own mount-fade is the DECORATIVE entrance transition under audit — mock
// the hook boundary directly rather than AccessibilityInfo's async isReduceMotionEnabled,
// matching how other hook-boundary tests in this file mock their dependencies.
jest.mock('../viewmodels/useReducedMotion', () => ({ useReducedMotion: jest.fn(() => false) }));
const mockedUseReducedMotion = jest.requireMock('../viewmodels/useReducedMotion').useReducedMotion as jest.Mock;

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
    maneuverDistance: 300,
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

describe('NavigationChromeV2 — live maneuver distance', () => {
  test('#61: instruction card shows overlay.maneuverDistance, not the frozen route-instruction distanceM', async () => {
    // route.instructions[0].distanceM is 300 (see fixture above); a live-countdown value that
    // has decreased partway into the step must render as the countdown, not the static original.
    await render(<NavigationChromeV2 overlay={baseOverlay({ maneuverDistance: 140 })} hasBaseMap />);
    expect(screen.getByText('140 m')).toBeTruthy();
    expect(screen.queryByText('300 m')).toBeNull();
  });
});

describe('NavigationChromeV2 — instruction card accessibility label', () => {
  test('announces the live maneuver distance, not the edge length baked into step.text', async () => {
    const stale = { ...route.instructions[0], text: 'Continue straight for 10 meters.' };
    await render(
      <NavigationChromeV2 overlay={baseOverlay({ instructions: [stale], route: { ...route, instructions: [stale] }, maneuverDistance: 69 })} hasBaseMap />,
    );
    expect(screen.getByLabelText(/69 m/)).toBeOnTheScreen();
    expect(screen.queryByLabelText(/10 meters/)).toBeNull();
  });
});

describe('NavigationChromeV2 — next-step preview', () => {
  test('B-001: shows short maneuver + road name, not the full raw sentence', async () => {
    const twoStepRoute: V2ActiveRoute = {
      ...route,
      instructions: [
        route.instructions[0],
        {
          id: 'i2',
          text: 'Turn left at Rasta 11 & Rasta 04 Junction onto Rasta 09 & Rasta 01 Junction.',
          distance: 40,
          distanceM: 40,
          routeIndex: 1,
          type: 'left',
          roadName: 'Rasta 05',
          coordinate: { latitude: 24.903, longitude: 67.103 },
        },
      ],
    };
    await render(<NavigationChromeV2 overlay={baseOverlay({ route: twoStepRoute, instructions: twoStepRoute.instructions })} hasBaseMap />);

    expect(screen.getByText('Then: Left Turn onto Rasta 05')).toBeOnTheScreen();
    expect(screen.queryByText(/Turn left at Rasta 11/)).toBeNull();
  });
});

describe('NavigationChromeV2 — next-step preview for an arrival maneuver', () => {
  const arrivalStep = {
    id: 'i2', text: 'Arrive at Gate 8', distance: 0, distanceM: 0, routeIndex: 1, type: 'arrival' as const,
    coordinate: { latitude: 24.903, longitude: 67.103 },
  };
  const routeWith = (label: string): V2ActiveRoute => ({
    ...route,
    destination: { ...route.destination, label },
    instructions: [route.instructions[0], arrivalStep],
  });
  const overlayFor = (r: V2ActiveRoute) => baseOverlay({ route: r, instructions: r.instructions });

  test('arrival shows "Arrive at <route.destination.label>", not a bare "Arrive"', async () => {
    await render(<NavigationChromeV2 overlay={overlayFor(routeWith('Gate 8'))} hasBaseMap />);
    expect(screen.getByText('Then: Arrive at Gate 8')).toBeOnTheScreen();
    expect(screen.queryByText('Then: Arrive')).toBeNull();
  });

  test('long destination label renders in full text (single line, tail-ellipsized by layout)', async () => {
    const longName = 'Main Ijtema Ground Northern Parking Area Overflow Section Gate 12';
    await render(<NavigationChromeV2 overlay={overlayFor(routeWith(longName))} hasBaseMap />);
    expect(screen.getByText(`Then: Arrive at ${longName}`).props.numberOfLines).toBe(1);
  });

  test('blank destination label falls back without undefined/empty text', async () => {
    await render(<NavigationChromeV2 overlay={overlayFor(routeWith('  '))} hasBaseMap />);
    expect(screen.getByText('Then: Arrive at destination')).toBeOnTheScreen();
    expect(screen.queryByText(/undefined|at\s*$/)).toBeNull();
  });

  test('ordinary next maneuver without a road name stays concise', async () => {
    const r: V2ActiveRoute = { ...route, instructions: [route.instructions[0], { ...arrivalStep, type: 'right' as const }] };
    await render(<NavigationChromeV2 overlay={overlayFor(r)} hasBaseMap />);
    expect(screen.getByText('Then: Right Turn')).toBeOnTheScreen();
  });

  test('current arrival step shows the destination on the road-name line instead of "Continue ahead"', async () => {
    const r: V2ActiveRoute = { ...route, instructions: [arrivalStep] };
    await render(<NavigationChromeV2 overlay={overlayFor(r)} hasBaseMap />);
    expect(screen.getAllByText('Gate 8').length).toBeGreaterThan(0);
    expect(screen.queryByText('Continue ahead')).toBeNull();
  });
});

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
    expect(stackContent.getByText('Walking route')).toBeOnTheScreen();
    expect(stackContent.getByText("The map can't be shown. Directions still work.")).toBeOnTheScreen();
  });

  test('#66: shows only the highest-priority status when GPS lost, reroute, and basemap loss all apply', async () => {
    await render(
      <NavigationChromeV2
        overlay={baseOverlay({ gpsSignalState: 'GPS_LOST', isWeakGps: true, rerouteStatusMessage: 'Recalculating your route' })}
        hasBaseMap={false}
      />,
    );

    const stack = screen.getByTestId('navigation-top-stack');
    const stackContent = within(stack);
    expect(stackContent.getByText("We can't find you. Move to an open area.")).toBeOnTheScreen();
    expect(stackContent.queryByText('Weak signal. Directions may be slow.')).not.toBeOnTheScreen();
    expect(stackContent.queryByText('Recalculating your route')).not.toBeOnTheScreen();
    expect(stackContent.queryByText("The map can't be shown. Directions still work.")).not.toBeOnTheScreen();
  });

  // 200% font on a 320 dp window: the GPS banner wrapped to three lines and ran under the map control column
  // ("...may be out of dat" was covered by the "More" button).
  test.each([[1, 0], [2, 72]])('at font scale %s the status banners leave %s dp free for the map control column', async (fontScale, margin) => {
    Dimensions.set({ window: { width: 320, height: 711, scale: 2, fontScale } });
    await render(<NavigationChromeV2 overlay={baseOverlay({ gpsSignalState: 'GPS_LOST' })} hasBaseMap />);
    const stack = StyleSheet.flatten(screen.getByTestId('navigation-subordinate-surfaces').props.style);
    expect(stack.marginEnd ?? 0).toBe(margin);
    Dimensions.set({ window: { width: 390, height: 844, scale: 2, fontScale: 1 } });
  });

  test('#66: weak GPS outranks reroute status and basemap loss when GPS is not fully lost', async () => {
    await render(
      <NavigationChromeV2
        overlay={baseOverlay({ isWeakGps: true, rerouteStatusMessage: 'Recalculating your route' })}
        hasBaseMap={false}
      />,
    );

    const stack = screen.getByTestId('navigation-top-stack');
    const stackContent = within(stack);
    expect(stackContent.getByText('Weak signal. Directions may be slow.')).toBeOnTheScreen();
    expect(stackContent.queryByText('Recalculating your route')).not.toBeOnTheScreen();
    expect(stackContent.queryByText("The map can't be shown. Directions still work.")).not.toBeOnTheScreen();
  });

  test('#66: reroute status outranks basemap loss', async () => {
    await render(
      <NavigationChromeV2
        overlay={baseOverlay({ rerouteStatusMessage: 'Recalculating your route' })}
        hasBaseMap={false}
      />,
    );

    const stack = screen.getByTestId('navigation-top-stack');
    const stackContent = within(stack);
    expect(stackContent.getByText('Recalculating your route')).toBeOnTheScreen();
    expect(stackContent.queryByText("The map can't be shown. Directions still work.")).not.toBeOnTheScreen();
  });

  test('#156: GPS_LOST banner is an assertive live region so screen-reader users hear it unprompted', async () => {
    await render(<NavigationChromeV2 overlay={baseOverlay({ gpsSignalState: 'GPS_LOST' })} hasBaseMap={false} />);

    const banner = screen.getByText("We can't find you. Move to an open area.").parent;
    expect(banner?.props.accessibilityLiveRegion).toBe('assertive');
  });

  test('#156: weak-GPS banner is a polite live region', async () => {
    await render(<NavigationChromeV2 overlay={baseOverlay({ isWeakGps: true })} hasBaseMap={false} />);
    expect(screen.getByText('Weak signal. Directions may be slow.').parent?.props.accessibilityLiveRegion).toBe('polite');
  });

  test('#156: reroute-hint banner is a polite live region', async () => {
    await render(<NavigationChromeV2 overlay={baseOverlay({ rerouteStatusMessage: 'Recalculating your route' })} hasBaseMap={false} />);
    expect(screen.getByText('Recalculating your route').parent?.props.accessibilityLiveRegion).toBe('polite');
  });

  test('#156: map-unavailable banner is a polite live region', async () => {
    await render(<NavigationChromeV2 overlay={baseOverlay()} hasBaseMap={false} />);
    expect(screen.getByText("The map can't be shown. Directions still work.").parent?.props.accessibilityLiveRegion).toBe('polite');
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

    expect(screen.getByText('Walking route')).toBeOnTheScreen();
    expect(screen.getByText('Using a simpler route. It may be less exact.')).toBeOnTheScreen();
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

    expect(screen.getByText('Straight-line guide, not a road route')).toBeOnTheScreen();
    expect(screen.getByText('Walk toward Gate 05.')).toBeOnTheScreen();
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

    await user.press(screen.getByRole('button', { name: 'Try again' }));
    await user.press(screen.getByRole('button', { name: 'Choose another gate' }));
    await user.press(screen.getByRole('button', { name: 'Use Gate 12' }));

    expect(retryOutsideRoute).toHaveBeenCalledTimes(1);
    expect(selectOutsideGate).toHaveBeenCalledWith('GATE_12');
  });
});

describe('NavigationChromeV2 — straight-line guide stays a straight-line guide while the outside leg is walked', () => {
  // Found in the final emulator run: live progress moves the current step past the approach step on the first
  // fix (its boundary is the route start), so a step-index check dropped the warning and showed a walking ETA.
  const outsideInstructions = [
    { ...route.instructions[0], id: 'o1', text: 'Walk toward Gate 8.', routeIndex: 0, distanceM: 900 },
    { ...route.instructions[0], id: 'o2', text: 'Enter through Gate 8.', routeIndex: 1, distanceM: 0 },
    { ...route.instructions[0], id: 'o3', text: 'Continue for 100 meters.', routeIndex: 2, distanceM: 100 },
  ];
  const directRoute = {
    ...route,
    totalDistanceM: 1000, // 900 straight line to the gate + 100 inside
    startConnectorDistanceM: 900,
    outsideLegCoordinateCount: 1,
    outsideRoute: {
      schemaVersion: 1, candidateId: 'c', requestId: 'r', requestVersion: 1, provider: 'direct-guide', gateId: 'GATE_08',
      distanceM: 900, durationSeconds: null, coordinates: route.coordinates, steps: [], roadFollowing: false,
      distanceKind: 'direct-distance', warnings: [{ code: 'direct-guide-not-road-route' }], fallbackReason: 'outside-coverage', fallbackHistory: [],
    },
    instructions: outsideInstructions,
    metadata: { ...route.metadata, startedOutside: true, entryGateId: 'GATE_08', usesOfficialGateEntry: true },
  } as unknown as V2ActiveRoute;

  test('far from the gate, with the current step already past the approach step: warning, no walking ETA', async () => {
    await render(<NavigationChromeV2
      overlay={baseOverlay({ route: directRoute, instructions: outsideInstructions, currentStepIndex: 1, remainingDistance: 950, etaMinutes: 11 })}
      hasBaseMap
    />);
    expect(screen.getByText('Straight-line guide, not a road route')).toBeOnTheScreen();
    expect(screen.queryByText('11 min')).not.toBeOnTheScreen();
    expect(screen.queryByText(/Arrive/)).not.toBeOnTheScreen();
  });

  test('once the user is at the gate the guide ends and the normal inside card returns', async () => {
    await render(<NavigationChromeV2
      overlay={baseOverlay({ route: directRoute, instructions: outsideInstructions, currentStepIndex: 2, remainingDistance: 95, etaMinutes: 2 })}
      hasBaseMap
    />);
    expect(screen.queryByText('Straight-line guide, not a road route')).not.toBeOnTheScreen();
    expect(screen.getByText('2 min')).toBeOnTheScreen();
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
    expect(StyleSheet.flatten(screen.getByTestId('nav-recenter-button').props.style)).toMatchObject({ direction: 'ltr', right: 16 });
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
  test('shows You\'ve Arrived and offers Recenter + Done actions when arrived is true', async () => {
    await render(<NavigationChromeV2 overlay={baseOverlay({ arrived: true })} hasBaseMap />);

    expect(screen.getByText("You've Arrived!")).toBeOnTheScreen();
    expect(screen.getByTestId('nav-arrived-recenter-button')).toBeOnTheScreen();
    expect(screen.getByTestId('nav-arrived-done-button')).toBeOnTheScreen();
  });

  test('#301: the arrival card keeps its buttons above the system navigation bar', async () => {
    await render(<NavigationChromeV2 overlay={baseOverlay({ arrived: true })} hasBaseMap />);

    const card = StyleSheet.flatten(screen.getByTestId('nav-arrived-card').props.style);
    // test-utils provides a 34 dp bottom inset; the Modal window is full-screen, so the card pads past it.
    expect(card.paddingBottom).toBeGreaterThanOrEqual(34 + 16);
  });

  test('pressing Recenter in the arrival sheet invokes setIsAutoFollowing(true)', async () => {
    const setIsAutoFollowing = jest.fn();
    const user = userEvent.setup();
    await render(<NavigationChromeV2 overlay={baseOverlay({ arrived: true, setIsAutoFollowing })} hasBaseMap />);

    await user.press(screen.getByTestId('nav-arrived-recenter-button'));

    expect(setIsAutoFollowing).toHaveBeenCalledWith(true);
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

  test('#64: Android back press on the arrival modal completes navigation like Done, instead of trapping the user behind stale nav chrome', async () => {
    const completeArrivalNavigation = jest.fn();
    await render(<NavigationChromeV2 overlay={baseOverlay({ arrived: true, completeArrivalNavigation })} hasBaseMap />);

    screen.getByTestId('nav-arrival-modal').props.onRequestClose();

    expect(completeArrivalNavigation).toHaveBeenCalledTimes(1);
  });

  test('#64: announces arrival once for screen-reader users, naming the destination', async () => {
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
    announce.mockClear();

    await render(<NavigationChromeV2 overlay={baseOverlay({ arrived: true })} hasBaseMap />);

    expect(announce).toHaveBeenCalledTimes(1);
    expect(announce).toHaveBeenCalledWith(expect.stringContaining('Gate 8'));
  });
});

describe('NavigationChromeV2 — reduced motion (#100)', () => {
  afterEach(() => {
    mockedUseReducedMotion.mockReturnValue(false);
    // Animated.timing is jest.spyOn'd fresh per test below — restore it so call counts
    // and any accumulated fake-timer callbacks don't leak into the next test.
    jest.restoreAllMocks();
  });

  test('RM-01: with Reduce Motion disabled, the chrome mount fade still animates via Animated.timing', async () => {
    mockedUseReducedMotion.mockReturnValue(false);
    const timingSpy = jest.spyOn(Animated, 'timing');
    await render(<NavigationChromeV2 overlay={baseOverlay()} hasBaseMap />);

    await act(async () => { jest.advanceTimersByTime(NAV_TRANSITION_TIMINGS.chromeRevealDelayMs); });

    expect(timingSpy).toHaveBeenCalled();
  });

  test('RM-03: with Reduce Motion enabled, the chrome mount fade is skipped (renders end-state immediately)', async () => {
    mockedUseReducedMotion.mockReturnValue(true);
    const timingSpy = jest.spyOn(Animated, 'timing');
    await render(<NavigationChromeV2 overlay={baseOverlay()} hasBaseMap />);

    await act(async () => { jest.advanceTimersByTime(NAV_TRANSITION_TIMINGS.chromeRevealDelayMs); });

    expect(timingSpy).not.toHaveBeenCalled();
  });

  test('RM-04/RM-07: arrival state still renders correctly and understandably with Reduce Motion enabled', async () => {
    mockedUseReducedMotion.mockReturnValue(true);
    await render(<NavigationChromeV2 overlay={baseOverlay({ arrived: true })} hasBaseMap />);

    await act(async () => { jest.advanceTimersByTime(NAV_TRANSITION_TIMINGS.chromeRevealDelayMs); });

    expect(screen.getByText("You've Arrived!")).toBeOnTheScreen();
  });

  test('RM-08: a critical status (recalculating) still renders correctly with Reduce Motion enabled', async () => {
    mockedUseReducedMotion.mockReturnValue(true);
    await render(<NavigationChromeV2 overlay={baseOverlay({ reroutePending: true })} hasBaseMap />);

    await act(async () => { jest.advanceTimersByTime(NAV_TRANSITION_TIMINGS.chromeRevealDelayMs); });

    expect(screen.getByText('Finding a new way…')).toBeOnTheScreen();
  });
});


describe('NavigationChromeV2 — complete directions access', () => {
  test.each([
    { gpsSignalState: 'GPS_LOST', snappedLocation: null },
    { reroutePending: true },
    { instructions: [] },
  ] as Partial<NavigationOverlayV2>[])('Directions remains reachable during degraded active state %j', async (state) => {
    const overlay = baseOverlay(state);
    await render(<NavigationChromeV2 overlay={overlay} hasBaseMap />);
    const user = userEvent.setup();
    expect(screen.getByRole('button', { name: 'Directions' })).toBeVisible();
    await user.press(screen.getByRole('button', { name: 'Directions' }));
    expect(screen.getByRole('button', { name: 'Close directions' })).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Close directions' }));
    expect(screen.getByRole('button', { name: 'Directions' })).toBeOnTheScreen();
    expect(overlay.requestNavigationExit).not.toHaveBeenCalled();
    expect(overlay.setIsAutoFollowing).not.toHaveBeenCalled();
  });

  test('expanded directions follow current reroute instructions and highlight the actual active step', async () => {
    const overlay = baseOverlay();
    const view = await render(<NavigationChromeV2 overlay={overlay} hasBaseMap />);
    await userEvent.setup().press(screen.getByRole('button', { name: 'Directions' }));
    expect(screen.getByText('Head toward Gate 8')).toBeOnTheScreen();
    const step = { ...route.instructions[0], id: 'replacement', text: 'Walk along Rasta 2' };
    await view.rerender(<NavigationChromeV2 overlay={baseOverlay({ instructions: [step] })} hasBaseMap />);
    expect(screen.getByText('Walk along Rasta 2')).toBeOnTheScreen();
    expect(screen.queryByText('Head toward Gate 8')).not.toBeOnTheScreen();
  });
});


test('active Directions control updates language while closed and preserves instruction geography in Urdu', async () => {
  const overlay = baseOverlay();
  await render(<NavigationChromeV2 overlay={overlay} hasBaseMap />);
  try {
    await act(async () => useLocaleStore.setState({ locale: 'ur-Latn' }));
    expect(screen.getByRole('button', { name: 'Raste ki hidayaat' })).toBeVisible();
    await act(async () => useLocaleStore.setState({ locale: 'ur' }));
    await userEvent.setup().press(screen.getByRole('button', { name: 'راستے کی ہدایات' }));
    expect(screen.getByRole('button', { name: 'ہدایات بند کریں' })).toBeVisible();
    expect(screen.getByText('Head toward Gate 8')).toBeOnTheScreen();
    expect(overlay.setIsAutoFollowing).not.toHaveBeenCalled();
  } finally {
    await act(async () => useLocaleStore.setState({ locale: 'en' }));
  }
});

test('locale changes translate navigation controls without changing the active step', async () => {
  useLocaleStore.getState().setLocale('en');
  await render(<NavigationChromeV2 overlay={baseOverlay()} hasBaseMap />);
  await act(async () => { useLocaleStore.getState().setLocale('ur-Latn'); });
  expect(screen.getByRole('button', {name: 'Rehnumai band karein'})).toBeOnTheScreen();
  expect(screen.getByText('Seedha chalein')).toBeOnTheScreen();
  await act(async () => { useLocaleStore.getState().setLocale('en'); });
});

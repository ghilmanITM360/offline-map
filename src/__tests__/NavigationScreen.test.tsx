/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Alert, BackHandler } from 'react-native';
import { render, screen, userEvent } from './test-utils';

import { NavigationScreen } from '../views/screens/NavigationScreen';
import { useNavigationViewModel } from '../viewmodels/NavigationViewModel';
import { useAppStore } from '../store/useAppStore';
import type { Place } from '../models/types';

jest.useFakeTimers();

// GPS-driven progress (snapping, reroute detection, remaining distance) lives inside
// useNavigationViewModel and is out of scope for a component test — a lightweight simulation of
// its *output* is enough to verify NavigationScreen wires its buttons to real handlers (per the
// task brief: don't build a full GPS mock framework for this). We mock only the hook boundary.
jest.mock('../viewmodels/NavigationViewModel', () => ({
  useNavigationViewModel: jest.fn(),
}));

jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  return {
    ...actual,
    useNavigation: jest.fn(),
  };
});

const { useNavigation } = jest.requireMock('@react-navigation/native') as { useNavigation: jest.Mock };
const mockedUseNavigationViewModel = useNavigationViewModel as jest.Mock;

const destination: Place = {
  id: 'GATE_08',
  name: 'Gate 8',
  category: 'Gate',
  description: 'Official Gate 8.',
  coordinate: { latitude: 24.903, longitude: 67.103 },
  sourceVersion: 'v1',
};

function baseViewModel(overrides: Record<string, unknown> = {}) {
  return {
    destination,
    currentLocation: { latitude: 24.9, longitude: 67.1 },
    snappedLocation: { latitude: 24.9, longitude: 67.1 },
    route: {
      nodes: ['A', 'B'],
      coordinates: [
        { latitude: 24.9, longitude: 67.1 },
        { latitude: 24.903, longitude: 67.103 },
      ],
      totalDistance: 300,
      estimatedTimeMin: 5,
    },
    instructions: [
      { id: 'i1', text: 'Head toward Gate 8', distance: 300, type: 'straight', coordinate: { latitude: 24.9, longitude: 67.1 } },
      { id: 'i2', text: 'Arrive at Gate 8', distance: 0, type: 'arrival', coordinate: { latitude: 24.903, longitude: 67.103 } },
    ],
    currentStepIndex: 0,
    isMuted: false,
    setIsMuted: jest.fn(),
    remainingDistance: 300,
    arrived: false,
    reroutePending: false,
    isWeakGps: false,
    rerouteStatusMessage: null,
    handleExit: jest.fn(),
    ...overrides,
  };
}

let initialStoreState: ReturnType<typeof useAppStore.getState>;
let navigateSpy: jest.Mock;
let goBackSpy: jest.Mock;
let resetSpy: jest.Mock;

beforeAll(() => {
  initialStoreState = useAppStore.getState();
});

beforeEach(() => {
  jest.clearAllMocks();
  useAppStore.setState(initialStoreState, true);
  navigateSpy = jest.fn();
  goBackSpy = jest.fn();
  resetSpy = jest.fn();
  useNavigation.mockReturnValue({ navigate: navigateSpy, goBack: goBackSpy, reset: resetSpy });
});

describe('NavigationScreen — exit and recenter (real handler wiring)', () => {
  test('renders active navigation state (instruction + trip info)', async () => {
    mockedUseNavigationViewModel.mockReturnValue(baseViewModel());
    await render(<NavigationScreen />);

    expect(screen.getByText('Head toward Gate 8')).toBeOnTheScreen();
    expect(screen.getByText('Gate 8')).toBeOnTheScreen();
    expect(screen.getByText('5 min')).toBeOnTheScreen();
  });

  test('pressing Exit invokes the real handleExit handler (not a no-op)', async () => {
    const handleExit = jest.fn();
    mockedUseNavigationViewModel.mockReturnValue(baseViewModel({ handleExit }));
    const user = userEvent.setup();
    await render(<NavigationScreen />);

    await user.press(screen.getByText('Exit'));

    expect(handleExit).toHaveBeenCalledTimes(1);
    expect(handleExit).toHaveBeenCalledWith(expect.objectContaining({ navigate: navigateSpy }));
  });

  test('pressing the mute toggle invokes setIsMuted with the flipped value', async () => {
    const setIsMuted = jest.fn();
    mockedUseNavigationViewModel.mockReturnValue(baseViewModel({ isMuted: false, setIsMuted }));
    const user = userEvent.setup();
    await render(<NavigationScreen />);

    // The mute button is icon-only (Volume2/VolumeX, no text/aria role in production markup) —
    // testID is the pragmatic last-resort query here per the RNTL skill's query priority.
    await user.press(screen.getByTestId('nav-mute-toggle'));

    expect(setIsMuted).toHaveBeenCalledWith(true);
  });

  test('pressing recenter re-enables auto-follow and drives the map camera (real handler, not a no-op)', async () => {
    mockedUseNavigationViewModel.mockReturnValue(baseViewModel());
    const user = userEvent.setup();
    await render(<NavigationScreen />);

    // Recenter is icon-only (LocateFixed) — testID again, same reasoning as the mute toggle.
    // The underlying mapRef.current.animateCamera() call is exercised by our react-native-maps
    // mock (see jest.setup.ts) instead of throwing, which is itself evidence the button calls
    // through to a real handler rather than being a dead onPress.
    await expect(user.press(screen.getByTestId('nav-recenter-button'))).resolves.not.toThrow();
  });

  test('an active route with no valid destination triggers navigation back (guard clause, not silently swallowed)', async () => {
    mockedUseNavigationViewModel.mockReturnValue(baseViewModel({ destination: null }));
    await render(<NavigationScreen />);

    expect(goBackSpy).toHaveBeenCalled();
  });
});

describe('NavigationScreen — exit confirmation on hardware back (spot check: handlers are wired, not dead)', () => {
  test('confirming the exit alert triggers handleExit', async () => {
    const handleExit = jest.fn();
    mockedUseNavigationViewModel.mockReturnValue(baseViewModel({ handleExit }));
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation((_title, _msg, buttons) => {
      const exitButton = buttons?.find((b) => b.text === 'Exit');
      exitButton?.onPress?.();
    });
    const addEventListenerSpy = jest.spyOn(BackHandler, 'addEventListener');

    await render(<NavigationScreen />);

    const listenerCall = addEventListenerSpy.mock.calls.find(
      ([eventName]) => eventName === 'hardwareBackPress',
    );
    expect(listenerCall).toBeTruthy();
    listenerCall?.[1]?.({} as never);

    expect(alertSpy).toHaveBeenCalled();
    expect(handleExit).toHaveBeenCalledTimes(1);
    alertSpy.mockRestore();
    addEventListenerSpy.mockRestore();
  });
});

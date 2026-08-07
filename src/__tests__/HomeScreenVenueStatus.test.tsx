/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { act, fireEvent, render, screen, waitFor } from './test-utils';
import { HomeScreen } from '../views/screens/HomeScreen';
import { useAppStore } from '../store/useAppStore';
import { LocationAccessService } from '../services/LocationAccessService';
import type { LocationResolveResult } from '../services/LocationAccessService';

jest.mock('../services/LocationAccessService', () => ({
  LocationAccessService: {
    resolveCurrentLocation: jest.fn(),
    openAppSettings: jest.fn(),
  },
}));

jest.mock('../viewmodels/DirectionsViewModel', () => ({
  useDirectionsViewModel: jest.fn(() => ({
    isVisible: false,
    origin: null,
    destination: null,
    handleClose: jest.fn(),
  })),
}));

jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  return {
    ...actual,
    useNavigation: jest.fn(),
  };
});

const { useNavigation } = jest.requireMock('@react-navigation/native') as { useNavigation: jest.Mock };
const resolveCurrentLocation = LocationAccessService.resolveCurrentLocation as jest.MockedFunction<typeof LocationAccessService.resolveCurrentLocation>;
const initialStoreState = useAppStore.getState();
const originalV2MapFlag = process.env.EXPO_PUBLIC_USE_IJTEMA_V2_MAP;

const outsideVenueLiveCoordinate = { latitude: 24.9022, longitude: 67.1024, accuracy: 6 };
const insideVenueLiveCoordinate = { latitude: 24.965, longitude: 67.005, accuracy: 6 };
const permissionState: LocationResolveResult['permissionState'] = {
  granted: true,
  canAskAgain: true,
  status: 'granted' as any,
  servicesEnabled: true,
};

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  useAppStore.setState(initialStoreState, true);
  process.env.EXPO_PUBLIC_USE_IJTEMA_V2_MAP = 'true';
  useNavigation.mockReturnValue({ navigate: jest.fn(), dispatch: jest.fn(), goBack: jest.fn() });
  resolveCurrentLocation.mockResolvedValue({
    ok: true,
    coordinate: outsideVenueLiveCoordinate,
    source: 'live',
    permissionState,
    message: null,
  });
});

afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
  if (originalV2MapFlag === undefined) {
    delete process.env.EXPO_PUBLIC_USE_IJTEMA_V2_MAP;
  } else {
    process.env.EXPO_PUBLIC_USE_IJTEMA_V2_MAP = originalV2MapFlag;
  }
});

describe('HomeScreen returning live location venue banner', () => {
  test('suppresses the outside-venue banner immediately after accepted startup live inside commit without a watcher tick', async () => {
    resolveCurrentLocation.mockResolvedValueOnce({
      ok: true,
      coordinate: insideVenueLiveCoordinate,
      source: 'live',
      permissionState,
      message: null,
    });
    useAppStore.setState({
      hasSeenMapOverview: true,
      hasLocationPermission: true,
      currentLocation: null,
      currentLocationSource: null,
    });

    await render(<HomeScreen />);
    await act(async () => {
      fireEvent(screen.getByTestId('home-map-view'), 'mapReady');
      await Promise.resolve();
      await Promise.resolve();
      await jest.advanceTimersByTimeAsync(200);
    });

    await waitFor(() => {
      expect(resolveCurrentLocation).toHaveBeenCalledWith(false);
      expect(useAppStore.getState().currentLocation).toEqual(insideVenueLiveCoordinate);
      expect(useAppStore.getState().currentLocationSource).toBe('live');
      expect(screen.queryByText(/Outside Ijtema · Enter through/)).toBeNull();
    });
  });

  test('renders the outside-venue banner immediately after accepted startup live commit without a watcher tick', async () => {
    useAppStore.setState({
      hasSeenMapOverview: true,
      hasLocationPermission: true,
      currentLocation: null,
      currentLocationSource: null,
    });

    await render(<HomeScreen />);
    await act(async () => {
      fireEvent(screen.getByTestId('home-map-view'), 'mapReady');
      await Promise.resolve();
      await Promise.resolve();
      await jest.advanceTimersByTimeAsync(200);
    });

    await waitFor(() => {
      expect(resolveCurrentLocation).toHaveBeenCalledWith(false);
      expect(useAppStore.getState().currentLocation).toEqual(outsideVenueLiveCoordinate);
      expect(useAppStore.getState().currentLocationSource).toBe('live');
      expect(screen.getByText(/Outside Ijtema · Enter through/)).toBeTruthy();
    });
  });
});

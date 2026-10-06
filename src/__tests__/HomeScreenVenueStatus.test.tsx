/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { act, fireEvent, render, screen, waitFor } from './test-utils';
import { HomeScreen } from '../views/screens/HomeScreen';
import { useAppStore } from '../store/useAppStore';
import { LocationAccessService } from '../services/LocationAccessService';
import { RoutingServiceV2 } from '../services/RoutingServiceV2';
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
    useIsFocused: jest.fn(() => true),
  };
});

const { useNavigation } = jest.requireMock('@react-navigation/native') as { useNavigation: jest.Mock };
const resolveCurrentLocation = LocationAccessService.resolveCurrentLocation as jest.MockedFunction<typeof LocationAccessService.resolveCurrentLocation>;
const initialStoreState = useAppStore.getState();
const originalV2MapFlag = process.env.EXPO_PUBLIC_USE_IJTEMA_V2_MAP;

const outsideVenueLiveCoordinate = { latitude: 24.9022, longitude: 67.1024, accuracy: 6 };
const insideVenueLiveCoordinate = { latitude: 24.965, longitude: 67.005, accuracy: 6 };
const shortSuggestedGateName = 'Gate 14';
const longSuggestedGateName = 'Gate 14 East pedestrian entrance beside the main medical camp and accessible shuttle stop';
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
  jest.restoreAllMocks();
  jest.clearAllTimers();
  jest.useRealTimers();
  if (originalV2MapFlag === undefined) {
    delete process.env.EXPO_PUBLIC_USE_IJTEMA_V2_MAP;
  } else {
    process.env.EXPO_PUBLIC_USE_IJTEMA_V2_MAP = originalV2MapFlag;
  }
});

describe('HomeScreen returning live location venue banner', () => {
  async function renderOutsideBanner() {
    useAppStore.setState({
      hasSeenMapOverview: true,
      hasLocationPermission: true,
      currentLocation: null,
      currentLocationSource: null,
    });

    await render(<HomeScreen />);
    await act(async () => {
      fireEvent(screen.getByTestId('home-map-view'), 'didFinishLoadingMap');
      await Promise.resolve();
      await Promise.resolve();
      await jest.advanceTimersByTimeAsync(200);
    });
  }

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
      fireEvent(screen.getByTestId('home-map-view'), 'didFinishLoadingMap');
      await Promise.resolve();
      await Promise.resolve();
      await jest.advanceTimersByTimeAsync(200);
    });

    await waitFor(() => {
      expect(resolveCurrentLocation).toHaveBeenCalledWith(false);
      expect(useAppStore.getState().currentLocation).toEqual(insideVenueLiveCoordinate);
      expect(useAppStore.getState().currentLocationSource).toBe('live');
      expect(screen.queryByText('Suggested entry')).toBeNull();
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
      fireEvent(screen.getByTestId('home-map-view'), 'didFinishLoadingMap');
      await Promise.resolve();
      await Promise.resolve();
      await jest.advanceTimersByTimeAsync(200);
    });

    await waitFor(() => {
      expect(resolveCurrentLocation).toHaveBeenCalledWith(false);
      expect(useAppStore.getState().currentLocation).toEqual(outsideVenueLiveCoordinate);
      expect(useAppStore.getState().currentLocationSource).toBe('live');
      expect(screen.getByText('Suggested entry')).toBeTruthy();
    });
  });

  test('renders short suggested gate in a dedicated accessible text surface', async () => {
    jest.spyOn(RoutingServiceV2, 'recommendOutsideEntryGate').mockReturnValue({
      name: { en: shortSuggestedGateName },
    } as ReturnType<typeof RoutingServiceV2.recommendOutsideEntryGate>);

    await renderOutsideBanner();

    await waitFor(() => {
      const gateText = screen.getByText(shortSuggestedGateName);
      expect(screen.getByText('Outside Ijtema')).toBeTruthy();
      expect(screen.getByText('Suggested entry')).toBeTruthy();
      expect(gateText.props.numberOfLines).toBeUndefined();
      expect(gateText.props.ellipsizeMode).toBeUndefined();
      expect(screen.getByLabelText(`Outside Ijtema. Suggested entry through ${shortSuggestedGateName}. Final entry gate is confirmed when route preview is calculated.`)).toBeTruthy();
    });
  });

  test('keeps a long suggested gate identity complete without tail truncation', async () => {
    jest.spyOn(RoutingServiceV2, 'recommendOutsideEntryGate').mockReturnValue({
      name: { en: longSuggestedGateName },
    } as ReturnType<typeof RoutingServiceV2.recommendOutsideEntryGate>);

    await renderOutsideBanner();

    await waitFor(() => {
      const gateText = screen.getByText(longSuggestedGateName);
      expect(gateText.props.numberOfLines).toBeUndefined();
      expect(gateText.props.ellipsizeMode).toBeUndefined();
      expect(screen.getByLabelText(`Outside Ijtema. Suggested entry through ${longSuggestedGateName}. Final entry gate is confirmed when route preview is calculated.`)).toBeTruthy();
    });
  });

  test('keeps no-gate fallback complete and dismisses its accessible banner', async () => {
    jest.spyOn(RoutingServiceV2, 'recommendOutsideEntryGate').mockReturnValue(undefined);

    await renderOutsideBanner();

    const unavailableText = 'No gate suggested yet';
    await waitFor(() => {
      expect(screen.getByText(unavailableText)).toBeTruthy();
      expect(screen.getByLabelText('Outside Ijtema. Suggested entry unavailable. Final entry gate is confirmed when route preview is calculated.')).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Dismiss outside Ijtema entry suggestion' })).toBeTruthy();
    });

    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Dismiss outside Ijtema entry suggestion' }));
    });

    await waitFor(() => {
      expect(screen.queryByText(unavailableText)).toBeNull();
    });
  });
});

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { StyleSheet } from 'react-native';
import { act, fireEvent, render, screen, waitFor } from './test-utils';
import { HomeScreen } from '../views/screens/HomeScreen';
import { useAppStore } from '../store/useAppStore';
import { LocationAccessService } from '../services/LocationAccessService';
import { RoutingServiceV2 } from '../services/RoutingServiceV2';
import { translate, useLocaleStore } from '../i18n';
import { V2PlaceAdapter } from '../services/V2PlaceAdapter';
import type { LocationResolveResult } from '../services/LocationAccessService';

// Venue names go through the one localizer; a marker proves every map label and gate name passes through it.
jest.mock('../i18n/venueNames', () => ({ localizeVenueName: (name: string) => `«${name}»` }));
jest.mock('../services/LocationAccessService', () => ({
  LocationAccessService: { resolveCurrentLocation: jest.fn(), openAppSettings: jest.fn() },
}));
jest.mock('../viewmodels/DirectionsViewModel', () => ({
  useDirectionsViewModel: jest.fn(() => ({ isVisible: false, origin: null, destination: null, handleClose: jest.fn() })),
}));
jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  return { ...actual, useNavigation: jest.fn(), useIsFocused: jest.fn(() => true) };
});

const { useNavigation } = jest.requireMock('@react-navigation/native') as { useNavigation: jest.Mock };
const resolveCurrentLocation = LocationAccessService.resolveCurrentLocation as jest.MockedFunction<typeof LocationAccessService.resolveCurrentLocation>;
const initialStoreState = useAppStore.getState();
const originalV2MapFlag = process.env.EXPO_PUBLIC_USE_IJTEMA_V2_MAP;
const permissionState: LocationResolveResult['permissionState'] = { granted: true, canAskAgain: true, status: 'granted' as never, servicesEnabled: true };

beforeEach(() => {
  jest.useFakeTimers({ doNotFake: ['requestAnimationFrame'] });
  jest.clearAllMocks();
  useAppStore.setState(initialStoreState, true);
  process.env.EXPO_PUBLIC_USE_IJTEMA_V2_MAP = 'true';
  useNavigation.mockReturnValue({ navigate: jest.fn(), dispatch: jest.fn(), goBack: jest.fn() });
  resolveCurrentLocation.mockResolvedValue({
    ok: true,
    coordinate: { latitude: 24.9022, longitude: 67.1024, accuracy: 6 },
    source: 'live',
    permissionState,
    message: null,
  });
  jest.spyOn(RoutingServiceV2, 'recommendOutsideEntryGate').mockReturnValue({
    name: { en: 'Gate 14' },
  } as ReturnType<typeof RoutingServiceV2.recommendOutsideEntryGate>);
});

afterEach(() => {
  useLocaleStore.setState({ locale: 'en' });
  jest.restoreAllMocks();
  jest.clearAllTimers();
  jest.useRealTimers();
  if (originalV2MapFlag === undefined) delete process.env.EXPO_PUBLIC_USE_IJTEMA_V2_MAP;
  else process.env.EXPO_PUBLIC_USE_IJTEMA_V2_MAP = originalV2MapFlag;
});

async function renderHomeOutsideVenue() {
  useAppStore.setState({ hasSeenMapOverview: true, hasLocationPermission: true, currentLocation: null, currentLocationSource: null });
  await render(<HomeScreen />);
  await act(async () => {
    fireEvent(screen.getByTestId('home-map-view'), 'didFinishLoadingMap');
    await Promise.resolve();
    await Promise.resolve();
    await jest.advanceTimersByTimeAsync(200);
  });
}

describe.each(['ur', 'ur-Latn'] as const)('Home screen in %s', (locale) => {
  beforeEach(() => useLocaleStore.setState({ locale }));

  test('top bar, outside-Ijtema banner and its screen-reader copy are localized, with the gate name through the venue localizer', async () => {
    await renderHomeOutsideVenue();

    await waitFor(() => {
      expect(screen.getByText(translate(locale, 'map.outsideBannerTitle'))).toBeTruthy();
    });
    expect(screen.getByText(translate(locale, 'map.suggestedEntry'))).toBeTruthy();
    expect(screen.getByText('«Gate 14»')).toBeTruthy();
    expect(screen.getByLabelText(translate(locale, 'map.outsideBannerA11yWithGate', { gate: '«Gate 14»' }))).toBeTruthy();
    expect(screen.getByRole('button', { name: translate(locale, 'map.dismissOutsideBanner') })).toBeTruthy();
    expect(screen.getByRole('button', { name: translate(locale, 'map.places') })).toBeTruthy();

    for (const english of ['Outside Ijtema', 'Suggested entry', 'Places', 'Open menu']) {
      expect(screen.queryByText(english)).toBeNull();
    }
    expect(screen.queryByRole('button', { name: 'Dismiss outside Ijtema entry suggestion' })).toBeNull();
  });

  test('the label drawn on the map for a selected block goes through the venue-name localizer', async () => {
    const block = V2PlaceAdapter.getPlaceById('B1')!;
    await renderHomeOutsideVenue();
    await act(async () => {
      useAppStore.getState().setSelectedPlace(block);
      await jest.advanceTimersByTimeAsync(200);
    });
    expect(await screen.findByLabelText(`«${block.name}»`)).toBeTruthy();
    // Nothing prints the raw venue name when the localizer is in place.
    expect(screen.queryByLabelText(block.name)).toBeNull();
  });
});

describe('Home screen layout direction', () => {
  test('the floating control stack and banners sit on the end edge, so they swap sides in Urdu while the map never mirrors', async () => {
    useLocaleStore.setState({ locale: 'ur' });
    await renderHomeOutsideVenue();
    const stack = StyleSheet.flatten(screen.getByTestId('map-control-stack').props.style);
    expect(stack.end).toBe(12);
    expect(stack.right).toBeUndefined();
    expect(stack.left).toBeUndefined();
  });
});

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Real ViewModel integration: both manual and live routes preview before explicit activation.

import React from 'react';
import { act, render, screen, waitFor, userEvent } from './test-utils';

import { LocationSheet } from '../views/components/map/LocationSheet';
import { DirectionsSheetFooter } from '../views/components/map/DirectionsSheetFooter';
import { V2PlaceAdapter } from '../services/V2PlaceAdapter';
import { LocationAccessService } from '../services/LocationAccessService';
import { V2DirectionsService } from '../services/V2DirectionsService';
import { useAppStore } from '../store/useAppStore';

jest.mock('@gorhom/bottom-sheet', () => {
  const ReactActual = jest.requireActual('react');
  const { View } = jest.requireActual('react-native');
  return {
    __esModule: true,
    BottomSheetScrollView: (props: { children?: React.ReactNode }) => ReactActual.createElement(View, null, props.children),
    BottomSheetFooter: (props: { children?: React.ReactNode }) => ReactActual.createElement(View, null, props.children),
  };
});

const initialStoreState = useAppStore.getState();
const destination = V2PlaceAdapter.getPlaceById('B1')!;
const start = V2PlaceAdapter.getPlaceById('B9')!;

beforeEach(() => {
  process.env.EXPO_PUBLIC_USE_IJTEMA_V2_ROUTING = 'true';
  useAppStore.setState(initialStoreState, true);
  useAppStore.setState({ currentLocation: null, currentLocationSource: null, hasLocationPermission: false });
});

describe('journey auto-start with the real view-model (#307)', () => {
  test('manual start previews before explicit guide activation', async () => {
    useAppStore.setState({ directoryChoice: { purpose: 'start', place: start } });
    await render(
      <>
        <LocationSheet mode="routePreview" destination={destination} onClose={jest.fn()} onStartNavigation={jest.fn()}
          onOpenDirectory={jest.fn()} onViewRoute={jest.fn()} onChangeDestination={jest.fn()} />
        <DirectionsSheetFooter animatedFooterPosition={{ value: 0, get: () => 0 } as never} />
      </>,
    );

    await screen.findByText('Route ready');
    expect(useAppStore.getState().routeGuide).toBeNull();
    await userEvent.setup().press(await screen.findByText('Start route'));
    await waitFor(() => expect(useAppStore.getState().routeGuide).not.toBeNull());
    expect(screen.queryByText('Choose where to start')).not.toBeOnTheScreen();
    expect(useAppStore.getState().isNavigating).toBe(false);
  });

  test('fresh GPS shows preview and waits for explicit live Start', async () => {
    const onStartNavigation = jest.fn();
    useAppStore.setState({
      hasLocationPermission: true,
      locationPermissionPrecision: 'fine', locationServicesState: 'enabled',
      currentLocation: { latitude: 24.9693333, longitude: 67.0016944, accuracy: 5, observedAtMs: Date.now() },
      currentLocationSource: 'live',
    });
    await render(
      <>
        <LocationSheet mode="routePreview" destination={destination} onClose={jest.fn()} onStartNavigation={onStartNavigation}
          onOpenDirectory={jest.fn()} onViewRoute={jest.fn()} onChangeDestination={jest.fn()} />
        <DirectionsSheetFooter animatedFooterPosition={{ value: 0, get: () => 0 } as never} />
      </>,
    );

    await screen.findByText('Ready to go');
    expect(onStartNavigation).not.toHaveBeenCalled();
    await userEvent.setup().press(await screen.findByText('Start Navigation'));
    await waitFor(() => expect(onStartNavigation).toHaveBeenCalledTimes(1));
  });
});


test.each(['start', 'destination'] as const)('opening rendered %s chooser retires pending automatic navigation', async purpose => {
  useAppStore.setState({ hasLocationPermission: true, locationPermissionPrecision: 'fine', locationServicesState: 'enabled',
    currentLocation: { latitude: 24.9762, longitude: 67.011, accuracy: 8, observedAtMs: Date.now() }, currentLocationSource: 'live' });
  useAppStore.getState().setPendingJourney({ destination });
  const original = V2DirectionsService.calculateHybridPreview.bind(V2DirectionsService);
  let release!: (result: Awaited<ReturnType<typeof original>>) => void;
  let request!: Parameters<typeof original>[0];
  const calculate = jest.spyOn(V2DirectionsService, 'calculateHybridPreview').mockImplementation(input => {
    request = input;
    return new Promise(resolve => { release = resolve; });
  });
  try {
    await render(<LocationSheet mode="routePreview" destination={destination} onClose={jest.fn()} onStartNavigation={jest.fn()}
      onOpenDirectory={value => useAppStore.getState().setDirectoryPurpose(value)} onViewRoute={jest.fn()} onChangeDestination={jest.fn()} />);
    await waitFor(() => expect(calculate).toHaveBeenCalled());
    const result = await original(request);
    expect(result.status).toBe('ready');
    expect(result.route?.outsideRoute?.provider).not.toBe('direct-guide');
    await userEvent.setup().press(screen.getByLabelText(purpose === 'start' ? /Change start/ : /Change destination/));
    expect(useAppStore.getState().directoryPurpose).toBe(purpose);
    expect(useAppStore.getState().destinationJourneyIntent?.autoLive).toBe('consumed');
    await act(async () => release(result));
    expect(useAppStore.getState().isNavigating).toBe(false);
  } finally { calculate.mockRestore(); }
});

it.each(['cancel', 'start'] as const)('rendered manual upgrade confirms, previews and explicitly handles %s', async action => {
  const acquire = jest.spyOn(LocationAccessService, 'resolveCurrentLocation').mockResolvedValue({
    ok: true, source: 'live', coordinate: { ...V2PlaceAdapter.getPlaceById('B27')!.coordinate, accuracy: 5, observedAtMs: Date.now() },
    permissionState: { granted: true, canAskAgain: true, status: 'granted' as never, precision: 'fine', servicesEnabled: true, servicesState: 'enabled' }, message: null,
  });
  try {
    useAppStore.setState({ directoryChoice: { purpose: 'start', place: start } });
    await render(<><LocationSheet mode="routePreview" destination={destination} onClose={jest.fn()} />
      <DirectionsSheetFooter animatedFooterPosition={{ value: 0, get: () => 0 } as never} /></>);
    const user = userEvent.setup();
    await user.press(await screen.findByText('Start route'));
    await act(() => useAppStore.getState().setRouteGuideStep(1));
    const original = { route: useAppStore.getState().activeRoute, guide: useAppStore.getState().routeGuide };
    await user.press(screen.getByRole('button', { name: 'Use my location to guide me' }));
    expect(await screen.findByText('Switch to live navigation?')).toBeOnTheScreen();
    expect(acquire).not.toHaveBeenCalled();
    await user.press(screen.getByRole('button', { name: 'Continue with location' }));
    expect(await screen.findByText('Live route preview')).toBeOnTheScreen();
    expect(useAppStore.getState().activeRoute).toBe(original.route);
    expect(useAppStore.getState().routeGuide).toBe(original.guide);
    expect(useAppStore.getState().isNavigating).toBe(false);
    await user.press(screen.getByRole('button', { name: action === 'cancel' ? 'Keep route guide' : 'Start live navigation' }));
    expect(useAppStore.getState().isNavigating).toBe(action === 'start');
    if (action === 'cancel') {
      expect(useAppStore.getState().activeRoute).toBe(original.route);
      expect(useAppStore.getState().routeGuide).toBe(original.guide);
      expect(useAppStore.getState().routeGuide?.stepIndex).toBe(1);
    } else expect(useAppStore.getState().routeGuide).toBeNull();
  } finally { acquire.mockRestore(); }
});

it('rendered acquisition can cancel while original step remains usable', async () => {
  let release!: (value: Awaited<ReturnType<typeof LocationAccessService.resolveCurrentLocation>>) => void;
  const acquire = jest.spyOn(LocationAccessService, 'resolveCurrentLocation').mockImplementation(() => new Promise(resolve => { release = resolve; }));
  try {
    useAppStore.setState({ directoryChoice: { purpose: 'start', place: start } });
    await render(<><LocationSheet mode="routePreview" destination={destination} onClose={jest.fn()} />
      <DirectionsSheetFooter animatedFooterPosition={{ value: 0, get: () => 0 } as never} /></>);
    const user = userEvent.setup();
    await user.press(await screen.findByText('Start route'));
    const route = useAppStore.getState().activeRoute;
    const guide = useAppStore.getState().routeGuide;
    await user.press(screen.getByRole('button', { name: 'Use my location to guide me' }));
    await user.press(screen.getByRole('button', { name: 'Continue with location' }));
    expect((await screen.findAllByText('Finding your location…')).length).toBeGreaterThan(0);
    await user.press(screen.getByRole('button', { name: 'Keep route guide' }));
    await act(() => release({ ok: false, source: null, coordinate: null, permissionState: { granted: false, canAskAgain: false, status: 'denied' as never, precision: 'none', servicesState: 'disabled', servicesEnabled: false }, message: 'Denied' }));
    expect(useAppStore.getState().activeRoute).toBe(route);
    expect(useAppStore.getState().routeGuide).toBe(guide);
    expect(screen.queryByText('Live route preview')).not.toBeOnTheScreen();
  } finally { acquire.mockRestore(); }
});

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// #307: the journey auto-start with the REAL DirectionsViewModel (the unit suite mocks it). A destination tapped in the
// Directory with a chosen start must show that start as FROM, compute the route and open the route guide.

import React from 'react';
import { render, screen, waitFor } from './test-utils';

import { LocationSheet } from '../views/components/map/LocationSheet';
import { DirectionsSheetFooter } from '../views/components/map/DirectionsSheetFooter';
import { V2PlaceAdapter } from '../services/V2PlaceAdapter';
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
  test('guide: the chosen start becomes FROM, the route is found and the route guide opens', async () => {
    await render(
      <>
        <LocationSheet mode="routePreview" destination={destination} onClose={jest.fn()} onStartNavigation={jest.fn()}
          onOpenDirectory={jest.fn()} onViewRoute={jest.fn()} onChangeDestination={jest.fn()} journey={{ mode: 'guide', start }} />
        <DirectionsSheetFooter animatedFooterPosition={{ value: 0, get: () => 0 } as never} />
      </>,
    );

    await waitFor(() => expect(useAppStore.getState().routeGuide).not.toBeNull(), { timeout: 10_000 });
    expect(screen.queryByText('Choose where to start')).not.toBeOnTheScreen();
    expect(useAppStore.getState().isNavigating).toBe(false);
  });

  test('live: with permission and a fresh fix the journey starts navigation by itself', async () => {
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
          onOpenDirectory={jest.fn()} onViewRoute={jest.fn()} onChangeDestination={jest.fn()} journey={{ mode: 'live', start: null }} />
        <DirectionsSheetFooter animatedFooterPosition={{ value: 0, get: () => 0 } as never} />
      </>,
    );

    await waitFor(() => expect(onStartNavigation).toHaveBeenCalledTimes(1), { timeout: 10_000 });
  });
});

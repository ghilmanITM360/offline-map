/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Dimensions } from 'react-native';
import { render, screen, userEvent } from './test-utils';

import { LocationSheet } from '../views/components/map/LocationSheet';
import { DirectionsSheetFooter } from '../views/components/map/DirectionsSheetFooter';
import { useDirectionsViewModel } from '../viewmodels/DirectionsViewModel';
import { useAppStore } from '../store/useAppStore';
import type { Place } from '../models/types';

// #222 — route-ready shows FROM and TO together, above the fold, with one primary action.
jest.mock('@gorhom/bottom-sheet', () => {
  const ReactActual = jest.requireActual('react');
  const { View } = jest.requireActual('react-native');
  return {
    __esModule: true,
    BottomSheetScrollView: (props: { children?: React.ReactNode }) =>
      ReactActual.createElement(View, { testID: 'sheet-scroll' }, props.children),
    BottomSheetFooter: (props: { children?: React.ReactNode }) =>
      ReactActual.createElement(View, { testID: 'sheet-footer' }, props.children),
  };
});

jest.mock('../viewmodels/DirectionsViewModel', () => ({ useDirectionsViewModel: jest.fn() }));
jest.mock('../services/SearchService', () => ({ SearchService: { search: jest.fn(() => []) } }));

const mockedVm = useDirectionsViewModel as jest.Mock;

const destination: Place = {
  id: 'B1',
  name: 'Block 1',
  category: 'Block',
  description: 'Block 1.',
  coordinate: { latitude: 24.9, longitude: 67.1 },
  sourceVersion: 'v2',
} as Place;

const route = { nodes: ['A', 'B'], coordinates: [], totalDistance: 250, estimatedTimeMin: 4 };

function outsideRoute(provider: 'google' | 'offline-osm' | 'direct-guide') {
  return {
    sourceVersion: 'v2',
    ...route,
    outsideRoute: {
      schemaVersion: 1,
      candidateId: 'c1',
      requestId: 'r1',
      requestVersion: 1,
      provider,
      gateId: 'GATE_12',
      distanceM: 120,
      durationSeconds: provider === 'direct-guide' ? null : 240,
      coordinates: [],
      steps: [],
      roadFollowing: provider !== 'direct-guide',
      distanceKind: provider === 'direct-guide' ? 'direct-distance' : 'road',
      warnings: [],
      fallbackReason: null,
      fallbackHistory: [],
    },
  };
}

function vm(overrides: Record<string, unknown> = {}) {
  return {
    route: null,
    startSource: 'live_gps',
    startSourceLabel: 'My current location',
    startSourceSupportingCopy: 'Using live GPS location now.',
    isCurrentLocationStartActive: true,
    rememberedLocationAgeLabel: 'from 5 minutes ago',
    rememberedLocationAvailable: true,
    rememberedLocationInsideVenue: true,
    currentRouteOriginInsideVenue: true,
    loadState: 'idle',
    errorMessage: null,
    manualStart: null,
    chooseManualStart: jest.fn(),
    setIsEditingManualStart: jest.fn(),
    setManualStartPlace: jest.fn(),
    chooseCurrentLocation: jest.fn(async () => true),
    chooseRememberedLocation: jest.fn(() => true),
    calculateRoute: jest.fn(async () => {}),
    retryOutsideRoute: jest.fn(async () => {}),
    selectManualGate: jest.fn(),
    clearManualGateSelection: jest.fn(),
    manualGateId: null,
    manualGateOptions: [],
    routeRefreshing: false,
    handleStartNavigation: jest.fn(),
    showManualStartSearch: false,
    canStartNavigation: true,
    startNavigationDisabledReason: '',
    ...overrides,
  };
}


const onClose = jest.fn();
const renderSheet = (props: Partial<React.ComponentProps<typeof LocationSheet>> = {}) =>
  render(
    <>
      <LocationSheet mode="routePreview" destination={destination} onClose={onClose} {...(props as object)} />
      <DirectionsSheetFooter animatedFooterPosition={{ value: 0, get: () => 0 } as never} />
    </>,
  );

const readyVm = (overrides: Record<string, unknown> = {}) =>
  vm({
    route: { sourceVersion: 'v2', ...route, estimatedTimeMin: 13, totalDistance: 1100 },
    loadState: 'ready',
    startSource: 'manual_place',
    startSourceLabel: 'Gate 13',
    isCurrentLocationStartActive: false,
    manualStart: { id: 'G13', name: 'Gate 13' },
    ...overrides,
  });

beforeEach(() => {
  jest.clearAllMocks();
  useAppStore.setState({ currentLocation: { latitude: 24.9, longitude: 67.1 } as never });
  Dimensions.set({ window: { width: 390, height: 844, scale: 2, fontScale: 1 } });
});

describe('Route ready — FROM / TO at a glance', () => {
  test('shows FROM Gate 13 and TO Block 1 together, with the route summary', async () => {
    mockedVm.mockReturnValue(readyVm());
    await renderSheet();

    expect(screen.getByText('From')).toBeOnTheScreen();
    expect(screen.getByText('Gate 13')).toBeOnTheScreen();
    expect(screen.getByText('To')).toBeOnTheScreen();
    expect(screen.getByText('Block 1')).toBeOnTheScreen();
    expect(screen.getByLabelText('Route ready, 13 min, 1.1 km')).toBeOnTheScreen();
  });

  test('replaces the tall Going to / Starting from cards so both ends fit above the fold', async () => {
    mockedVm.mockReturnValue(readyVm());
    await renderSheet();

    expect(screen.queryByRole('header', { name: 'Going to' })).not.toBeOnTheScreen();
    expect(screen.queryByRole('header', { name: 'Starting from' })).not.toBeOnTheScreen();
    expect(screen.queryByText('Your destination inside Ijtema')).not.toBeOnTheScreen();
  });

  test('keeps start provenance truthful and offers no search once both ends are chosen', async () => {
    mockedVm.mockReturnValue(readyVm({ startSource: 'remembered_location', startSourceLabel: 'Last known location' }));
    await renderSheet();

    expect(screen.getByText('Using your saved location')).toBeOnTheScreen();
    expect(screen.queryByPlaceholderText(/search/i)).not.toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: /Use my current location/ })).not.toBeOnTheScreen();
  });

  test('exactly one primary action, with its disabled reason kept truthful', async () => {
    mockedVm.mockReturnValue(
      readyVm({ canStartNavigation: false, startNavigationDisabledReason: 'Waiting for a precise location.' }),
    );
    await renderSheet();

    expect(screen.getAllByRole('button', { name: /Start Navigation/ })).toHaveLength(1);
    expect(screen.getByText('Waiting for a precise location.')).toBeOnTheScreen();
  });

  test('Change Start opens the start choices; Change destination opens the Directory; Back closes', async () => {
    mockedVm.mockReturnValue(readyVm());
    const onOpenDirectory = jest.fn();
    const user = userEvent.setup();
    await renderSheet({ onOpenDirectory, onChangeDestination: jest.fn() });

    await user.press(screen.getByRole('button', { name: 'Change destination' }));
    expect(onOpenDirectory).toHaveBeenCalledWith('destination');

    await user.press(screen.getByRole('button', { name: 'Change starting point' }));
    expect(screen.getByText('Choose where you are starting from')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByText('Gate 13')).toBeOnTheScreen();

    await user.press(screen.getByRole('button', { name: 'Back' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

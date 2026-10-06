/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Directions says one plain thing per state and never leaves a dead primary button. These cover the states whose
// wording and action were unclear: a failed route ("Try again" / "Change start") and a journey that still needs a
// start ("Where are you starting from?" with one way to choose it). Presentation only: the states come from the
// view model (`loadState`), nothing here infers a start from coordinates.

import React from 'react';
import { render, screen, userEvent } from './test-utils';

import { LocationSheet } from '../views/components/map/LocationSheet';
import { DirectionsSheetFooter } from '../views/components/map/DirectionsSheetFooter';
import { useDirectionsViewModel } from '../viewmodels/DirectionsViewModel';
import { useAppStore } from '../store/useAppStore';
import type { Place } from '../models/types';

jest.mock('@gorhom/bottom-sheet', () => {
  const ReactActual = jest.requireActual('react');
  const { View } = jest.requireActual('react-native');
  return {
    __esModule: true,
    BottomSheetScrollView: (props: { children?: React.ReactNode }) => ReactActual.createElement(View, { testID: 'sheet-scroll' }, props.children),
    BottomSheetFooter: (props: { children?: React.ReactNode }) => ReactActual.createElement(View, null, props.children),
  };
});
jest.mock('../viewmodels/DirectionsViewModel', () => ({ useDirectionsViewModel: jest.fn() }));
jest.mock('../services/SearchService', () => ({ SearchService: { search: jest.fn(() => []) } }));

const mockedVm = useDirectionsViewModel as jest.Mock;
const initialStoreState = useAppStore.getState();
const destination = { id: 'B2', name: 'Block 2', category: 'Block', description: '', coordinate: { latitude: 24.9, longitude: 67.1 }, sourceVersion: 'v2' } as Place;
const route = { sourceVersion: 'v2', nodes: ['A', 'B'], coordinates: [], totalDistance: 121, estimatedTimeMin: 2 };

function vm(overrides: Record<string, unknown> = {}) {
  return {
    route, loadState: 'ready', startSource: 'manual_place', startSourceLabel: 'Block 9', startSourceSupportingCopy: '',
    manualStart: { id: 'B9', name: 'Block 9' }, errorMessage: null, manualGateId: null, manualGateOptions: [],
    routeRefreshing: false, currentRouteOriginInsideVenue: true, isOutsideStart: false,
    setManualStartPlace: jest.fn(), chooseCurrentLocation: jest.fn(), chooseRememberedLocation: jest.fn(),
    calculateRoute: jest.fn(async () => {}), retryOutsideRoute: jest.fn(), selectManualGate: jest.fn(), clearManualGateSelection: jest.fn(),
    handleStartNavigation: jest.fn(), canStartNavigation: false, startNavigationDisabledReason: '',
    startAction: { kind: 'route_guide', primaryLabel: 'Start route', secondaryLabel: 'Use my location to guide me' },
    startAttempt: 'idle', runStartAction: jest.fn(), startRouteGuide: jest.fn(), ...overrides,
  };
}

const onOpenDirectory = jest.fn();
const renderSheet = () =>
  render(
    <>
      <LocationSheet mode="routePreview" destination={destination} onClose={jest.fn()} onStartNavigation={jest.fn()}
        onOpenDirectory={onOpenDirectory} onViewRoute={jest.fn()} onChangeDestination={jest.fn()} />
      <DirectionsSheetFooter animatedFooterPosition={{ value: 0, get: () => 0 } as never} />
    </>,
  );

beforeEach(() => {
  jest.clearAllMocks();
  useAppStore.setState(initialStoreState, true);
  mockedVm.mockReturnValue(vm());
});

describe('failed route', () => {
  test('says what happened and offers Try again and Change start', async () => {
    mockedVm.mockReturnValue(vm({ loadState: 'error', route: null, errorMessage: null }));
    const user = userEvent.setup();
    await renderSheet();

    expect(screen.getByText("We couldn't find a walking route.")).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Choose another start' })).not.toBeOnTheScreen();

    await user.press(screen.getByRole('button', { name: 'Change start' }));
    expect(onOpenDirectory).toHaveBeenCalledWith('start');
  });
});

describe('needs a start', () => {
  const needsStart = (overrides: Record<string, unknown> = {}) =>
    mockedVm.mockReturnValue(vm({ loadState: 'needs_origin', route: null, startAction: null, startSource: 'manual_place', manualStart: null, startSourceLabel: 'Choose where to start', ...overrides }));

  test('asks the one question and gives one way to answer it', async () => {
    needsStart();
    const user = userEvent.setup();
    await renderSheet();

    expect(screen.getByText('Where are you starting from?')).toBeOnTheScreen();
    const choose = screen.getByRole('button', { name: 'Choose start' });
    expect(choose).toBeEnabled();

    await user.press(choose);
    expect(onOpenDirectory).toHaveBeenCalledWith('start');
  });

  test('keeps a specific reason when there is one', async () => {
    needsStart({ errorMessage: 'Choose a place inside Ijtema to start from.' });
    await renderSheet();

    expect(screen.getByText('Where are you starting from?')).toBeOnTheScreen();
    expect(screen.getByText('Choose a place inside Ijtema to start from.')).toBeOnTheScreen();
  });

  test('says nothing about a route, a gate or Start Navigation', async () => {
    needsStart();
    await renderSheet();

    expect(screen.queryByRole('button', { name: /Start Navigation|Start route|Start walking/ })).not.toBeOnTheScreen();
  });
});

describe('no dead primary button in any state', () => {
  test.each([
    ['failed', { loadState: 'error', route: null }],
    ['same place', { loadState: 'same_place', route: null }],
    ['needs start', { loadState: 'needs_origin', route: null, startAction: null, manualStart: null }],
    ['ready, manual start', {}],
  ])('%s', async (_name, overrides) => {
    mockedVm.mockReturnValue(vm(overrides));
    await renderSheet();

    // Every state offers an action (the pinned footer is there), and none of its buttons is disabled.
    expect(screen.getByTestId('directions-footer')).toBeOnTheScreen();
    for (const button of screen.getAllByRole('button')) {
      expect(button.props.accessibilityState?.disabled).not.toBe(true);
    }
  });
});

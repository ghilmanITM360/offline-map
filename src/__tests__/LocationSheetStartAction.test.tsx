/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render, screen, userEvent } from './test-utils';

import { LocationSheet } from '../views/components/map/LocationSheet';
import { DirectionsSheetFooter } from '../views/components/map/DirectionsSheetFooter';
import { useDirectionsViewModel } from '../viewmodels/DirectionsViewModel';
import type { Place } from '../models/types';

jest.mock('@gorhom/bottom-sheet', () => {
  const ReactActual = jest.requireActual('react');
  const { View } = jest.requireActual('react-native');
  return {
    __esModule: true,
    BottomSheetScrollView: (props: { children?: React.ReactNode }) => ReactActual.createElement(View, null, props.children),
    BottomSheetFooter: (props: { children?: React.ReactNode }) => ReactActual.createElement(View, null, props.children),
  };
});
jest.mock('../viewmodels/DirectionsViewModel', () => ({ useDirectionsViewModel: jest.fn() }));
jest.mock('../services/SearchService', () => ({ SearchService: { search: jest.fn(() => []) } }));

const mockedVm = useDirectionsViewModel as jest.Mock;
const destination = { id: 'B1', name: 'Block 1', category: 'Block', description: '', coordinate: { latitude: 24.9, longitude: 67.1 }, sourceVersion: 'v2' } as Place;
const route = { sourceVersion: 'v2', nodes: ['A', 'B'], coordinates: [], totalDistance: 1200, estimatedTimeMin: 14 };

const runStartAction = jest.fn();
function vm(startAction: unknown, overrides: Record<string, unknown> = {}) {
  return {
    route, loadState: 'ready', startSource: 'manual_place', startSourceLabel: 'Block 27', startSourceSupportingCopy: '',
    manualStart: { id: 'B27', name: 'Block 27' }, errorMessage: null, manualGateId: null, manualGateOptions: [],
    routeRefreshing: false, currentRouteOriginInsideVenue: true, isOutsideStart: false,
    setManualStartPlace: jest.fn(), chooseCurrentLocation: jest.fn(), chooseRememberedLocation: jest.fn(),
    calculateRoute: jest.fn(), retryOutsideRoute: jest.fn(), selectManualGate: jest.fn(), clearManualGateSelection: jest.fn(),
    handleStartNavigation: jest.fn(),
    canStartNavigation: false, startNavigationDisabledReason: 'Choose a current precise location before starting live navigation.',
    startAction, startAttempt: 'idle', runStartAction, ...overrides,
  };
}

const onClose = jest.fn();
const onStartNavigation = jest.fn();
const onOpenDirectory = jest.fn();
const onViewRoute = jest.fn();
const renderSheet = () =>
  render(
    <>
      <LocationSheet mode="routePreview" destination={destination} onClose={onClose} onStartNavigation={onStartNavigation}
        onOpenDirectory={onOpenDirectory} onViewRoute={onViewRoute} onChangeDestination={jest.fn()} />
      <DirectionsSheetFooter animatedFooterPosition={{ value: 0, get: () => 0 } as never} />
    </>,
  );

beforeEach(() => jest.clearAllMocks());

describe('Route-ready start action (no dead Start button)', () => {
  test('no live fix: an enabled "Use my location & start" replaces the disabled Start and its technical paragraph', async () => {
    mockedVm.mockReturnValue(vm({ kind: 'use_location', primaryLabel: 'Use my location & start', secondaryLabel: 'View route' }));
    const user = userEvent.setup();
    await renderSheet();

    expect(screen.getByRole('button', { name: 'Use my location & start' })).toBeEnabled();
    expect(screen.queryByText(/Start Navigation/)).not.toBeOnTheScreen();
    expect(screen.queryByText(/precise location|Route preview remains/i)).not.toBeOnTheScreen();
    expect(screen.getByText('Route ready')).toBeOnTheScreen();

    await user.press(screen.getByRole('button', { name: 'Use my location & start' }));
    expect(runStartAction).toHaveBeenCalledTimes(1);
    await user.press(screen.getByRole('button', { name: 'View route' }));
    expect(onViewRoute).toHaveBeenCalledTimes(1);
  });

  test('permission needed: "Turn on location & start" is the primary action', async () => {
    mockedVm.mockReturnValue(vm({ kind: 'turn_on_location', primaryLabel: 'Turn on location & start', secondaryLabel: 'View route' }));
    await renderSheet();
    expect(screen.getByRole('button', { name: 'Turn on location & start' })).toBeEnabled();
  });

  test('live start with a fresh fix: "Ready to go" with a plain Start Navigation that requests navigation without dismissing setup itself', async () => {
    runStartAction.mockImplementation((startNow: () => void) => startNow());
    mockedVm.mockReturnValue(vm({ kind: 'start', primaryLabel: 'Start Navigation', title: 'Ready to go' }, { canStartNavigation: true, startNavigationDisabledReason: '' }));
    const user = userEvent.setup();
    await renderSheet();

    expect(screen.getByText('Ready to go')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Start Navigation' }));
    expect(onStartNavigation).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  test('a failed attempt shows one short recovery sentence and keeps the action available', async () => {
    mockedVm.mockReturnValue(vm({ kind: 'use_location', primaryLabel: 'Use my location & start', secondaryLabel: 'View route' }, { startAttempt: 'failed' }));
    await renderSheet();
    expect(screen.getByText("Couldn't find your location. Try again, or change your start.")).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Use my location & start' })).toBeEnabled();
  });

  test('while locating, the button says so (the only transient disabled state)', async () => {
    mockedVm.mockReturnValue(vm({ kind: 'use_location', primaryLabel: 'Use my location & start', secondaryLabel: 'View route' }, { startAttempt: 'working' }));
    await renderSheet();
    expect(screen.getByRole('button', { name: 'Finding your location…' })).toBeDisabled();
  });

  test('an unstartable route (not a location problem) still shows the truthful disabled reason', async () => {
    mockedVm.mockReturnValue(vm(null, { startNavigationDisabledReason: "We couldn't find a walking route." }));
    await renderSheet();
    expect(screen.getByText("We couldn't find a walking route.")).toBeOnTheScreen();
  });
});

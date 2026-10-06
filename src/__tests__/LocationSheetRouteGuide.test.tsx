/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// #307: the route guide is the truthful manual mode. It must offer a plain Start route for a chosen FROM + TO,
// show readable steps the user moves through themselves, and never claim live movement, progress or arrival.

import React from 'react';
import { render, screen, userEvent } from './test-utils';

import { LocationSheet } from '../views/components/map/LocationSheet';
import { DirectionsSheetFooter } from '../views/components/map/DirectionsSheetFooter';
import { DirectionsPeekHandle } from '../views/components/map/DirectionsPeekHandle';
import { useDirectionsViewModel } from '../viewmodels/DirectionsViewModel';
import { useAppStore } from '../store/useAppStore';
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
const initialStoreState = useAppStore.getState();
const destination = { id: 'B2', name: 'Block 2', category: 'Block', description: '', coordinate: { latitude: 24.9, longitude: 67.1 }, sourceVersion: 'v2' } as Place;
const route = { sourceVersion: 'v2', nodes: ['A', 'B'], coordinates: [], totalDistance: 121, estimatedTimeMin: 2 };
const steps = [
  { text: 'Walk along Rasta 1', distanceM: 60 },
  { text: 'Turn right onto Rasta 4', distanceM: 40 },
  { text: 'Arrive at Block 2', distanceM: 0 },
];

const runStartAction = jest.fn();
const startRouteGuide = jest.fn();
const guideAction = { kind: 'route_guide', primaryLabel: 'Start route', secondaryLabel: 'Use my location for live guidance' };
function vm(overrides: Record<string, unknown> = {}) {
  return {
    route, loadState: 'ready', startSource: 'manual_place', startSourceLabel: 'Block 9', startSourceSupportingCopy: '',
    manualStart: { id: 'B9', name: 'Block 9' }, errorMessage: null, manualGateId: null, manualGateOptions: [],
    routeRefreshing: false, currentRouteOriginInsideVenue: true, isOutsideStart: false,
    setManualStartPlace: jest.fn(), chooseCurrentLocation: jest.fn(), chooseRememberedLocation: jest.fn(),
    calculateRoute: jest.fn(), retryOutsideRoute: jest.fn(), selectManualGate: jest.fn(), clearManualGateSelection: jest.fn(),
    handleStartNavigation: jest.fn(), canStartNavigation: false, startNavigationDisabledReason: '',
    startAction: guideAction, startAttempt: 'idle', runStartAction, startRouteGuide, ...overrides,
  };
}

const onClose = jest.fn();
const onRouteGuideStarted = jest.fn();
const renderSheet = () =>
  render(
    <>
      <LocationSheet mode="routePreview" destination={destination} onClose={onClose} onStartNavigation={jest.fn()}
        onOpenDirectory={jest.fn()} onViewRoute={jest.fn()} onChangeDestination={jest.fn()} onRouteGuideStarted={onRouteGuideStarted} />
      <DirectionsSheetFooter animatedFooterPosition={{ value: 0, get: () => 0 } as never} />
      <DirectionsPeekHandle />
    </>,
  );

beforeEach(() => {
  jest.clearAllMocks();
  useAppStore.setState(initialStoreState, true);
  mockedVm.mockReturnValue(vm());
});

describe('Start route (route ready, chosen FROM + TO)', () => {
  test('Start route is the enabled primary and opens the guide; live guidance is the secondary', async () => {
    const user = userEvent.setup();
    await renderSheet();
    expect(screen.getByRole('button', { name: 'Start route' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Use my location for live guidance' })).toBeEnabled();

    await user.press(screen.getByRole('button', { name: 'Start route' }));
    expect(startRouteGuide).toHaveBeenCalledTimes(1);
    expect(onRouteGuideStarted).toHaveBeenCalledTimes(1);
    expect(runStartAction).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled(); // the sheet stays: the guide lives in it
  });

  test('the secondary runs the live start flow (fresh fix, recompute from the real position)', async () => {
    const user = userEvent.setup();
    await renderSheet();
    await user.press(screen.getByRole('button', { name: 'Use my location for live guidance' }));
    expect(runStartAction).toHaveBeenCalledTimes(1);
    expect(startRouteGuide).not.toHaveBeenCalled();
  });
});

describe('Route guide card', () => {
  const open = () => useAppStore.setState({ routeGuide: { steps, stepIndex: 0 } });

  test('shows the first step and says plainly that the position is not tracked', async () => {
    open();
    await renderSheet();
    expect(screen.getByText('Route guide')).toBeOnTheScreen();
    expect(screen.getByText("Your position isn't tracked. Use the steps to find your way.")).toBeOnTheScreen();
    expect(screen.getByText('Step 1 of 3')).toBeOnTheScreen();
    expect(screen.getByText('Walk along Rasta 1')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Start route' })).not.toBeOnTheScreen();
  });

  test('the user moves through the steps; the ends are disabled', async () => {
    open();
    const user = userEvent.setup();
    await renderSheet();
    expect(screen.getByRole('button', { name: 'Previous step' })).toBeDisabled();

    await user.press(screen.getByRole('button', { name: 'Next step' }));
    expect(screen.getByText('Step 2 of 3')).toBeOnTheScreen();
    expect(screen.getByText('Turn right onto Rasta 4')).toBeOnTheScreen();

    await user.press(screen.getByRole('button', { name: 'Next step' }));
    expect(screen.getByText('Arrive at Block 2')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Next step' })).toBeDisabled();

    await user.press(screen.getByRole('button', { name: 'Previous step' }));
    expect(screen.getByText('Step 2 of 3')).toBeOnTheScreen();
  });

  test('never claims live movement, progress, rerouting or arrival', async () => {
    open();
    await renderSheet();
    expect(screen.queryByText(/Start Navigation|You have arrived|Rerout|Recalculat|on route|remaining|GPS/i)).not.toBeOnTheScreen();
  });

  test('can upgrade to live guidance or end the guide', async () => {
    open();
    const user = userEvent.setup();
    await renderSheet();
    await user.press(screen.getByRole('button', { name: 'Use my location for live guidance' }));
    expect(runStartAction).toHaveBeenCalledTimes(1);

    await user.press(screen.getByRole('button', { name: 'End route guide' }));
    expect(useAppStore.getState().routeGuide).toBeNull();
  });
});


describe('collapsed Directions peek (#307)', () => {
  test('route setup says what is being planned', async () => {
    mockedVm.mockReturnValue(vm({ loadState: 'needs_origin', route: null, startAction: null }));
    await renderSheet();
    expect(screen.getByText('Directions · Block 9 → Block 2')).toBeOnTheScreen();
  });

  test('route ready shows the time and distance', async () => {
    await renderSheet();
    expect(screen.getByText('2 min · 121 m')).toBeOnTheScreen();
  });

  test('route guide shows the next step and how far', async () => {
    useAppStore.setState({ routeGuide: { steps, stepIndex: 1 } });
    await renderSheet();
    expect(screen.getByText('Next: Turn right onto Rasta 4 · 40 m')).toBeOnTheScreen();
  });

  test('tapping the peek asks the owner of the sheet to expand it', async () => {
    const onExpandSheet = jest.fn();
    await render(
      <>
        <LocationSheet mode="routePreview" destination={destination} onClose={jest.fn()} onStartNavigation={jest.fn()}
          onOpenDirectory={jest.fn()} onViewRoute={jest.fn()} onChangeDestination={jest.fn()} onExpandSheet={onExpandSheet} />
        <DirectionsPeekHandle />
      </>,
    );
    await userEvent.setup().press(screen.getByRole('button', { name: /Show route details/ }));
    expect(onExpandSheet).toHaveBeenCalledTimes(1);
  });

  test('the peek goes away with the sheet', async () => {
    const view = await renderSheet();
    await view.unmount();
    await render(<DirectionsPeekHandle />);
    expect(screen.queryByRole('button', { name: /Show route details/ })).not.toBeOnTheScreen();
  });
});

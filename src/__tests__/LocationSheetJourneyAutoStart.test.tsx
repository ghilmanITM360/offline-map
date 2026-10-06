/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// #307: a destination tapped in the Directory hands Home a journey. The sheet starts it by itself (no extra
// Details -> Directions -> Route Ready -> Start taps) while keeping every safety rule: live navigation still
// begins only from a fresh fix, and a failure leaves the usual manual-start UI instead of a dead end.

import React from 'react';
import { act, render } from './test-utils';

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
    BottomSheetScrollView: (props: { children?: React.ReactNode }) => ReactActual.createElement(View, null, props.children),
    BottomSheetFooter: (props: { children?: React.ReactNode }) => ReactActual.createElement(View, null, props.children),
  };
});
jest.mock('../viewmodels/DirectionsViewModel', () => ({ useDirectionsViewModel: jest.fn() }));
jest.mock('../services/SearchService', () => ({ SearchService: { search: jest.fn(() => []) } }));

const mockedVm = useDirectionsViewModel as jest.Mock;
const destination = { id: 'B2', name: 'Block 2', category: 'Block', description: '', coordinate: { latitude: 24.9, longitude: 67.1 }, sourceVersion: 'v2' } as Place;
const start = { id: 'B9', name: 'Block 9', category: 'Block', description: '', coordinate: { latitude: 24.91, longitude: 67.11 }, sourceVersion: 'v2' } as Place;
const route = { sourceVersion: 'v2', nodes: ['A', 'B'], coordinates: [], totalDistance: 121, estimatedTimeMin: 2 };

const fns = {
  runStartAction: jest.fn(),
  startRouteGuide: jest.fn(),
  setManualStartPlace: jest.fn(),
  chooseCurrentLocation: jest.fn(async () => true),
};
function vm(overrides: Record<string, unknown> = {}) {
  return {
    route, loadState: 'ready', startSource: 'manual_place', startSourceLabel: 'Block 9', startSourceSupportingCopy: '',
    manualStart: start, errorMessage: null, manualGateId: null, manualGateOptions: [],
    routeRefreshing: false, currentRouteOriginInsideVenue: true, isOutsideStart: false,
    chooseRememberedLocation: jest.fn(), calculateRoute: jest.fn(), retryOutsideRoute: jest.fn(),
    selectManualGate: jest.fn(), clearManualGateSelection: jest.fn(), handleStartNavigation: jest.fn(),
    canStartNavigation: true, startNavigationDisabledReason: '', startAttempt: 'idle', ...fns, ...overrides,
  };
}

const onClose = jest.fn();
const onStartNavigation = jest.fn();
const onRouteGuideStarted = jest.fn();
const sheet = (journey?: { mode: 'live' | 'guide'; start: Place | null }) => (
  <>
    <LocationSheet mode="routePreview" destination={destination} onClose={onClose} onStartNavigation={onStartNavigation}
      onOpenDirectory={jest.fn()} onViewRoute={jest.fn()} onChangeDestination={jest.fn()}
      onRouteGuideStarted={onRouteGuideStarted} journey={journey} />
    <DirectionsSheetFooter animatedFooterPosition={{ value: 0, get: () => 0 } as never} />
  </>
);

const initialStoreState = useAppStore.getState();
const dest = { id: 'B2', name: 'Block 2' } as never;
const publishedRoute = () => useAppStore.setState({ activeRoute: route as never, routePlannerDest: dest });
beforeEach(() => {
  jest.clearAllMocks();
  useAppStore.setState(initialStoreState, true);
  fns.chooseCurrentLocation.mockResolvedValue(true);
});

describe('journey auto-start (#307)', () => {
  test('guide: applies the chosen start, then opens the route guide once the route is ready', async () => {
    mockedVm.mockReturnValue(vm({ startAction: { kind: 'route_guide', primaryLabel: 'Start route', secondaryLabel: 'Use my location to guide me' } }));
    await render(sheet({ mode: 'guide', start }));
    expect(fns.setManualStartPlace).toHaveBeenCalledWith(start);
    expect(fns.startRouteGuide).toHaveBeenCalledTimes(1);
    expect(onRouteGuideStarted).toHaveBeenCalledTimes(1);
    expect(fns.runStartAction).not.toHaveBeenCalled();
  });

  test('guide: waits while the route is still being found', async () => {
    mockedVm.mockReturnValue(vm({ loadState: 'loading', route: null, startAction: null }));
    await render(sheet({ mode: 'guide', start }));
    expect(fns.startRouteGuide).not.toHaveBeenCalled();
  });

  test('live with a fresh fix: starts navigation directly (no extra Start tap)', async () => {
    publishedRoute();
    mockedVm.mockReturnValue(vm({ startSource: 'live_gps', manualStart: null, startAction: { kind: 'start', primaryLabel: 'Start Navigation', title: 'Ready to go' } }));
    await render(sheet({ mode: 'live', start: null }));
    expect(onStartNavigation).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('live waits until Home can start it: the preview route AND its destination are in the store (runtime race)', async () => {
    mockedVm.mockReturnValue(vm({ startSource: 'live_gps', manualStart: null, startAction: { kind: 'start', primaryLabel: 'Start Navigation', title: 'Ready to go' } }));
    await render(sheet({ mode: 'live', start: null }));
    expect(onStartNavigation).not.toHaveBeenCalled();

    // The route alone is not enough: Home's start handler also needs routePlannerDest and silently returns without it.
    await act(async () => useAppStore.setState({ activeRoute: route as never }));
    expect(onStartNavigation).not.toHaveBeenCalled();

    await act(async () => useAppStore.setState({ routePlannerDest: dest }));
    expect(onStartNavigation).toHaveBeenCalledTimes(1);
  });

  test('live with a fix that needs refreshing: runs the fresh-fix start flow once', async () => {
    mockedVm.mockReturnValue(vm({ startSource: 'live_gps', manualStart: null, startAction: { kind: 'use_location', primaryLabel: 'Use my location & start', secondaryLabel: 'View route' } }));
    await render(sheet({ mode: 'live', start: null }));
    expect(fns.runStartAction).toHaveBeenCalledTimes(1);
    expect(onStartNavigation).not.toHaveBeenCalled();
  });

  test('live with no origin yet: finds the current location once', async () => {
    mockedVm.mockReturnValue(vm({ loadState: 'needs_origin', route: null, startSource: 'manual_place', manualStart: null, startAction: null }));
    await render(sheet({ mode: 'live', start: null }));
    expect(fns.chooseCurrentLocation).toHaveBeenCalledTimes(1);
  });

  test('live that cannot find a location starts nothing: the usual manual-start UI stays', async () => {
    fns.chooseCurrentLocation.mockResolvedValue(false);
    mockedVm.mockReturnValue(vm({ loadState: 'needs_origin', route: null, manualStart: null, startAction: null }));
    await render(sheet({ mode: 'live', start: null }));
    expect(fns.chooseCurrentLocation).toHaveBeenCalledTimes(1);
    expect(onStartNavigation).not.toHaveBeenCalled();
    expect(fns.startRouteGuide).not.toHaveBeenCalled();
  });

  test('live where permission is not in place never auto-starts or bounces to Settings: the buttons are shown', async () => {
    mockedVm.mockReturnValue(vm({ startSource: 'live_gps', manualStart: null, startAction: { kind: 'turn_on_location', primaryLabel: 'Turn on location & start', secondaryLabel: 'View route' } }));
    await render(sheet({ mode: 'live', start: null }));
    expect(fns.runStartAction).not.toHaveBeenCalled();
    expect(onStartNavigation).not.toHaveBeenCalled();
  });

  test('no journey: nothing starts by itself', async () => {
    mockedVm.mockReturnValue(vm({ startAction: { kind: 'route_guide', primaryLabel: 'Start route', secondaryLabel: 'Use my location to guide me' } }));
    await render(sheet(undefined));
    expect(fns.startRouteGuide).not.toHaveBeenCalled();
    expect(fns.runStartAction).not.toHaveBeenCalled();
    expect(fns.setManualStartPlace).not.toHaveBeenCalled();
  });
});

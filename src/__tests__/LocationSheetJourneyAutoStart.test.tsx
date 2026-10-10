/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Destination previews require an explicit guide or live action, including after rerenders.

import React from 'react';
import { render } from './test-utils';

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
const sheet = () => (
  <>
    <LocationSheet mode="routePreview" destination={destination} onClose={onClose} onStartNavigation={onStartNavigation}
      onOpenDirectory={jest.fn()} onViewRoute={jest.fn()} onChangeDestination={jest.fn()}
      onRouteGuideStarted={onRouteGuideStarted} />
    <DirectionsSheetFooter animatedFooterPosition={{ value: 0, get: () => 0 } as never} />
  </>
);

const initialStoreState = useAppStore.getState();
beforeEach(() => {
  jest.clearAllMocks();
  useAppStore.setState(initialStoreState, true);
  fns.chooseCurrentLocation.mockResolvedValue(true);
});

describe('destination preview never starts automatically', () => {
  test.each(['ready', 'needs_origin', 'loading'])('%s does not acquire location or activate either mode', async loadState => {
    mockedVm.mockReturnValue(vm({ loadState, journeyState: loadState === 'ready' ? 'LIVE_READY' : 'NEEDS_START', startSource: 'live_gps', manualStart: null, startAction: { kind: 'start', primaryLabel: 'Start Navigation' } }));
    await render(sheet());
    expect(fns.chooseCurrentLocation).not.toHaveBeenCalled();
    expect(fns.runStartAction).not.toHaveBeenCalled();
    expect(fns.startRouteGuide).not.toHaveBeenCalled();
    expect(onStartNavigation).not.toHaveBeenCalled();
  });
  test('manual preview waits for explicit guide action', async () => {
    mockedVm.mockReturnValue(vm({ journeyState: 'MANUAL_GUIDE_READY', startAction: { kind: 'route_guide', primaryLabel: 'Start route' } }));
    await render(sheet());
    expect(fns.startRouteGuide).not.toHaveBeenCalled();
    expect(fns.setManualStartPlace).not.toHaveBeenCalled();
  });
});

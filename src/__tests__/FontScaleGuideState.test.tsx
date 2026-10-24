/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// B7R-3F, real screens: a Dynamic Type change replaces the paragraphs of the Route Guide (so RN 0.81 cannot re-use
// their old measurement) without touching the guide itself: step, route, sheet and its buttons stay mounted.

import React from 'react';
import { Dimensions, Platform } from 'react-native';
import { act, render, screen, userEvent } from './test-utils';

import { LocationSheet } from '../views/components/map/LocationSheet';
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

const initialStoreState = useAppStore.getState();
const destination = { id: 'B2', name: 'Block 2', category: 'Block', description: '', coordinate: { latitude: 24.9, longitude: 67.1 }, sourceVersion: 'v2' } as Place;
const route = { sourceVersion: 'v2', nodes: ['A', 'B'], coordinates: [], totalDistance: 121, estimatedTimeMin: 2 };
const steps = [
  { text: 'Walk along Rasta 1', distanceM: 60 },
  { text: 'Turn right onto Rasta 4', distanceM: 40 },
  { text: 'Arrive at Block 2', distanceM: 0 },
];
const guideVm = {
  route, loadState: 'ready', startSource: 'manual_place', startSourceLabel: 'Block 9', startSourceSupportingCopy: '',
  manualStart: { id: 'B9', name: 'Block 9' }, errorMessage: null, manualGateId: null, manualGateOptions: [],
  routeRefreshing: false, currentRouteOriginInsideVenue: true, isOutsideStart: false,
  setManualStartPlace: jest.fn(), chooseCurrentLocation: jest.fn(), chooseRememberedLocation: jest.fn(),
  calculateRoute: jest.fn(), retryOutsideRoute: jest.fn(), selectManualGate: jest.fn(), clearManualGateSelection: jest.fn(),
  handleStartNavigation: jest.fn(), canStartNavigation: false, startNavigationDisabledReason: '',
  startAction: { kind: 'route_guide', primaryLabel: 'Start route', secondaryLabel: 'Use my location to guide me' },
  startAttempt: 'idle', runStartAction: jest.fn(), startRouteGuide: jest.fn(),
};

const onClose = jest.fn();
const setFontScale = (fontScale: number) =>
  act(async () => {
    Dimensions.set({ window: { width: 390, height: 844, scale: 3, fontScale } });
  });

let platformOS: { restore: () => void };
beforeEach(async () => {
  jest.clearAllMocks();
  platformOS = jest.replaceProperty(Platform, 'OS', 'ios');
  useAppStore.setState(initialStoreState, true);
  (useDirectionsViewModel as jest.Mock).mockReturnValue(guideVm);
  await setFontScale(1);
});
afterEach(async () => {
  platformOS.restore();
  await setFontScale(1);
});

test('a font-size change on guide step 2 replaces its text and leaves the guide where it was', async () => {
  const user = userEvent.setup();
  useAppStore.setState({ routeGuide: { steps, stepIndex: 0 } });
  await render(
    <LocationSheet mode="routePreview" destination={destination} onClose={onClose} onStartNavigation={jest.fn()}
      onOpenDirectory={jest.fn()} onViewRoute={jest.fn()} onChangeDestination={jest.fn()} />,
  );
  await user.press(screen.getByRole('button', { name: 'Next step' }));
  expect(screen.getByText('Step 2 of 3')).toBeOnTheScreen();

  const step = screen.getByText('Step 2 of 3');
  const instruction = screen.getByText('Turn right onto Rasta 4');
  const next = screen.getByRole('button', { name: 'Next step' });
  const guide = useAppStore.getState().routeGuide;

  await setFontScale(1.3);

  // The paragraphs are new, so the next commit cannot hand RN their old measurement.
  expect(screen.getByText('Step 2 of 3')).not.toBe(step);
  expect(screen.getByText('Turn right onto Rasta 4')).not.toBe(instruction);
  // The guide did not move and the sheet and its controls were not rebuilt.
  expect(useAppStore.getState().routeGuide).toBe(guide);
  expect(useAppStore.getState().routeGuide?.stepIndex).toBe(1);
  expect(screen.getByRole('button', { name: 'Next step' })).toBe(next);
  expect(onClose).not.toHaveBeenCalled();

  // An unrelated commit keeps the replacements, and the guide still works.
  const replaced = screen.getByText('Step 2 of 3');
  await user.press(screen.getByRole('button', { name: 'Next step' }));
  expect(screen.getByText('Step 3 of 3')).toBeOnTheScreen();
  await user.press(screen.getByRole('button', { name: 'Previous step' }));
  expect(screen.getByText('Step 2 of 3')).toBe(replaced);
});

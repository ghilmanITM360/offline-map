/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// #222 / #131 P0: picking a manual start (e.g. Gate 13) must close the picker and land on the
// route-ready state. Real viewmodel + real LocationSheet — the mocked-VM suites cannot see the
// source-driven `showManualStartSearch` that kept the picker open after a selection.
// The start is chosen in the Directory (the one place chooser): the sheet asks for it through
// onOpenDirectory and applies the directoryChoice the Directory leaves in the store.

import React from 'react';
import type { Place } from '../models/types';
import { useAppStore } from '../store/useAppStore';
import { useDirectionsViewModel } from '../viewmodels/DirectionsViewModel';
import { LocationAccessService } from '../services/LocationAccessService';
import { LocationSheet } from '../views/components/map/LocationSheet';
import { DirectionsSheetFooter } from '../views/components/map/DirectionsSheetFooter';
import { act, render, renderHook, screen, userEvent, waitFor } from './test-utils';

const initialStoreState = useAppStore.getState();
const destination: Place = {
  id: 'B34',
  name: 'Block 34',
  category: 'Block',
  description: 'Block 34',
  coordinate: { latitude: 24.966, longitude: 67.004 },
  sourceVersion: 'v2',
};
const gate13: Place = {
  id: 'GATE_13',
  name: 'Gate 13',
  category: 'Gate',
  description: 'Official Gate 13.',
  coordinate: { latitude: 24.963718, longitude: 67.006862 },
  sourceVersion: 'v1',
};

beforeEach(() => {
  jest.clearAllMocks();
  process.env.EXPO_PUBLIC_USE_IJTEMA_V2_ROUTING = 'true';
  useAppStore.setState(initialStoreState, true);
  useAppStore.setState({
    currentLocation: { latitude: 24.9762, longitude: 67.011 },
    currentLocationSource: 'live',
  });
});

// Before a route is ready the start card has a "Change Start" button; once ready, the FROM row itself is the control.
const changeStart = () =>
  screen.queryByText('Change Start') ?? screen.getByRole('button', { name: /^From .*\. Change start\.$/ });

describe('manual start selection (viewmodel)', () => {
  test('choosing manual opens the editor; selecting a place closes it and keeps the start', async () => {
    const hook = await renderHook(() => useDirectionsViewModel(destination));

    await act(() => hook.result.current.chooseManualStart());
    expect(hook.result.current.showManualStartSearch).toBe(true);

    await act(() => hook.result.current.setManualStartPlace(gate13));
    expect(hook.result.current.showManualStartSearch).toBe(false);
    expect(hook.result.current.startSource).toBe('manual_place');
    expect(hook.result.current.manualStart?.id).toBe('GATE_13');
  });

  test('GPS start never opens the manual editor', async () => {
    const hook = await renderHook(() => useDirectionsViewModel(destination));
    expect(hook.result.current.startSource).toBe('live_gps');
    expect(hook.result.current.showManualStartSearch).toBe(false);
  });
});

describe('Directory is the single start chooser (Get Directions sheet)', () => {
  const onOpenDirectory = jest.fn();
  const onChangeDestination = jest.fn();
  const mount = (onClose = jest.fn()) =>
    render(
      <>
        <LocationSheet
          mode="routePreview"
          destination={destination}
          onClose={onClose}
          onOpenDirectory={onOpenDirectory}
          onChangeDestination={onChangeDestination}
        />
        <DirectionsSheetFooter animatedFooterPosition={{ value: 0, get: () => 0 } as never} />
      </>,
    );
  // What the Directory leaves in the store when the visitor picks something.
  const choose = (choice: NonNullable<ReturnType<typeof useAppStore.getState>['directoryChoice']>) =>
    act(async () => {
      useAppStore.getState().setDirectoryChoice(choice);
    });
  const expectNoChooser = () => {
    expect(screen.queryByText('Choose start manually')).not.toBeOnTheScreen();
    expect(screen.queryByText('Use my current location')).not.toBeOnTheScreen();
    expect(screen.queryByText('Use last known location')).not.toBeOnTheScreen();
  };

  test('no start chosen: Change Start opens the Directory in start mode, with no 3-card chooser', async () => {
    useAppStore.setState({ currentLocation: null, currentLocationSource: null });
    const user = userEvent.setup();
    await mount();

    await user.press(changeStart());

    expect(onOpenDirectory).toHaveBeenCalledTimes(1);
    expect(onOpenDirectory).toHaveBeenLastCalledWith('start');
    expectNoChooser();
  });

  test('existing manual start: Change Start opens the Directory directly', async () => {
    const user = userEvent.setup();
    await mount();
    await choose({ purpose: 'start', place: gate13 });
    expect(screen.getByText('Gate 13')).toBeOnTheScreen();

    await user.press(changeStart());

    expect(onOpenDirectory).toHaveBeenLastCalledWith('start');
    expectNoChooser();
  });

  test('existing GPS start: Change Start opens the Directory directly', async () => {
    const user = userEvent.setup();
    await mount();
    expect(screen.getByText('My current location')).toBeOnTheScreen();

    await user.press(changeStart());

    expect(onOpenDirectory).toHaveBeenLastCalledWith('start');
    expectNoChooser();
  });

  test('route-ready From row also opens the Directory directly', async () => {
    const user = userEvent.setup();
    await mount();
    await waitFor(() => expect(screen.getByText('Route ready')).toBeOnTheScreen(), { timeout: 5_000 });

    await user.press(changeStart());

    expect(onOpenDirectory).toHaveBeenLastCalledWith('start');
    expectNoChooser();
  });

  test('selecting Gate 13 returns with Gate 13 as the start, route ready, destination unchanged', async () => {
    await mount();
    await choose({ purpose: 'start', place: gate13 });

    expect(useAppStore.getState().directoryChoice).toBeNull();
    expect(screen.getByText('Gate 13')).toBeOnTheScreen();
    expect(screen.getByText('Block 34')).toBeOnTheScreen();
    expect(onChangeDestination).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByText('Route ready')).toBeOnTheScreen(), { timeout: 5_000 });
  });

  test('selecting the current-location quick option returns with a GPS start', async () => {
    const coordinate = { latitude: 24.9762, longitude: 67.011 };
    jest.spyOn(LocationAccessService, 'resolveCurrentLocation').mockResolvedValue({
      ok: true,
      coordinate,
      source: 'live',
      permissionState: { granted: true, canAskAgain: true, status: 'granted', precision: 'fine' },
    } as never);
    await mount();
    await choose({ purpose: 'start', place: gate13 });
    expect(screen.getByText('Gate 13')).toBeOnTheScreen();

    await choose({ purpose: 'start', quick: 'current_location' });

    expect(useAppStore.getState().directoryChoice).toBeNull();
    await waitFor(() => expect(screen.getByText('My current location')).toBeOnTheScreen());
    expect(screen.queryByText('Gate 13')).not.toBeOnTheScreen();
    expect(screen.getByText('Block 34')).toBeOnTheScreen();
  });

  test('selecting the last-known quick option returns with the remembered start', async () => {
    useAppStore.setState({
      lastKnownLocation: { latitude: 24.9762, longitude: 67.011 },
      lastKnownLocationUpdatedAt: new Date().toISOString(),
    });
    await mount();

    await choose({ purpose: 'start', quick: 'last_known' });

    await waitFor(() => expect(screen.getAllByText(/^Last known location/).length).toBeGreaterThan(0));
    expect(screen.getByText('Block 34')).toBeOnTheScreen();
  });

  test('cancelling the Directory (no choice) keeps the previous valid start and the destination', async () => {
    const onClose = jest.fn();
    const user = userEvent.setup();
    await mount(onClose);
    await choose({ purpose: 'start', place: gate13 });
    await user.press(changeStart());

    // Cancel leaves no choice behind: nothing changes.
    expect(useAppStore.getState().directoryChoice).toBeNull();
    expect(screen.getByText('Gate 13')).toBeOnTheScreen();
    expect(screen.getByText('Block 34')).toBeOnTheScreen();
    expect(onClose).not.toHaveBeenCalled();
    expect(onChangeDestination).not.toHaveBeenCalled();
  });

  test('a start choice never changes the destination', async () => {
    await mount();
    await choose({ purpose: 'start', place: gate13 });
    await choose({ purpose: 'start', quick: 'last_known' });

    expect(onChangeDestination).not.toHaveBeenCalled();
    expect(screen.getByText('Block 34')).toBeOnTheScreen();
  });

  test('needs_origin (no GPS fix) recovers through the same Directory start flow', async () => {
    useAppStore.setState({ currentLocation: null, currentLocationSource: 'live' });
    const user = userEvent.setup();
    await mount();

    await user.press(changeStart());

    expect(onOpenDirectory).toHaveBeenLastCalledWith('start');
    expectNoChooser();
  });

  test('needs_origin after a failed current-location pick shows the error and recovers through the Directory', async () => {
    jest.spyOn(LocationAccessService, 'resolveCurrentLocation').mockResolvedValue({
      ok: false,
      coordinate: null,
      message: 'Location unavailable. Tap Change Start to pick where you are.',
      permissionState: { granted: true, canAskAgain: true, status: 'granted', precision: 'fine' },
    } as never);
    const user = userEvent.setup();
    await mount();

    await choose({ purpose: 'start', quick: 'current_location' });
    // The failed pick leaves the sheet in needs_origin; it says so and offers no chooser of its own.
    await waitFor(() => expect(screen.getByText('Tap Change Start to continue.')).toBeOnTheScreen());
    expectNoChooser();

    await user.press(changeStart());
    expect(onOpenDirectory).toHaveBeenLastCalledWith('start');
  });
});

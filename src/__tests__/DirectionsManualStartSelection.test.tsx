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

describe('manual start selection (Get Directions sheet)', () => {
  const onOpenDirectory = jest.fn();
  const mount = () =>
    render(
      <>
        <LocationSheet mode="routePreview" destination={destination} onClose={jest.fn()} onOpenDirectory={onOpenDirectory} />
        <DirectionsSheetFooter animatedFooterPosition={{ value: 0, get: () => 0 } as never} />
      </>,
    );

  async function pickGate13(user: ReturnType<typeof userEvent.setup>) {
    await user.press(screen.getByText('Change Start'));
    await user.press(screen.getByText('Choose start manually'));
    expect(onOpenDirectory).toHaveBeenLastCalledWith('start');
    // What the Directory does when the visitor taps Gate 13.
    await act(async () => {
      useAppStore.getState().setDirectoryChoice({ purpose: 'start', place: gate13 });
    });
  }

  test('tapping Gate 13 closes the picker, shows it as the start, and reaches route ready', async () => {
    const user = userEvent.setup();
    await mount();
    await pickGate13(user);

    expect(screen.queryByText('Choose start manually')).not.toBeOnTheScreen();
    expect(useAppStore.getState().directoryChoice).toBeNull();
    expect(screen.getByText('Gate 13')).toBeOnTheScreen();
    expect(screen.getByText('Block 34')).toBeOnTheScreen();
    expect(screen.getByText('Change Start')).toBeOnTheScreen();
    await waitFor(() => expect(screen.getByText('Route ready')).toBeOnTheScreen(), { timeout: 5_000 });
  });

  test('Change Start reopens the picker intentionally after a manual selection', async () => {
    const user = userEvent.setup();
    await mount();
    await pickGate13(user);

    await user.press(screen.getByText('Change Start'));
    expect(screen.getByText('Choose start manually')).toBeOnTheScreen();
    expect(screen.getByText('Use my current location')).toBeOnTheScreen();
  });

  test('Back from the reopened picker returns to the summary and keeps Gate 13', async () => {
    const onClose = jest.fn();
    const user = userEvent.setup();
    await render(
      <LocationSheet mode="routePreview" destination={destination} onClose={onClose} onOpenDirectory={onOpenDirectory} />,
    );
    await pickGate13(user);
    await user.press(screen.getByText('Change Start'));

    await user.press(screen.getByRole('button', { name: /back/i }));

    expect(onClose).not.toHaveBeenCalled();
    expect(screen.queryByText('Choose start manually')).not.toBeOnTheScreen();
    expect(screen.getByText('Gate 13')).toBeOnTheScreen();
  });
});

// #222: with no chosen start there is nothing to pick between, so the start action goes straight to
// the Directory (purpose 'start') instead of the three-card chooser and its "Choose start manually" hop.
describe('no start chosen yet (Get Directions sheet)', () => {
  const onOpenDirectory = jest.fn();
  const onChangeDestination = jest.fn();
  const mount = () =>
    render(
      <>
        <LocationSheet
          mode="routePreview"
          destination={destination}
          onClose={jest.fn()}
          onOpenDirectory={onOpenDirectory}
          onChangeDestination={onChangeDestination}
        />
        <DirectionsSheetFooter animatedFooterPosition={{ value: 0, get: () => 0 } as never} />
      </>,
    );

  beforeEach(() => {
    useAppStore.setState({ currentLocation: null, currentLocationSource: null, lastKnownLocation: null });
  });

  test('Change Start opens the Directory for a start with no intermediate chooser', async () => {
    const user = userEvent.setup();
    await mount();

    await user.press(screen.getByText('Change Start'));

    expect(onOpenDirectory).toHaveBeenCalledTimes(1);
    expect(onOpenDirectory).toHaveBeenCalledWith('start');
    expect(screen.queryByText('Choose start manually')).not.toBeOnTheScreen();
    expect(screen.queryByText('Use my current location')).not.toBeOnTheScreen();
  });

  test('Gate 13 chosen in the Directory becomes the start; the destination is unchanged', async () => {
    const user = userEvent.setup();
    await mount();
    await user.press(screen.getByText('Change Start'));

    await act(async () => {
      useAppStore.getState().setDirectoryChoice({ purpose: 'start', place: gate13 });
    });

    expect(screen.getByText('Gate 13')).toBeOnTheScreen();
    expect(screen.getByText('Block 34')).toBeOnTheScreen();
    expect(onChangeDestination).not.toHaveBeenCalled();
    expect(useAppStore.getState().directoryChoice).toBeNull();
    await waitFor(() => expect(screen.getByText('Route ready')).toBeOnTheScreen(), { timeout: 5_000 });
  });

  test('leaving the Directory without a choice keeps the start unset and the action available', async () => {
    const user = userEvent.setup();
    await mount();
    await user.press(screen.getByText('Change Start'));

    expect(screen.getByText('Choose starting point')).toBeOnTheScreen();
    await user.press(screen.getByText('Change Start'));
    expect(onOpenDirectory).toHaveBeenCalledTimes(2);
  });
});

describe('start already chosen keeps its choices (Get Directions sheet)', () => {
  const onOpenDirectory = jest.fn();
  const mount = () =>
    render(<LocationSheet mode="routePreview" destination={destination} onClose={jest.fn()} onOpenDirectory={onOpenDirectory} />);

  test('GPS start: Change Start still offers current/last-known/manual, not the Directory', async () => {
    const user = userEvent.setup();
    await mount();

    await user.press(screen.getByText('Change Start'));

    expect(onOpenDirectory).not.toHaveBeenCalled();
    expect(screen.getByText('Use my current location')).toBeOnTheScreen();
    expect(screen.getByText('Choose start manually')).toBeOnTheScreen();
  });

  test('manual start: Change Start then Choose start manually opens the Directory; cancelling keeps Gate 13', async () => {
    const user = userEvent.setup();
    await mount();
    await user.press(screen.getByText('Change Start'));
    await user.press(screen.getByText('Choose start manually'));
    await act(async () => {
      useAppStore.getState().setDirectoryChoice({ purpose: 'start', place: gate13 });
    });
    onOpenDirectory.mockClear();

    await user.press(screen.getByText('Change Start'));
    await user.press(screen.getByText('Choose start manually'));
    expect(onOpenDirectory).toHaveBeenCalledWith('start');
    await user.press(screen.getByRole('button', { name: /back/i }));

    expect(screen.getByText('Gate 13')).toBeOnTheScreen();
  });
});

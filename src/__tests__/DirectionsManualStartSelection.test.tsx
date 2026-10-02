/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// #222 / #131 P0: picking a manual start (e.g. Gate 13) must close the picker and land on the
// route-ready state. Real viewmodel + real LocationSheet — the mocked-VM suites cannot see the
// source-driven `showManualStartSearch` that kept the picker open after a selection.

import React from 'react';
import type { Place } from '../models/types';
import { useAppStore } from '../store/useAppStore';
import { useDirectionsViewModel } from '../viewmodels/DirectionsViewModel';
import { LocationSheet } from '../views/components/map/LocationSheet';
import { DirectionsSheetFooter } from '../views/components/map/DirectionsSheetFooter';
import { SearchService } from '../services/SearchService';
import { act, render, renderHook, screen, userEvent, waitFor } from './test-utils';

jest.mock('../services/SearchService', () => ({
  SearchService: { search: jest.fn(() => []) },
}));

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
const PLACEHOLDER = 'Search start point: gate, rasta, block';

beforeEach(() => {
  process.env.EXPO_PUBLIC_USE_IJTEMA_V2_ROUTING = 'true';
  useAppStore.setState(initialStoreState, true);
  useAppStore.setState({
    currentLocation: { latitude: 24.9762, longitude: 67.011 },
    currentLocationSource: 'live',
  });
  (SearchService.search as jest.Mock).mockReturnValue([gate13]);
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
  const mount = () =>
    render(
      <>
        <LocationSheet mode="routePreview" destination={destination} onClose={jest.fn()} />
        <DirectionsSheetFooter animatedFooterPosition={{ value: 0, get: () => 0 } as never} />
      </>,
    );

  async function pickGate13(user: ReturnType<typeof userEvent.setup>) {
    await user.press(screen.getByText('Change Start'));
    await user.press(screen.getByText('Choose start manually'));
    await user.type(screen.getByPlaceholderText(PLACEHOLDER), 'Gate 13');
    await user.press(await screen.findByRole('button', { name: /^Gate 13, / }));
  }

  test('tapping Gate 13 closes the picker, shows it as the start, and reaches route ready', async () => {
    const user = userEvent.setup();
    await mount();
    await pickGate13(user);

    expect(screen.queryByPlaceholderText(PLACEHOLDER)).not.toBeOnTheScreen();
    expect(screen.queryByText('Choose start manually')).not.toBeOnTheScreen();
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
      <LocationSheet mode="routePreview" destination={destination} onClose={onClose} />,
    );
    await pickGate13(user);
    await user.press(screen.getByText('Change Start'));

    await user.press(screen.getByRole('button', { name: /back/i }));

    expect(onClose).not.toHaveBeenCalled();
    expect(screen.queryByText('Choose start manually')).not.toBeOnTheScreen();
    expect(screen.getByText('Gate 13')).toBeOnTheScreen();
  });
});

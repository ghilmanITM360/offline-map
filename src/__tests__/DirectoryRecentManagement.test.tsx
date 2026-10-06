/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Directory RECENT is manageable in place: a section-level Clear (with a confirm) and a visible per-row remove,
// so nobody has to find Settings. Rows still open their place on tap.

import React from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, render, screen } from './test-utils';

import { LocationsDirectoryScreen } from '../views/screens/LocationsDirectoryScreen';
import { useAppStore } from '../store/useAppStore';
import { PublicDestinationsService } from '../services/PublicDestinationsService';

jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  return { ...actual, useNavigation: jest.fn() };
});

const { useNavigation } = jest.requireMock('@react-navigation/native') as { useNavigation: jest.Mock };

const initialStoreState = useAppStore.getState();
const firstBlock = PublicDestinationsService.getByCategory('blocks')[0];
const firstGate = PublicDestinationsService.getByCategory('gates')[0];

type AlertButton = { text: string; onPress?: () => void };

beforeEach(() => {
  useAppStore.setState(initialStoreState, true);
  jest.clearAllMocks();
  useNavigation.mockReturnValue({ navigate: jest.fn(), goBack: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => false) });
});

const removeLabel = (name: string) => `Remove from recent: ${name}`;

describe('Directory Recent management', () => {
  test('Clear asks first, and Cancel keeps the list', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    useAppStore.setState({ recentSearches: [firstGate, firstBlock] });
    await render(<LocationsDirectoryScreen />);

    await act(async () => {
      fireEvent.press(await screen.findByRole('button', { name: 'Clear recent places' }));
    });

    expect(alert.mock.calls.at(-1)?.[0]).toBe('Clear recent places?');
    expect((alert.mock.calls.at(-1)?.[2] as AlertButton[]).map((b) => b.text)).toEqual(['Cancel', 'Clear']);
    expect(useAppStore.getState().recentSearches).toHaveLength(2);
    alert.mockRestore();
  });

  test('confirming Clear empties Recent only, and the section disappears', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    useAppStore.setState({ recentSearches: [firstGate, firstBlock], favorites: [{ placeId: firstBlock.id } as never] });
    await render(<LocationsDirectoryScreen />);

    await act(async () => {
      fireEvent.press(await screen.findByRole('button', { name: 'Clear recent places' }));
    });
    await act(async () => {
      (alert.mock.calls.at(-1)?.[2] as AlertButton[]).find((b) => b.text === 'Clear')!.onPress!();
    });

    expect(useAppStore.getState().recentSearches).toEqual([]);
    expect(useAppStore.getState().favorites).toHaveLength(1);
    expect(screen.queryByText('Recent')).not.toBeOnTheScreen();
    alert.mockRestore();
  });

  test('a visible row action removes just that place', async () => {
    useAppStore.setState({
      recentSearches: [firstGate, firstBlock],
      recentSearchTimes: { [firstGate.id]: Date.now(), [firstBlock.id]: Date.now() },
    });
    await render(<LocationsDirectoryScreen />);

    await act(async () => {
      fireEvent.press(await screen.findByRole('button', { name: removeLabel(firstGate.name) }));
    });

    expect(useAppStore.getState().recentSearches.map((p) => p.id)).toEqual([firstBlock.id]);
    expect(Object.keys(useAppStore.getState().recentSearchTimes)).toEqual([firstBlock.id]);
    expect(screen.queryByRole('button', { name: removeLabel(firstGate.name) })).not.toBeOnTheScreen();
    expect(screen.getByRole('button', { name: removeLabel(firstBlock.name) })).toBeOnTheScreen();
  });

  test('removing the last place removes the whole section, Clear included', async () => {
    useAppStore.setState({ recentSearches: [firstGate] });
    await render(<LocationsDirectoryScreen />);

    await act(async () => {
      fireEvent.press(await screen.findByRole('button', { name: removeLabel(firstGate.name) }));
    });

    expect(screen.queryByText('Recent')).not.toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Clear recent places' })).not.toBeOnTheScreen();
  });

  test('the remove action is also there while choosing a journey start, where Details is hidden', async () => {
    useAppStore.setState({ recentSearches: [firstGate], directoryPurpose: 'start' });
    await render(<LocationsDirectoryScreen />);

    expect(await screen.findByRole('button', { name: removeLabel(firstGate.name) })).toBeOnTheScreen();
  });
});

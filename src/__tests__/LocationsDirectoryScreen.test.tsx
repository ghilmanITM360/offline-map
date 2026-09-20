/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { DeviceEventEmitter } from 'react-native';
import { act, fireEvent, render, screen } from './test-utils';

import { LocationsDirectoryScreen } from '../views/screens/LocationsDirectoryScreen';
import { useAppStore } from '../store/useAppStore';
import { PublicDestinationsService } from '../services/PublicDestinationsService';

jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  return {
    ...actual,
    useNavigation: jest.fn(),
  };
});

const { useNavigation } = jest.requireMock('@react-navigation/native') as { useNavigation: jest.Mock };

const initialStoreState = useAppStore.getState();
const firstBlock = PublicDestinationsService.getByCategory('blocks')[0];
const firstGate = PublicDestinationsService.getByCategory('gates')[0];

function mockNav(overrides: Partial<{ canGoBack: boolean }> = {}) {
  const navigation = {
    navigate: jest.fn(),
    goBack: jest.fn(),
    replace: jest.fn(),
    canGoBack: jest.fn(() => overrides.canGoBack ?? false),
  };
  useNavigation.mockReturnValue(navigation);
  return navigation;
}

beforeEach(() => {
  useAppStore.setState(initialStoreState, true);
  jest.clearAllMocks();
});

describe('LocationsDirectoryScreen — browsing', () => {
  test('lists every public category as its own section', async () => {
    mockNav();
    await render(<LocationsDirectoryScreen />);

    expect(await screen.findByText(/^Blocks \(\d+\)$/)).toBeOnTheScreen();
    expect(screen.getByText(/^Gates \(\d+\)$/)).toBeOnTheScreen();
    expect(screen.getByText(/^Rastas \(\d+\)$/)).toBeOnTheScreen();
    expect(screen.getByText(/^Shahr-e-Pindal \(\d+\)$/)).toBeOnTheScreen();
  });

  test('a category chip narrows browsing to just that category', async () => {
    mockNav();
    await render(<LocationsDirectoryScreen />);

    await act(async () => {
      fireEvent.press(screen.getByLabelText('Gates'));
    });

    expect(screen.getByText(/^Gates \(\d+\)$/)).toBeOnTheScreen();
    expect(screen.queryByText(/^Blocks \(\d+\)$/)).not.toBeOnTheScreen();
    expect(screen.queryByText(/^Rastas \(\d+\)$/)).not.toBeOnTheScreen();
  });
});

describe('LocationsDirectoryScreen — search', () => {
  test('typing a query filters to matching destinations only', async () => {
    mockNav();
    await render(<LocationsDirectoryScreen />);

    await act(async () => {
      fireEvent.changeText(screen.getByPlaceholderText('Search blocks, gates, rastas...'), '24');
    });

    expect(await screen.findByLabelText('Block 24, Block')).toBeOnTheScreen();
    expect(screen.queryByLabelText(new RegExp(`^${firstGate.name}, Gate$`))).not.toBeOnTheScreen();
  });

  test('shows an empty state for a query with no matches', async () => {
    mockNav();
    await render(<LocationsDirectoryScreen />);

    await act(async () => {
      fireEvent.changeText(screen.getByPlaceholderText('Search blocks, gates, rastas...'), 'zzz-not-a-real-place');
    });

    expect(await screen.findByText('No matches for "zzz-not-a-real-place"')).toBeOnTheScreen();
  });

  test('the clear button resets the search query', async () => {
    mockNav();
    await render(<LocationsDirectoryScreen />);

    const input = screen.getByPlaceholderText('Search blocks, gates, rastas...');
    await act(async () => fireEvent.changeText(input, '24'));
    expect(await screen.findByLabelText('Clear search')).toBeOnTheScreen();

    await act(async () => fireEvent.press(screen.getByLabelText('Clear search')));

    expect(screen.getByText(/^Blocks \(\d+\)$/)).toBeOnTheScreen();
  });
});

describe('LocationsDirectoryScreen — selection hands off to the existing map pipeline', () => {
  test('selecting a block at initial launch (nothing to go back to) replaces onto Main and stages the destination', async () => {
    const navigation = mockNav({ canGoBack: false });
    await render(<LocationsDirectoryScreen />);

    await act(async () => {
      fireEvent.press(screen.getByLabelText(`${firstBlock.name}, Block`));
    });

    expect(useAppStore.getState().pendingDirectorySelection).toEqual(firstBlock);
    expect(navigation.replace).toHaveBeenCalledWith('Main');
    expect(navigation.goBack).not.toHaveBeenCalled();
    // Selecting a destination stages it for HomeViewModel's existing pipeline — it must
    // never itself start navigation or set a route.
    expect(useAppStore.getState().isNavigating).toBe(false);
    expect(useAppStore.getState().activeRoute).toBeNull();
  });

  test('selecting a gate reopened from the map (can go back) pops back instead of replacing', async () => {
    const navigation = mockNav({ canGoBack: true });
    await render(<LocationsDirectoryScreen />);

    await act(async () => {
      fireEvent.press(screen.getByLabelText(`${firstGate.name}, Gate`));
    });

    expect(useAppStore.getState().pendingDirectorySelection).toEqual(firstGate);
    expect(navigation.goBack).toHaveBeenCalledTimes(1);
    expect(navigation.replace).not.toHaveBeenCalled();
  });

  test('"View map" navigates without staging any destination', async () => {
    const navigation = mockNav({ canGoBack: false });
    await render(<LocationsDirectoryScreen />);

    await act(async () => {
      fireEvent.press(screen.getByLabelText('View map'));
    });

    expect(navigation.replace).toHaveBeenCalledWith('Main');
    expect(useAppStore.getState().pendingDirectorySelection).toBeNull();
  });
});

describe('LocationsDirectoryScreen — touch targets (Android 48dp minimum)', () => {
  test('the View map control meets the 48dp minimum touch target', async () => {
    mockNav();
    await render(<LocationsDirectoryScreen />);

    expect(screen.getByLabelText('View map')).toHaveStyle({ minHeight: 48 });
  });

  test('category chips meet the 48dp minimum touch target', async () => {
    mockNav();
    await render(<LocationsDirectoryScreen />);

    expect(screen.getByLabelText('Gates')).toHaveStyle({ minHeight: 48 });
  });
});

describe('LocationsDirectoryScreen — Android hardware back', () => {
  test('clears an active search/category filter before falling through to default back behavior', async () => {
    mockNav();
    await render(<LocationsDirectoryScreen />);

    await act(async () => {
      fireEvent.changeText(screen.getByPlaceholderText('Search blocks, gates, rastas...'), '24');
    });
    expect(await screen.findByLabelText('Block 24, Block')).toBeOnTheScreen();

    await act(async () => {
      DeviceEventEmitter.emit('hardwareBackPress');
    });

    expect(screen.getByPlaceholderText('Search blocks, gates, rastas...').props.value).toBe('');
    expect(await screen.findByText(/^Blocks \(\d+\)$/)).toBeOnTheScreen();
  });
});

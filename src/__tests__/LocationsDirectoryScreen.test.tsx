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

  test('#154: section titles carry heading-level accessibility semantics', async () => {
    mockNav();
    await render(<LocationsDirectoryScreen />);

    expect(await screen.findByRole('header', { name: /^Blocks \(\d+\)$/ })).toBeOnTheScreen();
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
  test('#154: an Urdu-script query matches a destination by its Urdu name', async () => {
    mockNav();
    await render(<LocationsDirectoryScreen />);

    await act(async () => {
      fireEvent.changeText(screen.getByPlaceholderText(/Search/i), firstGate.urduName as string);
    });

    expect(screen.getByText(firstGate.name)).toBeOnTheScreen();
  });

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

describe('LocationsDirectoryScreen — recent destinations (#99)', () => {
  test('RECENT-01: no recent selections means no Recent section', async () => {
    mockNav();
    await render(<LocationsDirectoryScreen />);

    expect(screen.queryByText('Recent')).not.toBeOnTheScreen();
  });

  test('RECENT-02/03: recent selections render newest-first under a Recent section', async () => {
    mockNav();
    useAppStore.setState({ recentSearches: [firstGate, firstBlock] });
    await render(<LocationsDirectoryScreen />);

    expect(await screen.findByText('Recent')).toBeOnTheScreen();
    // Both places also appear again in their normal category sections further down the
    // screen, so the Recent section's own two rows must be the first two matches in
    // document order — and firstGate (pushed most recently) must lead firstBlock.
    const matches = screen.getAllByLabelText(
      new RegExp(`^(${firstGate.name}, Gate|${firstBlock.name}, Block)$`),
    );
    expect(matches[0]).toHaveAccessibleName(`${firstGate.name}, Gate`);
    expect(matches[1]).toHaveAccessibleName(`${firstBlock.name}, Block`);
  });

  test('RECENT-05/06: tapping a recent destination uses the normal selection hand-off', async () => {
    const navigation = mockNav({ canGoBack: true });
    useAppStore.setState({ recentSearches: [firstBlock] });
    await render(<LocationsDirectoryScreen />);

    await act(async () => {
      fireEvent.press(screen.getAllByLabelText(`${firstBlock.name}, Block`)[0]);
    });

    expect(useAppStore.getState().pendingDirectorySelection).toEqual(firstBlock);
    expect(navigation.goBack).toHaveBeenCalledTimes(1);
  });

  test('RECENT-07: a recent destination that is currently non-routable stays visible and disabled per #96', async () => {
    mockNav();
    useAppStore.setState({ recentSearches: [firstGate, firstBlock] });
    const blockedGate = PublicDestinationsService.search('Gate 18')[0];
    useAppStore.setState({ recentSearches: [blockedGate] });
    await render(<LocationsDirectoryScreen />);

    const row = await screen.findByLabelText(`${blockedGate.name}, Gate, navigation unavailable`);
    expect(row.props.accessibilityState?.disabled).toBe(true);
  });

  test('RECENT-08: a stale recent id no longer resolvable in current data is omitted safely', async () => {
    mockNav();
    useAppStore.setState({ recentSearches: [{ ...firstBlock, id: 'stale-nonexistent-id' }] });
    await render(<LocationsDirectoryScreen />);

    expect(screen.queryByText('Recent')).not.toBeOnTheScreen();
  });

  test('RECENT-11: search still filters normally with recent selections present', async () => {
    mockNav();
    useAppStore.setState({ recentSearches: [firstGate] });
    await render(<LocationsDirectoryScreen />);

    await act(async () => {
      fireEvent.changeText(screen.getByPlaceholderText('Search blocks, gates, rastas...'), '24');
    });

    expect(await screen.findByLabelText('Block 24, Block')).toBeOnTheScreen();
    expect(screen.queryByText('Recent')).not.toBeOnTheScreen();
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

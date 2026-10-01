/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { DeviceEventEmitter, StyleSheet } from 'react-native';
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

  test('#128: the search placeholder is one short line, matching the field name, so it cannot wrap at 200% font', async () => {
    // The old 31-character hint "Search blocks, gates, rastas..." wrapped to two lines at 200% system font on a
    // 411 dp window, and the second line was clipped by the fixed-height field. Home's search says the same words.
    mockNav();
    await render(<LocationsDirectoryScreen />);

    const field = screen.getByLabelText('Search destinations');
    expect(field.props.placeholder).toBe('Search destinations');
    expect(field.props.placeholder.length).toBeLessThanOrEqual(20);
    // No room reserved for the clear button while it is not shown.
    expect(StyleSheet.flatten(field.props.style).paddingRight).toBe(16);
  });

  test('typing a query filters to matching destinations only', async () => {
    mockNav();
    await render(<LocationsDirectoryScreen />);

    await act(async () => {
      fireEvent.changeText(screen.getByPlaceholderText('Search destinations'), '24');
    });

    expect(await screen.findByLabelText('Block 24, Block')).toBeOnTheScreen();
    expect(screen.queryByLabelText(new RegExp(`^${firstGate.name}, Gate$`))).not.toBeOnTheScreen();
  });

  test('shows an empty state for a query with no matches', async () => {
    mockNav();
    await render(<LocationsDirectoryScreen />);

    await act(async () => {
      fireEvent.changeText(screen.getByPlaceholderText('Search destinations'), 'zzz-not-a-real-place');
    });

    expect(await screen.findByText('No matches for "zzz-not-a-real-place"')).toBeOnTheScreen();
  });

  test('#128: the no-matches message is a polite live region so a screen reader hears it after typing', async () => {
    mockNav();
    await render(<LocationsDirectoryScreen />);

    await act(async () => {
      fireEvent.changeText(screen.getByLabelText('Search destinations'), 'zzz-not-a-real-place');
    });

    const message = await screen.findByText('No matches for "zzz-not-a-real-place"');
    expect(message.parent?.props.accessibilityLiveRegion).toBe('polite');
  });

  test('the clear button resets the search query', async () => {
    mockNav();
    await render(<LocationsDirectoryScreen />);

    const input = screen.getByPlaceholderText('Search destinations');
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

  test('RECENT-07: a recent destination that is currently non-routable stays visible, labelled unavailable, and not a11y-disabled per #96', async () => {
    mockNav();
    useAppStore.setState({ recentSearches: [firstGate, firstBlock] });
    const blockedGate = PublicDestinationsService.search('Gate 18')[0];
    useAppStore.setState({ recentSearches: [blockedGate] });
    await render(<LocationsDirectoryScreen />);

    // #146: this gate now also renders in its own "Gates" browse section (consistent with
    // search), in addition to Recent — so both instances must exist; neither claims disabled (rows still open).
    const rows = await screen.findAllByLabelText(`${blockedGate.name}, Gate, navigation unavailable`);
    expect(rows.length).toBeGreaterThanOrEqual(2);
    rows.forEach((row) => expect(row.props.accessibilityState?.disabled).not.toBe(true));
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
      fireEvent.changeText(screen.getByPlaceholderText('Search destinations'), '24');
    });

    expect(await screen.findByLabelText('Block 24, Block')).toBeOnTheScreen();
    expect(screen.queryByText('Recent')).not.toBeOnTheScreen();
  });
});

describe('LocationsDirectoryScreen — category chips (#128)', () => {
  test('the chip row keeps its full height instead of shrinking under the results list', async () => {
    mockNav();
    await render(<LocationsDirectoryScreen />);

    // Both ScrollViews share one column. The horizontal one has a default flexShrink of 1, so when the
    // results list overflows Yoga shrinks it and clips the 48dp chips to ~36dp (seen on the API 36 emulator).
    let node: any = screen.getByRole('button', { name: 'Blocks' });
    while (node && !node.props.horizontal) node = node.parent;
    expect(node).toBeTruthy();
    expect(StyleSheet.flatten(node.props.style).flexShrink).toBe(0);
  });
});

describe('LocationsDirectoryScreen — Android hardware back', () => {
  test('clears an active search/category filter before falling through to default back behavior', async () => {
    mockNav();
    await render(<LocationsDirectoryScreen />);

    await act(async () => {
      fireEvent.changeText(screen.getByPlaceholderText('Search destinations'), '24');
    });
    expect(await screen.findByLabelText('Block 24, Block')).toBeOnTheScreen();

    await act(async () => {
      DeviceEventEmitter.emit('hardwareBackPress');
    });

    expect(screen.getByPlaceholderText('Search destinations').props.value).toBe('');
    expect(await screen.findByText(/^Blocks \(\d+\)$/)).toBeOnTheScreen();
  });
});

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// #139 Option B, UI slice: the Directory tells the user their last navigation did not finish and
// offers a fresh route. Real store behaviour throughout; only navigation is mocked. The notice
// never resumes the old journey - "Get new route" hands the destination to the normal selection flow.

import React from 'react';
import { act, fireEvent, render, screen } from './test-utils';

import { LocationsDirectoryScreen } from '../views/screens/LocationsDirectoryScreen';
import { selectUnfinishedJourney, useAppStore } from '../store/useAppStore';
import { createUnfinishedJourney } from '../utils/unfinishedJourney';
import { PublicDestinationsService } from '../services/PublicDestinationsService';

jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  return { ...actual, useNavigation: jest.fn() };
});

const { useNavigation } = jest.requireMock('@react-navigation/native') as { useNavigation: jest.Mock };

const initialStoreState = useAppStore.getState();
const firstBlock = PublicDestinationsService.getByCategory('blocks')[0];

const TITLE = "Your last navigation didn't finish";
const BODY_KNOWN = `You were heading to ${firstBlock.name}. Want a new route from where you are now?`;
const BODY_FALLBACK = "Your last navigation didn't finish. Want a new route from where you are now?";

function mockNav(canGoBack = false) {
  const navigation = {
    navigate: jest.fn(),
    goBack: jest.fn(),
    replace: jest.fn(),
    canGoBack: jest.fn(() => canGoBack),
  };
  useNavigation.mockReturnValue(navigation);
  return navigation;
}

function seedMarker(destinationId: string) {
  useAppStore.setState({ unfinishedJourney: createUnfinishedJourney(destinationId, Date.now()) });
}

beforeEach(() => {
  useAppStore.setState(initialStoreState, true);
  jest.clearAllMocks();
});

describe('#139 recovery notice - visibility', () => {
  test('no marker: no notice and the Directory is unchanged', async () => {
    mockNav();
    await render(<LocationsDirectoryScreen />);

    expect(screen.queryByText(TITLE)).not.toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Get new route' })).not.toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Dismiss' })).not.toBeOnTheScreen();
    expect(await screen.findByText(/^Blocks \(\d+\)$/)).toBeOnTheScreen();
  });

  test('marker with a known destination: title and destination body are shown', async () => {
    seedMarker(firstBlock.id);
    mockNav();
    await render(<LocationsDirectoryScreen />);

    expect(screen.getByText(TITLE)).toBeOnTheScreen();
    expect(screen.getByText(BODY_KNOWN)).toBeOnTheScreen();
  });

  test('marker with an unknown destination: generic copy, never the raw id', async () => {
    seedMarker('ZZ_UNKNOWN_DESTINATION_999');
    mockNav();
    await render(<LocationsDirectoryScreen />);

    expect(screen.getByText(TITLE)).toBeOnTheScreen();
    expect(screen.getByText(BODY_FALLBACK)).toBeOnTheScreen();
    expect(screen.queryByText(/ZZ_UNKNOWN_DESTINATION_999/)).not.toBeOnTheScreen();
  });

  test('an expired marker is not shown', async () => {
    useAppStore.setState({
      unfinishedJourney: createUnfinishedJourney(firstBlock.id, Date.now() - 2 * 60 * 60 * 1000 - 1),
    });
    mockNav();
    await render(<LocationsDirectoryScreen />);

    expect(screen.queryByText(TITLE)).not.toBeOnTheScreen();
  });

  test('while the Directory is choosing a start or destination the notice stays out of the way', async () => {
    seedMarker(firstBlock.id);
    useAppStore.setState({ directoryPurpose: 'destination' });
    mockNav();
    await render(<LocationsDirectoryScreen />);

    expect(screen.queryByText(TITLE)).not.toBeOnTheScreen();
  });
});

describe('#139 recovery notice - actions', () => {
  test('Get new route plans the journey like a destination tap: live from the user\'s location, never resuming the old one', async () => {
    seedMarker(firstBlock.id);
    const navigation = mockNav(true);
    useAppStore.setState({ hasLocationPermission: true, locationPermissionPrecision: 'fine' });
    const realBeginRecovery = useAppStore.getState().beginRecovery;
    const beginRecovery = jest.fn(realBeginRecovery);
    useAppStore.setState({ beginRecovery });
    await render(<LocationsDirectoryScreen />);

    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Get new route' }));
    });

    expect(beginRecovery).toHaveBeenCalledTimes(1);
    expect(navigation.goBack).toHaveBeenCalledTimes(1);
    const state = useAppStore.getState();
    expect(state.pendingJourney).toMatchObject({ destination: { id: firstBlock.id } });
    expect(state.pendingDirectorySelection).toBeNull();
    expect(state.isNavigating).toBe(false);
    expect(state.activeRoute).toBeNull();
    expect(state.unfinishedJourney).toBeNull();
  });

  test('Get new route with no location opens destination preview without guessing a start', async () => {
    seedMarker(firstBlock.id);
    const navigation = mockNav(true);
    useAppStore.setState({ hasLocationPermission: false });
    await render(<LocationsDirectoryScreen />);

    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Get new route' }));
    });

    expect(useAppStore.getState().pendingJourney).toEqual({ destination: firstBlock });
    expect(navigation.goBack).toHaveBeenCalledTimes(1);
    expect(useAppStore.getState().unfinishedJourney).toBeNull();
  });

  test('Get new route with an unresolvable destination still opens the map without a selection', async () => {
    seedMarker('ZZ_UNKNOWN_DESTINATION_999');
    const navigation = mockNav(true);
    await render(<LocationsDirectoryScreen />);

    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Get new route' }));
    });

    expect(navigation.goBack).toHaveBeenCalledTimes(1);
    expect(useAppStore.getState().pendingDirectorySelection).toBeNull();
    expect(useAppStore.getState().unfinishedJourney).toBeNull();
  });

  test('Dismiss clears the marker, does not navigate, and the notice disappears', async () => {
    seedMarker(firstBlock.id);
    const navigation = mockNav(true);
    const clearUnfinishedJourney = jest.fn(useAppStore.getState().clearUnfinishedJourney);
    useAppStore.setState({ clearUnfinishedJourney });
    await render(<LocationsDirectoryScreen />);

    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Dismiss' }));
    });

    expect(clearUnfinishedJourney).toHaveBeenCalledTimes(1);
    expect(selectUnfinishedJourney(useAppStore.getState())).toBeNull();
    expect(navigation.goBack).not.toHaveBeenCalled();
    expect(navigation.replace).not.toHaveBeenCalled();
    expect(useAppStore.getState().pendingDirectorySelection).toBeNull();
    expect(screen.queryByText(TITLE)).not.toBeOnTheScreen();
  });

  test('the notice disappears when the marker is cleared elsewhere', async () => {
    seedMarker(firstBlock.id);
    mockNav();
    await render(<LocationsDirectoryScreen />);
    expect(screen.getByText(TITLE)).toBeOnTheScreen();

    await act(async () => {
      useAppStore.getState().clearUnfinishedJourney();
    });

    expect(screen.queryByText(TITLE)).not.toBeOnTheScreen();
  });

  test('there is no Resume action', async () => {
    seedMarker(firstBlock.id);
    mockNav();
    await render(<LocationsDirectoryScreen />);

    expect(screen.queryByText(/resume/i)).not.toBeOnTheScreen();
    expect(screen.queryByLabelText(/resume/i)).not.toBeOnTheScreen();
  });

  test('a normal destination tap opens preview while the recovery notice is showing', async () => {
    seedMarker('ZZ_UNKNOWN_DESTINATION_999');
    const navigation = mockNav(true);
    await render(<LocationsDirectoryScreen />);

    await act(async () => {
      fireEvent.changeText(screen.getByPlaceholderText('Search destinations'), '24');
    });
    await act(async () => {
      fireEvent.press(await screen.findByLabelText('Block 24, Block'));
    });

    expect(useAppStore.getState().pendingJourney?.destination.id).toBe('B24');
    expect(navigation.goBack).toHaveBeenCalledTimes(1);
  });
});

describe('#139 recovery notice - accessibility', () => {
  test('both actions are buttons with their visible names; the card is a polite live region', async () => {
    seedMarker(firstBlock.id);
    mockNav();
    await render(<LocationsDirectoryScreen />);

    expect(screen.getByRole('button', { name: 'Get new route' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Dismiss' })).toBeOnTheScreen();
    let node = screen.getByText(TITLE).parent;
    while (node && !node.props.accessibilityLiveRegion) node = node.parent;
    expect(node?.props.accessibilityLiveRegion).toBe('polite');
  });

  test('actions meet the 48 dp minimum touch target', async () => {
    seedMarker(firstBlock.id);
    mockNav();
    await render(<LocationsDirectoryScreen />);

    for (const name of ['Get new route', 'Dismiss']) {
      const flat = Object.assign({}, ...[screen.getByRole('button', { name }).props.style].flat(2).filter(Boolean));
      expect(flat.minHeight).toBeGreaterThanOrEqual(48);
    }
  });
});

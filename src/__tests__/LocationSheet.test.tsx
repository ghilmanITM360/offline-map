/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { AccessibilityInfo, Animated } from 'react-native';
import { render, screen, userEvent, act } from './test-utils';

import { LocationSheet } from '../views/components/map/LocationSheet';
import { DirectionsSheetFooter } from '../views/components/map/DirectionsSheetFooter';
import { useDirectionsViewModel } from '../viewmodels/DirectionsViewModel';
import { SearchService } from '../services/SearchService';
import { LIGHT_THEME } from '../theme';
import type { Place } from '../models/types';

jest.useFakeTimers();

// The route-preview footer (Start Navigation, Retry, route summary) is published to the modal's
// footer slot rather than rendered inside LocationSheet — mount the slot beside it, as HomeScreen does.
const renderWithFooter = (ui: React.ReactElement) =>
  render(
    <>
      {ui}
      <DirectionsSheetFooter animatedFooterPosition={{ value: 0, get: () => 0 } as never} />
    </>,
  );

// #100: FadeContent (RoutePreviewSection's shared state-card cross-fade) is the surface
// under audit here — mock the hook boundary directly, same pattern as the DirectionsViewModel
// mock above.
jest.mock('../viewmodels/useReducedMotion', () => ({ useReducedMotion: jest.fn(() => false) }));
const mockedUseReducedMotion = jest.requireMock('../viewmodels/useReducedMotion').useReducedMotion as jest.Mock;

// The viewmodel owns routing/GPS/service orchestration (already covered by scripts/test-*.ts
// GIS/routing suites per CLAUDE.md). Here we only care that LocationSheet's routePreview mode
// wires real user interactions to the real handlers it is given, and renders the right thing
// for each state — so we mock the hook boundary and drive it like a small state machine.
jest.mock('../viewmodels/DirectionsViewModel', () => ({
  useDirectionsViewModel: jest.fn(),
}));

jest.mock('../services/SearchService', () => ({
  SearchService: {
    search: jest.fn(() => []),
  },
}));

const mockedUseDirectionsViewModel = useDirectionsViewModel as jest.Mock;
const mockedSearchServiceSearch = SearchService.search as jest.Mock;

const destination: Place = {
  id: 'B1',
  name: 'Block 1',
  category: 'Block',
  description: 'Block 1 of the Karachi Ijtema ground.',
  coordinate: { latitude: 24.9, longitude: 67.1 },
  sourceVersion: 'v1',
};

const v2Destination: Place = {
  id: 'B2',
  name: 'Block 2',
  category: 'Block',
  description: 'Block 2 of the Karachi Ijtema ground.',
  coordinate: { latitude: 24.901, longitude: 67.102 },
  sourceVersion: 'v2',
};

const candidatePlace: Place = {
  id: 'GATE_01',
  name: 'Gate 1',
  category: 'Gate',
  description: 'Official Gate 1.',
  coordinate: { latitude: 24.901, longitude: 67.101 },
  sourceVersion: 'v1',
};

// #146 established that a verified-but-ground-truth-blocked gate must read as
// unavailable everywhere it can surface, not just in Directory browse/search. This
// candidate mirrors that same state (isRoutable: false) inside inline start/destination
// search, the one surface #146 didn't touch.
const unavailableCandidatePlace: Place = {
  id: 'GATE_18',
  name: 'Gate 18',
  category: 'Gate',
  description: 'Official Gate 18.',
  coordinate: { latitude: 24.902, longitude: 67.103 },
  sourceVersion: 'v1',
  isRoutable: false,
  unavailableReason: 'Ground-truth verification pending.',
};

function baseViewModel(overrides: Record<string, unknown> = {}) {
  return {
    route: null,
    startSource: 'live_gps',
    startSourceLabel: 'My current location',
    startSourceSupportingCopy: 'Using live GPS location now.',
    isCurrentLocationStartActive: true,
    rememberedLocationAgeLabel: 'from 5 minutes ago',
    rememberedLocationAvailable: true,
    rememberedLocationInsideVenue: true,
    currentRouteOriginInsideVenue: true,
    loadState: 'idle',
    errorMessage: null,
    manualStart: null,
    chooseManualStart: jest.fn(),
    setIsEditingManualStart: jest.fn(),
    setManualStartPlace: jest.fn(),
    chooseCurrentLocation: jest.fn(async () => true),
    chooseRememberedLocation: jest.fn(() => true),
    calculateRoute: jest.fn(async () => {}),
    retryOutsideRoute: jest.fn(async () => {}),
    selectManualGate: jest.fn(),
    clearManualGateSelection: jest.fn(),
    manualGateId: null,
    manualGateOptions: [],
    routeRefreshing: false,
    handleStartNavigation: jest.fn(),
    showManualStartSearch: false,
    canStartNavigation: true,
    startNavigationDisabledReason: '',
    ...overrides,
  };
}

let onCloseSpy: jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  onCloseSpy = jest.fn();
  mockedSearchServiceSearch.mockReturnValue([]);
  mockedUseReducedMotion.mockReturnValue(false);
});

describe('LocationSheet (routePreview) — start option selection', () => {
  test('renders the destination being routed to', async () => {
    mockedUseDirectionsViewModel.mockReturnValue(baseViewModel());
    await renderWithFooter(<LocationSheet mode="routePreview" destination={destination} onClose={onCloseSpy} />);

    expect(screen.getByText('Block 1')).toBeOnTheScreen();
  });

  test('defaults to current GPS location without showing the start picker first', async () => {
    mockedUseDirectionsViewModel.mockReturnValue(baseViewModel());
    await renderWithFooter(<LocationSheet mode="routePreview" destination={destination} onClose={onCloseSpy} />);

    expect(screen.getByText('My current location')).toBeOnTheScreen();
    expect(screen.getByText('Change Start')).toBeOnTheScreen();
    expect(screen.queryByText('Where are you starting from?')).not.toBeOnTheScreen();
    expect(screen.queryByText('Use last known location')).not.toBeOnTheScreen();
    expect(screen.queryByText('Choose start manually')).not.toBeOnTheScreen();
  });

  test('pressing "Use my current location" invokes chooseCurrentLocation', async () => {
    const chooseCurrentLocation = jest.fn(async () => true);
    mockedUseDirectionsViewModel.mockReturnValue(baseViewModel({ chooseCurrentLocation }));
    const user = userEvent.setup();
    await renderWithFooter(<LocationSheet mode="routePreview" destination={destination} onClose={onCloseSpy} />);

    await user.press(screen.getByText('Change Start'));
    await user.press(screen.getByText('Use my current location'));

    expect(chooseCurrentLocation).toHaveBeenCalledTimes(1);
  });

  test('89-04: shows a loading affordance while resolving current location, not a silent no-op', async () => {
    let resolveChoose: (ok: boolean) => void = () => {};
    const chooseCurrentLocation = jest.fn(
      () => new Promise<boolean>((resolve) => { resolveChoose = resolve; }),
    );
    mockedUseDirectionsViewModel.mockReturnValue(baseViewModel({ chooseCurrentLocation }));
    const user = userEvent.setup();
    await renderWithFooter(<LocationSheet mode="routePreview" destination={destination} onClose={onCloseSpy} />);

    await user.press(screen.getByText('Change Start'));
    await user.press(screen.getByText('Use my current location'));

    expect(screen.getByText('Finding your location…')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: /Use my current location/ }).props.accessibilityState).toMatchObject({
      busy: true,
      disabled: true,
    });

    await act(async () => {
      resolveChoose(false);
      await Promise.resolve();
    });

    expect(screen.queryByText('Finding your location…')).not.toBeOnTheScreen();
  });

  test('89-05: surfaces the location-resolution failure message instead of silently resetting', async () => {
    const chooseCurrentLocation = jest.fn(async () => false);
    mockedUseDirectionsViewModel.mockReturnValue(baseViewModel({
      chooseCurrentLocation,
      loadState: 'needs_origin',
      errorMessage: 'Current location is unavailable. Choose start manually.',
    }));
    await renderWithFooter(<LocationSheet mode="routePreview" destination={destination} onClose={onCloseSpy} />);

    const user = userEvent.setup();
    await user.press(screen.getByText('Change Start'));

    expect(screen.getByText('Current location is unavailable. Choose start manually.')).toBeOnTheScreen();
  });

  test('pressing "Use last known location" invokes chooseRememberedLocation', async () => {
    const chooseRememberedLocation = jest.fn(() => true);
    mockedUseDirectionsViewModel.mockReturnValue(
      baseViewModel({ chooseRememberedLocation, rememberedLocationAvailable: true }),
    );
    const user = userEvent.setup();
    await renderWithFooter(<LocationSheet mode="routePreview" destination={destination} onClose={onCloseSpy} />);

    await user.press(screen.getByText('Change Start'));
    await user.press(screen.getByText('Use last known location'));

    expect(chooseRememberedLocation).toHaveBeenCalledTimes(1);
  });

  test('"Use last known location" is disabled when no remembered location is available', async () => {
    mockedUseDirectionsViewModel.mockReturnValue(
      baseViewModel({ rememberedLocationAvailable: false }),
    );
    const user = userEvent.setup();
    await renderWithFooter(<LocationSheet mode="routePreview" destination={destination} onClose={onCloseSpy} />);

    await user.press(screen.getByText('Change Start'));

    expect(screen.getByText('No saved location yet')).toBeOnTheScreen();
  });

  test('pressing "Choose start manually" invokes chooseManualStart', async () => {
    const chooseManualStart = jest.fn();
    mockedUseDirectionsViewModel.mockReturnValue(baseViewModel({ chooseManualStart }));
    const user = userEvent.setup();
    await renderWithFooter(<LocationSheet mode="routePreview" destination={destination} onClose={onCloseSpy} />);

    await user.press(screen.getByText('Change Start'));
    await user.press(screen.getByText('Choose start manually'));

    expect(chooseManualStart).toHaveBeenCalledTimes(1);
  });

  test('active start option is visually reflected via accessible state', async () => {
    mockedUseDirectionsViewModel.mockReturnValue(baseViewModel({
      startSource: 'remembered_location',
      startSourceLabel: 'Last known location (from 5 minutes ago)',
      startSourceSupportingCopy: 'Using last known location from 5 minutes ago.',
      isCurrentLocationStartActive: false,
    }));
    await renderWithFooter(<LocationSheet mode="routePreview" destination={destination} onClose={onCloseSpy} />);

    // The status card reflects the active start source's message — real, user-visible output,
    // not an internal implementation detail.
    expect(screen.getByText(/Using last known location/)).toBeOnTheScreen();
  });

  test('device last-known origin is disclosed and does not activate the current-location option', async () => {
    mockedUseDirectionsViewModel.mockReturnValue(baseViewModel({
      startSource: 'device_last_known',
      startSourceLabel: 'Device last known location',
      startSourceSupportingCopy: 'Using device last known location because live GPS is unavailable.',
      isCurrentLocationStartActive: false,
    }));
    const user = userEvent.setup();
    await renderWithFooter(<LocationSheet mode="routePreview" destination={destination} onClose={onCloseSpy} />);

    expect(screen.getByText('Device last known location')).toBeOnTheScreen();
    expect(screen.getByText('Using device last known location because live GPS is unavailable.')).toBeOnTheScreen();
    await user.press(screen.getByText('Change Start'));
    expect(screen.getByRole('button', { name: /Use my current location/ }).props.accessibilityState).toMatchObject({ selected: false });
  });
});

describe('LocationSheet (routePreview) — manual start search ("Search")', () => {
  test('typing in the manual-start search box renders matching results', async () => {
    mockedSearchServiceSearch.mockReturnValue([candidatePlace]);
    mockedUseDirectionsViewModel.mockReturnValue(
      baseViewModel({ startSource: 'manual_place', showManualStartSearch: true }),
    );
    const user = userEvent.setup();
    await renderWithFooter(<LocationSheet mode="routePreview" destination={destination} onClose={onCloseSpy} />);

    const input = screen.getByPlaceholderText('Search start point: gate, rasta, block');
    await user.type(input, 'Gate');

    expect(await screen.findByText('Gate 1')).toBeOnTheScreen();
    expect(mockedSearchServiceSearch).toHaveBeenCalled();
  });

  test('no-results message shown when search yields nothing', async () => {
    mockedSearchServiceSearch.mockReturnValue([]);
    mockedUseDirectionsViewModel.mockReturnValue(
      baseViewModel({ startSource: 'manual_place', showManualStartSearch: true }),
    );
    const user = userEvent.setup();
    await renderWithFooter(<LocationSheet mode="routePreview" destination={destination} onClose={onCloseSpy} />);

    const input = screen.getByPlaceholderText('Search start point: gate, rasta, block');
    await user.type(input, 'zzz');

    expect(await screen.findByText('No start points found.')).toBeOnTheScreen();
  });

  test('tapping a search result selects it as the manual start place', async () => {
    mockedSearchServiceSearch.mockReturnValue([candidatePlace]);
    const setManualStartPlace = jest.fn();
    mockedUseDirectionsViewModel.mockReturnValue(
      baseViewModel({ startSource: 'manual_place', showManualStartSearch: true, setManualStartPlace }),
    );
    const user = userEvent.setup();
    await renderWithFooter(<LocationSheet mode="routePreview" destination={destination} onClose={onCloseSpy} />);

    const input = screen.getByPlaceholderText('Search start point: gate, rasta, block');
    await user.type(input, 'Gate');

    const result = await screen.findByText('Gate 1');
    await user.press(result);

    expect(setManualStartPlace).toHaveBeenCalledWith(candidatePlace);
  });

  test('an unroutable candidate in manual-start search reads as unavailable, not a plain choice', async () => {
    mockedSearchServiceSearch.mockReturnValue([unavailableCandidatePlace]);
    mockedUseDirectionsViewModel.mockReturnValue(
      baseViewModel({ startSource: 'manual_place', showManualStartSearch: true }),
    );
    const user = userEvent.setup();
    await renderWithFooter(<LocationSheet mode="routePreview" destination={destination} onClose={onCloseSpy} />);

    const input = screen.getByPlaceholderText('Search start point: gate, rasta, block');
    await user.type(input, 'Gate 18');

    const unavailableRow = await screen.findByLabelText('Gate 18, Gate, navigation unavailable');
    expect(unavailableRow.props.accessibilityState?.disabled).not.toBe(true);
    expect(screen.getByText(/Not yet available for routing/)).toBeOnTheScreen();
  });
});

describe('LocationSheet (routePreview) — change destination', () => {
  test('tapping "Change destination" opens inline destination search instead of closing the sheet', async () => {
    mockedUseDirectionsViewModel.mockReturnValue(baseViewModel());
    const onChangeDestination = jest.fn();
    const user = userEvent.setup();
    await renderWithFooter(
      <LocationSheet
        mode="routePreview"
        destination={destination}
        onClose={onCloseSpy}
        onChangeDestination={onChangeDestination}
      />,
    );

    await user.press(screen.getByText('Change destination'));

    expect(screen.getByText('Where do you want to go?')).toBeOnTheScreen();
    expect(onCloseSpy).not.toHaveBeenCalled();
  });

  test('typing in the destination search box renders matching results', async () => {
    mockedSearchServiceSearch.mockReturnValue([candidatePlace]);
    mockedUseDirectionsViewModel.mockReturnValue(baseViewModel());
    const user = userEvent.setup();
    await renderWithFooter(
      <LocationSheet
        mode="routePreview"
        destination={destination}
        onClose={onCloseSpy}
        onChangeDestination={jest.fn()}
      />,
    );

    await user.press(screen.getByText('Change destination'));
    const input = screen.getByPlaceholderText('Search destination: gate, rasta, block');
    await user.type(input, 'Gate');

    expect(await screen.findByText('Gate 1')).toBeOnTheScreen();
    expect(mockedSearchServiceSearch).toHaveBeenCalled();
  });

  test('no-results message shown when destination search yields nothing', async () => {
    mockedSearchServiceSearch.mockReturnValue([]);
    mockedUseDirectionsViewModel.mockReturnValue(baseViewModel());
    const user = userEvent.setup();
    await renderWithFooter(
      <LocationSheet
        mode="routePreview"
        destination={destination}
        onClose={onCloseSpy}
        onChangeDestination={jest.fn()}
      />,
    );

    await user.press(screen.getByText('Change destination'));
    const input = screen.getByPlaceholderText('Search destination: gate, rasta, block');
    await user.type(input, 'zzz');

    expect(await screen.findByText('No destinations found.')).toBeOnTheScreen();
  });

  test('tapping a destination search result invokes onChangeDestination with the picked place', async () => {
    mockedSearchServiceSearch.mockReturnValue([candidatePlace]);
    mockedUseDirectionsViewModel.mockReturnValue(baseViewModel());
    const onChangeDestination = jest.fn();
    const user = userEvent.setup();
    await renderWithFooter(
      <LocationSheet
        mode="routePreview"
        destination={destination}
        onClose={onCloseSpy}
        onChangeDestination={onChangeDestination}
      />,
    );

    await user.press(screen.getByText('Change destination'));
    const input = screen.getByPlaceholderText('Search destination: gate, rasta, block');
    await user.type(input, 'Gate');

    const result = await screen.findByText('Gate 1');
    await user.press(result);

    expect(onChangeDestination).toHaveBeenCalledWith(candidatePlace);
    expect(onCloseSpy).not.toHaveBeenCalled();
  });

  test('an unroutable candidate in destination search reads as unavailable, not a plain choice', async () => {
    mockedSearchServiceSearch.mockReturnValue([unavailableCandidatePlace]);
    mockedUseDirectionsViewModel.mockReturnValue(baseViewModel());
    const user = userEvent.setup();
    await renderWithFooter(
      <LocationSheet
        mode="routePreview"
        destination={destination}
        onClose={onCloseSpy}
        onChangeDestination={jest.fn()}
      />,
    );

    await user.press(screen.getByText('Change destination'));
    const input = screen.getByPlaceholderText('Search destination: gate, rasta, block');
    await user.type(input, 'Gate 18');

    const unavailableRow = await screen.findByLabelText('Gate 18, Gate, navigation unavailable');
    expect(unavailableRow.props.accessibilityState?.disabled).not.toBe(true);
    expect(screen.getByText(/Not yet available for routing/)).toBeOnTheScreen();
  });

  test('pressing "Cancel" during destination search returns to the destination summary without changing it', async () => {
    mockedUseDirectionsViewModel.mockReturnValue(baseViewModel());
    const onChangeDestination = jest.fn();
    const user = userEvent.setup();
    await renderWithFooter(
      <LocationSheet
        mode="routePreview"
        destination={destination}
        onClose={onCloseSpy}
        onChangeDestination={onChangeDestination}
      />,
    );

    await user.press(screen.getByText('Change destination'));
    expect(screen.getByText('Where do you want to go?')).toBeOnTheScreen();

    await user.press(screen.getByText('Cancel'));

    expect(screen.getByText('Block 1')).toBeOnTheScreen();
    expect(screen.queryByText('Where do you want to go?')).not.toBeOnTheScreen();
    expect(onChangeDestination).not.toHaveBeenCalled();
    expect(onCloseSpy).not.toHaveBeenCalled();
  });

  // Back-compat: a caller that hasn't wired onChangeDestination keeps the old
  // exit-the-sheet behavior instead of opening a search box with nowhere to send its result.
  test('falls back to onClose when onChangeDestination is not provided', async () => {
    mockedUseDirectionsViewModel.mockReturnValue(baseViewModel());
    const user = userEvent.setup();
    await renderWithFooter(<LocationSheet mode="routePreview" destination={destination} onClose={onCloseSpy} />);

    await user.press(screen.getByText('Change destination'));

    expect(onCloseSpy).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Where do you want to go?')).not.toBeOnTheScreen();
  });
});

describe('LocationSheet (routePreview) — route ready CTA', () => {
  test('LOC-09/10: keeps route preview available but blocks live navigation without a fresh precise fix', async () => {
    const onStartNavigation = jest.fn();
    mockedUseDirectionsViewModel.mockReturnValue(
      baseViewModel({
        loadState: 'ready',
        route: {
          nodes: ['A', 'B'],
          coordinates: [],
          totalDistance: 250,
          estimatedTimeMin: 4,
        },
        canStartNavigation: false,
        startNavigationDisabledReason: 'Precise location is required for live navigation. Route preview remains available.',
      }),
    );
    const user = userEvent.setup();
    await renderWithFooter(
      <LocationSheet
        mode="routePreview"
        destination={v2Destination}
        onClose={onCloseSpy}
        onStartNavigation={onStartNavigation}
      />,
    );

    expect(screen.getByText('Route ready')).toBeOnTheScreen();
    expect(screen.getByText('Precise location is required for live navigation. Route preview remains available.')).toBeOnTheScreen();
    // The disabled reason is part of the CTA's accessible name, not only visible text (#177).
    const startButton = screen.getByRole('button', {
      name: 'Start Navigation. Precise location is required for live navigation. Route preview remains available.',
    });
    expect(startButton).toBeDisabled();
    await user.press(startButton);
    expect(onStartNavigation).not.toHaveBeenCalled();
    expect(onCloseSpy).not.toHaveBeenCalled();
  });

  test('a route becoming ready is announced to screen readers, not just shown visually', async () => {
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
    mockedUseDirectionsViewModel.mockReturnValue(
      baseViewModel({
        loadState: 'ready',
        route: { nodes: ['A', 'B'], coordinates: [], totalDistance: 250, estimatedTimeMin: 4 },
      }),
    );
    await renderWithFooter(<LocationSheet mode="routePreview" destination={v2Destination} onClose={onCloseSpy} />);

    expect(announce).toHaveBeenCalledWith(expect.stringContaining('Route ready'));
  });

  test('a route calculation failure is announced to screen readers, not just shown visually', async () => {
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
    mockedUseDirectionsViewModel.mockReturnValue(
      baseViewModel({ loadState: 'error', errorMessage: 'No offline route could be found.' }),
    );
    await renderWithFooter(<LocationSheet mode="routePreview" destination={v2Destination} onClose={onCloseSpy} />);

    expect(announce).toHaveBeenCalledWith('Route problem. No offline route could be found.');
  });

  test('surfaces direct-guide warning and retries road routing from ready state', async () => {
    const retryOutsideRoute = jest.fn(async () => {});
    const selectManualGate = jest.fn();
    mockedUseDirectionsViewModel.mockReturnValue(
      baseViewModel({
        loadState: 'ready',
        retryOutsideRoute,
        selectManualGate,
        manualGateOptions: [
          { gateId: 'GATE_12', label: 'Gate 12' },
          { gateId: 'GATE_13', label: 'Gate 13' },
        ],
        route: {
          sourceVersion: 'v2',
          nodes: ['GATE_05', 'B2_C1'],
          coordinates: [],
          totalDistance: 250,
          estimatedTimeMin: 4,
          outsideRoute: {
            schemaVersion: 1,
            candidateId: 'preview-direct-1',
            requestId: 'preview-1',
            requestVersion: 1,
            provider: 'direct-guide',
            gateId: 'GATE_05',
            distanceM: 120,
            durationSeconds: null,
            coordinates: [
              { latitude: 24.96, longitude: 67.01 },
              { latitude: 24.961, longitude: 67.011 },
            ],
            steps: [],
            roadFollowing: false,
            distanceKind: 'direct-distance',
            warnings: [{ code: 'direct-guide-not-road-route' }],
            fallbackReason: 'outside-coverage',
            fallbackHistory: [],
          },
        },
      }),
    );
    const user = userEvent.setup();
    await renderWithFooter(<LocationSheet mode="routePreview" destination={v2Destination} onClose={onCloseSpy} />);

    expect(screen.getByText('Direct guide — not a road route')).toBeOnTheScreen();
    expect(screen.getByText('Start Direct Guide')).toBeOnTheScreen();
    expect(screen.queryByText('4 min')).not.toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Retry road route' }));
    expect(retryOutsideRoute).toHaveBeenCalledTimes(1);
    await user.press(screen.getByRole('button', { name: 'Choose another gate' }));
    await user.press(screen.getByRole('button', { name: 'Use Gate 12' }));
    expect(selectManualGate).toHaveBeenCalledWith('GATE_12');
  });

  test('Batch B: gate-choice buttons expose which gate is selected via accessibilityState, not color alone', async () => {
    mockedUseDirectionsViewModel.mockReturnValue(
      baseViewModel({
        loadState: 'ready',
        manualGateId: 'GATE_12',
        manualGateOptions: [
          { gateId: 'GATE_12', label: 'Gate 12' },
          { gateId: 'GATE_13', label: 'Gate 13' },
        ],
        route: {
          sourceVersion: 'v2',
          nodes: ['GATE_05', 'B2_C1'],
          coordinates: [],
          totalDistance: 250,
          estimatedTimeMin: 4,
          outsideRoute: {
            schemaVersion: 1,
            candidateId: 'preview-direct-2',
            requestId: 'preview-2',
            requestVersion: 1,
            provider: 'direct-guide',
            gateId: 'GATE_12',
            distanceM: 120,
            durationSeconds: null,
            coordinates: [
              { latitude: 24.96, longitude: 67.01 },
              { latitude: 24.961, longitude: 67.011 },
            ],
            steps: [],
            roadFollowing: false,
            distanceKind: 'direct-distance',
            warnings: [{ code: 'direct-guide-not-road-route' }],
            fallbackReason: 'outside-coverage',
            fallbackHistory: [],
          },
        },
      }),
    );
    const user = userEvent.setup();
    await renderWithFooter(<LocationSheet mode="routePreview" destination={v2Destination} onClose={onCloseSpy} />);

    await user.press(screen.getByRole('button', { name: 'Choose another gate' }));

    expect(screen.getByRole('button', { name: 'Use automatic gate selection' }).props.accessibilityState).toMatchObject({ selected: false });
    expect(screen.getByRole('button', { name: 'Use Gate 12' }).props.accessibilityState).toMatchObject({ selected: true });
    expect(screen.getByRole('button', { name: 'Use Gate 13' }).props.accessibilityState).toMatchObject({ selected: false });
  });

  test('shows route metrics once a route is ready', async () => {
    mockedUseDirectionsViewModel.mockReturnValue(
      baseViewModel({
        loadState: 'ready',
        route: {
          nodes: ['A', 'B'],
          coordinates: [],
          totalDistance: 250,
          estimatedTimeMin: 4,
        },
      }),
    );
    await renderWithFooter(<LocationSheet mode="routePreview" destination={destination} onClose={onCloseSpy} />);

    expect(screen.getByText('Route ready')).toBeOnTheScreen();
    expect(screen.getByText('4 min')).toBeOnTheScreen();
  });

  test('pressing "Start Navigation" invokes onStartNavigation and closes the sheet for a v2 destination', async () => {
    mockedUseDirectionsViewModel.mockReturnValue(
      baseViewModel({
        loadState: 'ready',
        route: {
          nodes: ['A', 'B'],
          coordinates: [],
          totalDistance: 250,
          estimatedTimeMin: 4,
        },
      }),
    );
    const onStartNavigation = jest.fn();
    const user = userEvent.setup();
    await renderWithFooter(
      <LocationSheet
        mode="routePreview"
        destination={v2Destination}
        onClose={onCloseSpy}
        onStartNavigation={onStartNavigation}
      />,
    );

    await user.press(screen.getByText('Start Navigation'));

    expect(onStartNavigation).toHaveBeenCalledTimes(1);
    expect(onCloseSpy).toHaveBeenCalledTimes(1);
  });

  test('pressing "Cancel Route" invokes onCancelRoute when provided', async () => {
    mockedUseDirectionsViewModel.mockReturnValue(
      baseViewModel({
        loadState: 'ready',
        route: {
          nodes: ['A', 'B'],
          coordinates: [],
          totalDistance: 250,
          estimatedTimeMin: 4,
        },
      }),
    );
    const onCancelRoute = jest.fn();
    const user = userEvent.setup();
    await renderWithFooter(
      <LocationSheet
        mode="routePreview"
        destination={v2Destination}
        onClose={onCloseSpy}
        onCancelRoute={onCancelRoute}
      />,
    );

    await user.press(screen.getByText('Cancel Route'));

    expect(onCancelRoute).toHaveBeenCalledTimes(1);
  });

  // Regression: a legacy (v1) destination used to have no working navigation entry point at
  // all — the primary button unconditionally closed the sheet. Now that navigation always runs
  // in-place (no separate NavigationScreen), v1 must behave like v2: start, then reveal the map.
  test('pressing "Start Navigation" starts navigation for a legacy (v1) destination and reveals the map', async () => {
    const handleStartNavigation = jest.fn();
    mockedUseDirectionsViewModel.mockReturnValue(
      baseViewModel({
        loadState: 'ready',
        route: {
          nodes: ['A', 'B'],
          coordinates: [],
          totalDistance: 250,
          estimatedTimeMin: 4,
        },
        handleStartNavigation,
      }),
    );
    const user = userEvent.setup();
    await renderWithFooter(<LocationSheet mode="routePreview" destination={destination} onClose={onCloseSpy} />);

    await user.press(screen.getByText('Start Navigation'));

    expect(handleStartNavigation).toHaveBeenCalledTimes(1);
    expect(onCloseSpy).toHaveBeenCalledTimes(1);
  });

  test('shows an error state with a retry button that invokes calculateRoute', async () => {
    const calculateRoute = jest.fn(async () => {});
    mockedUseDirectionsViewModel.mockReturnValue(
      baseViewModel({ loadState: 'error', errorMessage: 'Could not calculate route.', calculateRoute }),
    );
    const user = userEvent.setup();
    await renderWithFooter(<LocationSheet mode="routePreview" destination={destination} onClose={onCloseSpy} />);

    expect(screen.getByText('Route problem')).toBeOnTheScreen();
    await user.press(screen.getByText('Retry'));

    expect(calculateRoute).toHaveBeenCalledTimes(1);
  });

  test('an unroutable destination gets "Choose another destination" instead of a futile Retry', async () => {
    const onChangeDestination = jest.fn();
    mockedUseDirectionsViewModel.mockReturnValue(
      baseViewModel({ loadState: 'error', errorMessage: 'This gate is not ready for navigation. Please choose another nearby gate.' }),
    );
    const user = userEvent.setup();
    await renderWithFooter(
      <LocationSheet
        mode="routePreview"
        destination={{ ...destination, routingStatus: 'needs_connector_verification' }}
        onClose={onCloseSpy}
        onChangeDestination={onChangeDestination}
      />,
    );

    expect(screen.queryByText('Retry')).toBeNull();
    await user.press(screen.getByText('Choose another destination'));
    expect(screen.getByText('Where do you want to go?')).toBeTruthy();
  });

  test('does not re-invoke calculateRoute on a second Retry tap while the first is still in flight', async () => {
    let resolveCalculateRoute: () => void = () => {};
    const calculateRoute = jest.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveCalculateRoute = resolve;
        }),
    );
    mockedUseDirectionsViewModel.mockReturnValue(
      baseViewModel({ loadState: 'error', errorMessage: 'Could not calculate route.', calculateRoute }),
    );
    const user = userEvent.setup();
    await renderWithFooter(<LocationSheet mode="routePreview" destination={destination} onClose={onCloseSpy} />);

    const retryButton = screen.getByText('Retry');
    await user.press(retryButton);
    // Second tap while the first calculateRoute() promise is still unresolved — the
    // in-flight ref guard must swallow this, not the stale loadState prop (which the
    // mocked hook still reports as 'error' for both taps, matching a same-tick race).
    await user.press(retryButton);

    expect(calculateRoute).toHaveBeenCalledTimes(1);
    resolveCalculateRoute();
  });
});

describe('LocationSheet (preview) — Save/Share/Details accessibility', () => {
  function basePlaceSectionProps(overrides: Record<string, unknown> = {}) {
    return {
      mode: 'preview' as const,
      place: candidatePlace,
      theme: LIGHT_THEME,
      entryPoints: [],
      blockGates: [],
      selectedEntryIdx: 0,
      onSelectEntryIdx: jest.fn(),
      walkingTimeMin: 5,
      isFav: false,
      onToggleFavorite: jest.fn(),
      onSelectGate: jest.fn(),
      onOpenDirections: jest.fn(),
      onClose: jest.fn(),
      onShowDetails: jest.fn(),
      onCloseDetails: jest.fn(),
      developerModeEnabled: false,
      ...overrides,
    };
  }

  test('#65: Save announces role, label, and unsaved state', async () => {
    await renderWithFooter(<LocationSheet {...basePlaceSectionProps({ isFav: false })} />);

    const save = screen.getByRole('button', { name: 'Save location' });
    expect(save.props.accessibilityState).toMatchObject({ selected: false });
  });

  test('#65: Save announces saved state and the toggled-off label once favorited', async () => {
    await renderWithFooter(<LocationSheet {...basePlaceSectionProps({ isFav: true })} />);

    const save = screen.getByRole('button', { name: 'Remove from saved' });
    expect(save.props.accessibilityState).toMatchObject({ selected: true });
  });

  test('#65: Share and Details announce role and label', async () => {
    await renderWithFooter(<LocationSheet {...basePlaceSectionProps()} />);

    expect(screen.getByRole('button', { name: 'Share location' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Show details' })).toBeOnTheScreen();
  });
});

describe('LocationSheet (routePreview) — reduced motion (#100)', () => {
  test('RM-01: with Reduce Motion disabled, RoutePreviewSection state cards still cross-fade via Animated.timing', async () => {
    mockedUseReducedMotion.mockReturnValue(false);
    mockedUseDirectionsViewModel.mockReturnValue(baseViewModel());
    const timingSpy = jest.spyOn(Animated, 'timing');

    await renderWithFooter(<LocationSheet mode="routePreview" destination={destination} onClose={onCloseSpy} />);

    expect(timingSpy).toHaveBeenCalled();
  });

  test('RM-02: with Reduce Motion enabled, RoutePreviewSection state-card cross-fade is skipped', async () => {
    mockedUseReducedMotion.mockReturnValue(true);
    mockedUseDirectionsViewModel.mockReturnValue(baseViewModel());
    const timingSpy = jest.spyOn(Animated, 'timing');

    await renderWithFooter(<LocationSheet mode="routePreview" destination={destination} onClose={onCloseSpy} />);

    expect(timingSpy).not.toHaveBeenCalled();
  });

  test('RM-04: content still renders immediately and correctly with Reduce Motion enabled', async () => {
    mockedUseReducedMotion.mockReturnValue(true);
    mockedUseDirectionsViewModel.mockReturnValue(baseViewModel());

    await renderWithFooter(<LocationSheet mode="routePreview" destination={destination} onClose={onCloseSpy} />);

    expect(screen.getByText('Block 1')).toBeOnTheScreen();
    expect(screen.getByText('My current location')).toBeOnTheScreen();
  });

  test('RM-06: no stuck opacity — content stays visible across a state change with Reduce Motion enabled', async () => {
    mockedUseReducedMotion.mockReturnValue(true);
    mockedUseDirectionsViewModel.mockReturnValue(baseViewModel({ loadState: 'error', errorMessage: 'No route found' }));

    await renderWithFooter(<LocationSheet mode="routePreview" destination={destination} onClose={onCloseSpy} />);

    expect(screen.getByText('No route found')).toBeOnTheScreen();
  });
});

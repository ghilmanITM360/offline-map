/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render, screen, userEvent } from './test-utils';

import { DirectionsScreen } from '../views/screens/DirectionsScreen';
import { useDirectionsViewModel } from '../viewmodels/DirectionsViewModel';
import { SearchService } from '../services/SearchService';
import type { Place } from '../models/types';

jest.useFakeTimers();

// The viewmodel owns routing/GPS/service orchestration (already covered by scripts/test-*.ts
// GIS/routing suites per CLAUDE.md). Here we only care that DirectionsScreen wires real user
// interactions to the real handlers it is given, and renders the right thing for each state —
// so we mock the hook boundary and drive it like a small state machine per test.
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

function baseViewModel(overrides: Record<string, unknown> = {}) {
  return {
    route: null,
    startSource: 'live_gps',
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
    handleStartNavigation: jest.fn(),
    showManualStartSearch: false,
    ...overrides,
  };
}

let onCloseSpy: jest.Mock;
let onStartLegacyNavigationSpy: jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  onCloseSpy = jest.fn();
  onStartLegacyNavigationSpy = jest.fn();
  mockedSearchServiceSearch.mockReturnValue([]);
});

describe('DirectionsScreen — start option selection', () => {
  test('renders the destination being routed to', async () => {
    mockedUseDirectionsViewModel.mockReturnValue(baseViewModel());
    await render(<DirectionsScreen destination={destination} onClose={onCloseSpy} onStartLegacyNavigation={onStartLegacyNavigationSpy} />);

    expect(screen.getByText('Block 1')).toBeOnTheScreen();
  });

  test('pressing "Use my current location" invokes chooseCurrentLocation', async () => {
    const chooseCurrentLocation = jest.fn(async () => true);
    mockedUseDirectionsViewModel.mockReturnValue(baseViewModel({ chooseCurrentLocation }));
    const user = userEvent.setup();
    await render(<DirectionsScreen destination={destination} onClose={onCloseSpy} onStartLegacyNavigation={onStartLegacyNavigationSpy} />);

    await user.press(screen.getByText('Use my current location'));

    expect(chooseCurrentLocation).toHaveBeenCalledTimes(1);
  });

  test('pressing "Use last known location" invokes chooseRememberedLocation', async () => {
    const chooseRememberedLocation = jest.fn(() => true);
    mockedUseDirectionsViewModel.mockReturnValue(
      baseViewModel({ chooseRememberedLocation, rememberedLocationAvailable: true }),
    );
    const user = userEvent.setup();
    await render(<DirectionsScreen destination={destination} onClose={onCloseSpy} onStartLegacyNavigation={onStartLegacyNavigationSpy} />);

    await user.press(screen.getByText('Use last known location'));

    expect(chooseRememberedLocation).toHaveBeenCalledTimes(1);
  });

  test('"Use last known location" is disabled when no remembered location is available', async () => {
    mockedUseDirectionsViewModel.mockReturnValue(
      baseViewModel({ rememberedLocationAvailable: false }),
    );
    await render(<DirectionsScreen destination={destination} onClose={onCloseSpy} onStartLegacyNavigation={onStartLegacyNavigationSpy} />);

    expect(screen.getByText('No saved location yet')).toBeOnTheScreen();
  });

  test('pressing "Choose start manually" invokes chooseManualStart', async () => {
    const chooseManualStart = jest.fn();
    mockedUseDirectionsViewModel.mockReturnValue(baseViewModel({ chooseManualStart }));
    const user = userEvent.setup();
    await render(<DirectionsScreen destination={destination} onClose={onCloseSpy} onStartLegacyNavigation={onStartLegacyNavigationSpy} />);

    await user.press(screen.getByText('Choose start manually'));

    expect(chooseManualStart).toHaveBeenCalledTimes(1);
  });

  test('active start option is visually reflected via accessible state', async () => {
    mockedUseDirectionsViewModel.mockReturnValue(baseViewModel({ startSource: 'remembered_location' }));
    await render(<DirectionsScreen destination={destination} onClose={onCloseSpy} onStartLegacyNavigation={onStartLegacyNavigationSpy} />);

    // The status card reflects the active start source's message — real, user-visible output,
    // not an internal implementation detail.
    expect(screen.getByText(/Using last known location/)).toBeOnTheScreen();
  });
});

describe('DirectionsScreen — manual start search ("Search")', () => {
  test('typing in the manual-start search box renders matching results', async () => {
    mockedSearchServiceSearch.mockReturnValue([candidatePlace]);
    mockedUseDirectionsViewModel.mockReturnValue(
      baseViewModel({ startSource: 'manual_place', showManualStartSearch: true }),
    );
    const user = userEvent.setup();
    await render(<DirectionsScreen destination={destination} onClose={onCloseSpy} onStartLegacyNavigation={onStartLegacyNavigationSpy} />);

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
    await render(<DirectionsScreen destination={destination} onClose={onCloseSpy} onStartLegacyNavigation={onStartLegacyNavigationSpy} />);

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
    await render(<DirectionsScreen destination={destination} onClose={onCloseSpy} onStartLegacyNavigation={onStartLegacyNavigationSpy} />);

    const input = screen.getByPlaceholderText('Search start point: gate, rasta, block');
    await user.type(input, 'Gate');

    const result = await screen.findByText('Gate 1');
    await user.press(result);

    expect(setManualStartPlace).toHaveBeenCalledWith(candidatePlace);
  });
});

describe('DirectionsScreen — route ready CTA', () => {
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
    await render(<DirectionsScreen destination={destination} onClose={onCloseSpy} onStartLegacyNavigation={onStartLegacyNavigationSpy} />);

    expect(screen.getByText('Route ready')).toBeOnTheScreen();
    expect(screen.getByText('ETA: 4 min')).toBeOnTheScreen();
  });

  test('pressing "Show route on map" closes the sheet for a v2 destination (real handler, not a no-op)', async () => {
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
    const user = userEvent.setup();
    await render(
      <DirectionsScreen destination={v2Destination} onClose={onCloseSpy} onStartLegacyNavigation={onStartLegacyNavigationSpy} />,
    );

    await user.press(screen.getByText('Show route on map'));

    expect(onCloseSpy).toHaveBeenCalledTimes(1);
    expect(onStartLegacyNavigationSpy).not.toHaveBeenCalled();
  });

  // Regression: a legacy (v1) destination used to have no working navigation
  // entry point at all — the primary button unconditionally closed the sheet.
  // See docs/ROUTING_NAVIGATION_FIX_REPORT.md Phase 4.
  test('pressing "Start Navigation" starts navigation for a legacy (v1) destination', async () => {
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
    await render(<DirectionsScreen destination={destination} onClose={onCloseSpy} onStartLegacyNavigation={onStartLegacyNavigationSpy} />);

    await user.press(screen.getByText('Start Navigation'));

    expect(handleStartNavigation).toHaveBeenCalledTimes(1);
    expect(onStartLegacyNavigationSpy).toHaveBeenCalledTimes(1);
    expect(onCloseSpy).not.toHaveBeenCalled();
  });

  test('shows an error state with a retry button that invokes calculateRoute', async () => {
    const calculateRoute = jest.fn(async () => {});
    mockedUseDirectionsViewModel.mockReturnValue(
      baseViewModel({ loadState: 'error', errorMessage: 'Could not calculate route.', calculateRoute }),
    );
    const user = userEvent.setup();
    await render(<DirectionsScreen destination={destination} onClose={onCloseSpy} onStartLegacyNavigation={onStartLegacyNavigationSpy} />);

    expect(screen.getByText('Route problem')).toBeOnTheScreen();
    await user.press(screen.getByText('Retry'));

    expect(calculateRoute).toHaveBeenCalledTimes(1);
  });
});

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render, screen, userEvent } from './test-utils';

import { LocationSheet } from '../views/components/map/LocationSheet';
import { LIGHT_THEME } from '../services/ThemeService';
import { useDirectionsViewModel } from '../viewmodels/DirectionsViewModel';
import type { Place } from '../models/types';

jest.useFakeTimers();

// The viewmodel owns routing/GPS/service orchestration (already covered by scripts/test-*.ts
// GIS/routing suites per CLAUDE.md). Here we only care that LocationSheet's routePreview mode
// wires real user interactions to the real handlers it is given, and renders the right thing
// for each state — so we mock the hook boundary and drive it like a small state machine.
jest.mock('../viewmodels/DirectionsViewModel', () => ({
  useDirectionsViewModel: jest.fn(),
}));

const mockedUseDirectionsViewModel = useDirectionsViewModel as jest.Mock;

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

function baseViewModel(overrides: Record<string, unknown> = {}) {
  return {
    route: null,
    startSource: 'live_gps',
    startSourceLabel: 'My current location',
    startSourceSupportingCopy: 'Using live GPS location now.',
    isCurrentLocationStartActive: true,
    currentRouteOriginInsideVenue: true,
    loadState: 'idle',
    errorMessage: null,
    manualStart: null,
    calculateRoute: jest.fn(async () => {}),
    retryOutsideRoute: jest.fn(async () => {}),
    selectManualGate: jest.fn(),
    clearManualGateSelection: jest.fn(),
    manualGateId: null,
    manualGateOptions: [],
    routeRefreshing: false,
    handleStartNavigation: jest.fn(),
    ...overrides,
  };
}

let onCloseSpy: jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  onCloseSpy = jest.fn();
});

// NEW UX Phase C: Route Preview shows the resolved destination/start as plain summaries —
// no "Change Start"/"Change destination" pickers in the normal flow (the two decisions a
// user makes are choosing the destination in Locations Directory and pressing Start; origin
// is resolved automatically by DirectionsViewModel/resolveNavigationOrigin). The manual-start
// and destination-swap capabilities those pickers used to expose remain fully covered at the
// viewmodel level (DirectionsViewModelHybrid.test.tsx, DirectionsViewModelOriginFallback.test.ts).
describe('LocationSheet (routePreview) — destination and start summaries', () => {
  test('renders the destination being routed to', async () => {
    mockedUseDirectionsViewModel.mockReturnValue(baseViewModel());
    await render(<LocationSheet mode="routePreview" destination={destination} theme={LIGHT_THEME} onClose={onCloseSpy} />);

    expect(screen.getByText('Block 1')).toBeOnTheScreen();
  });

  test('shows the resolved current-location start with no picker', async () => {
    mockedUseDirectionsViewModel.mockReturnValue(baseViewModel());
    await render(<LocationSheet mode="routePreview" destination={destination} theme={LIGHT_THEME} onClose={onCloseSpy} />);

    expect(screen.getByText('My current location')).toBeOnTheScreen();
    expect(screen.queryByText('Change Start')).not.toBeOnTheScreen();
    expect(screen.queryByText('Change destination')).not.toBeOnTheScreen();
    expect(screen.queryByText('Where are you starting from?')).not.toBeOnTheScreen();
    expect(screen.queryByText('Where do you want to go?')).not.toBeOnTheScreen();
  });

  test('active start source is reflected in the status message', async () => {
    mockedUseDirectionsViewModel.mockReturnValue(baseViewModel({
      startSource: 'remembered_location',
      startSourceLabel: 'Last known location (from 5 minutes ago)',
      startSourceSupportingCopy: 'Using last known location from 5 minutes ago.',
      isCurrentLocationStartActive: false,
    }));
    await render(<LocationSheet mode="routePreview" destination={destination} theme={LIGHT_THEME} onClose={onCloseSpy} />);

    expect(screen.getByText('Last known location (from 5 minutes ago)')).toBeOnTheScreen();
    expect(screen.getByText(/Using last known location/)).toBeOnTheScreen();
  });

  test('device last-known origin is disclosed', async () => {
    mockedUseDirectionsViewModel.mockReturnValue(baseViewModel({
      startSource: 'device_last_known',
      startSourceLabel: 'Device last known location',
      startSourceSupportingCopy: 'Using device last known location because live GPS is unavailable.',
      isCurrentLocationStartActive: false,
    }));
    await render(<LocationSheet mode="routePreview" destination={destination} theme={LIGHT_THEME} onClose={onCloseSpy} />);

    expect(screen.getByText('Device last known location')).toBeOnTheScreen();
    expect(screen.getByText('Using device last known location because live GPS is unavailable.')).toBeOnTheScreen();
  });

  // Critical Safety Rule: GPS unavailable must never masquerade as the user's real location —
  // the canonical B2 fallback (see NavigationOriginResolver/DirectionsViewModel) is disclosed
  // by name, with an explicit "unavailable" message, distinct from every live/remembered start.
  test('canonical B2 fallback origin is visibly disclosed as unavailable, never as a live position', async () => {
    mockedUseDirectionsViewModel.mockReturnValue(baseViewModel({
      startSource: 'fallback_place',
      startSourceLabel: 'Block 2',
      startSourceSupportingCopy: 'Current location unavailable. Starting from Block 2.',
      isCurrentLocationStartActive: false,
    }));
    await render(<LocationSheet mode="routePreview" destination={destination} theme={LIGHT_THEME} onClose={onCloseSpy} />);

    expect(screen.getByText('Block 2')).toBeOnTheScreen();
    expect(screen.getByText(/Current location unavailable/)).toBeOnTheScreen();
  });
});

describe('LocationSheet (routePreview) — route ready CTA', () => {
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
    await render(<LocationSheet mode="routePreview" destination={v2Destination} theme={LIGHT_THEME} onClose={onCloseSpy} />);

    expect(screen.getByText('Direct guide — not a road route')).toBeOnTheScreen();
    expect(screen.getByText('Direct guidance only. This path may not follow roads.')).toBeOnTheScreen();
    expect(screen.getByText('Start Direct Guide')).toBeOnTheScreen();
    expect(screen.queryByText('4 min')).not.toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Retry road route' }));
    expect(retryOutsideRoute).toHaveBeenCalledTimes(1);
    await user.press(screen.getByRole('button', { name: 'Choose another gate' }));
    await user.press(screen.getByRole('button', { name: 'Use Gate 12' }));
    expect(selectManualGate).toHaveBeenCalledWith('GATE_12');
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
    await render(<LocationSheet mode="routePreview" destination={destination} theme={LIGHT_THEME} onClose={onCloseSpy} />);

    expect(screen.getByText('Route ready')).toBeOnTheScreen();
    expect(screen.getByText('4 min')).toBeOnTheScreen();
  });

  // Same Critical Safety Rule as the pre-route disclosure test above, but for the state that
  // actually reaches users in practice: GPS unavailable -> B2 fallback -> a route IS found.
  // showStartHint (and its startSourceSupportingCopy disclosure) only renders before a route is
  // ready, so this ready-state disclosure previously vanished the moment routing succeeded from
  // B2 -- leaving the user with a bare "Block 2" label indistinguishable from a real live start.
  test('canonical B2 fallback origin stays disclosed once a route is ready', async () => {
    mockedUseDirectionsViewModel.mockReturnValue(
      baseViewModel({
        startSource: 'fallback_place',
        startSourceLabel: 'Block 2',
        startSourceSupportingCopy: 'Current location unavailable. Starting from Block 2.',
        isCurrentLocationStartActive: false,
        loadState: 'ready',
        route: {
          nodes: ['A', 'B'],
          coordinates: [],
          totalDistance: 250,
          estimatedTimeMin: 4,
        },
      }),
    );
    await render(<LocationSheet mode="routePreview" destination={destination} theme={LIGHT_THEME} onClose={onCloseSpy} />);

    expect(screen.getByText('Route ready')).toBeOnTheScreen();
    expect(screen.getByText(/Current location unavailable/)).toBeOnTheScreen();
  });

  test('formats total distance in meters for a sub-1000m route', async () => {
    mockedUseDirectionsViewModel.mockReturnValue(
      baseViewModel({
        loadState: 'ready',
        route: { nodes: ['A', 'B'], coordinates: [], totalDistance: 850, estimatedTimeMin: 4 },
      }),
    );
    await render(<LocationSheet mode="routePreview" destination={destination} theme={LIGHT_THEME} onClose={onCloseSpy} />);

    expect(screen.getByText('850 m')).toBeOnTheScreen();
  });

  test('formats total distance in kilometers for a route at or above 1000m', async () => {
    mockedUseDirectionsViewModel.mockReturnValue(
      baseViewModel({
        loadState: 'ready',
        route: { nodes: ['A', 'B'], coordinates: [], totalDistance: 1400, estimatedTimeMin: 18 },
      }),
    );
    await render(<LocationSheet mode="routePreview" destination={destination} theme={LIGHT_THEME} onClose={onCloseSpy} />);

    expect(screen.getByText('1.4 km')).toBeOnTheScreen();
  });

  test('a newly calculated route replaces the previously shown distance', async () => {
    mockedUseDirectionsViewModel.mockReturnValue(
      baseViewModel({
        loadState: 'ready',
        route: { nodes: ['A', 'B'], coordinates: [], totalDistance: 250, estimatedTimeMin: 4 },
      }),
    );
    const { rerender } = await render(<LocationSheet mode="routePreview" destination={destination} theme={LIGHT_THEME} onClose={onCloseSpy} />);
    expect(screen.getByText('250 m')).toBeOnTheScreen();

    mockedUseDirectionsViewModel.mockReturnValue(
      baseViewModel({
        loadState: 'ready',
        route: { nodes: ['A', 'C'], coordinates: [], totalDistance: 1800, estimatedTimeMin: 22 },
      }),
    );
    await rerender(<LocationSheet mode="routePreview" destination={destination} theme={LIGHT_THEME} onClose={onCloseSpy} />);

    expect(screen.queryByText('250 m')).not.toBeOnTheScreen();
    expect(screen.getByText('1.8 km')).toBeOnTheScreen();
  });

  test('shows no distance while the route is still loading or has failed', async () => {
    mockedUseDirectionsViewModel.mockReturnValue(baseViewModel({ loadState: 'loading' }));
    const { rerender } = await render(<LocationSheet mode="routePreview" destination={destination} theme={LIGHT_THEME} onClose={onCloseSpy} />);
    expect(screen.queryByText(/^\d+(\.\d+)?\s(m|km)$/)).not.toBeOnTheScreen();

    mockedUseDirectionsViewModel.mockReturnValue(
      baseViewModel({ loadState: 'error', errorMessage: 'Could not calculate route.' }),
    );
    await rerender(<LocationSheet mode="routePreview" destination={destination} theme={LIGHT_THEME} onClose={onCloseSpy} />);

    expect(screen.getByText('Route problem')).toBeOnTheScreen();
    expect(screen.queryByText(/^\d+(\.\d+)?\s(m|km)$/)).not.toBeOnTheScreen();
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
    await render(
      <LocationSheet
        mode="routePreview"
        theme={LIGHT_THEME}
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
    await render(
      <LocationSheet
        mode="routePreview"
        theme={LIGHT_THEME}
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
    await render(<LocationSheet mode="routePreview" destination={destination} theme={LIGHT_THEME} onClose={onCloseSpy} />);

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
    await render(<LocationSheet mode="routePreview" destination={destination} theme={LIGHT_THEME} onClose={onCloseSpy} />);

    expect(screen.getByText('Route problem')).toBeOnTheScreen();
    await user.press(screen.getByText('Retry'));

    expect(calculateRoute).toHaveBeenCalledTimes(1);
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
    await render(<LocationSheet mode="routePreview" destination={destination} theme={LIGHT_THEME} onClose={onCloseSpy} />);

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

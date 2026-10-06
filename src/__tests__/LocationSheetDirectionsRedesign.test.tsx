/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { readFileSync } from 'node:fs';
import { AccessibilityInfo, Dimensions, I18nManager, StyleSheet } from 'react-native';
import { render, screen, userEvent, within } from './test-utils';

import { LocationSheet } from '../views/components/map/LocationSheet';
import { DirectionsSheetFooter } from '../views/components/map/DirectionsSheetFooter';
import { DirectionsHeader, StartOptionCard } from '../views/components/map/DirectionsSheetParts';
import { useDirectionsViewModel } from '../viewmodels/DirectionsViewModel';
import { placeCategoryLabel } from '../utils/placeCategoryLabel';
import { directionsOfflineCaption } from '../utils/directionsOfflineCopy';
import { useAppStore } from '../store/useAppStore';
import type { Place } from '../models/types';

// Issue #177 — Get Directions redesign: structure, semantics and truthfulness checks that
// the existing LocationSheet suite (behaviour/handlers) does not cover. The scroll view is
// given a testID here so "pinned footer lives outside the scroll area" is assertable.
jest.mock('@gorhom/bottom-sheet', () => {
  const ReactActual = jest.requireActual('react');
  const { View } = jest.requireActual('react-native');
  return {
    __esModule: true,
    BottomSheetScrollView: (props: { children?: React.ReactNode }) =>
      ReactActual.createElement(View, { testID: 'sheet-scroll' }, props.children),
    BottomSheetFooter: (props: { children?: React.ReactNode }) =>
      ReactActual.createElement(View, { testID: 'sheet-footer' }, props.children),
  };
});

jest.mock('../viewmodels/DirectionsViewModel', () => ({ useDirectionsViewModel: jest.fn() }));
jest.mock('../services/SearchService', () => ({ SearchService: { search: jest.fn(() => []) } }));

const mockedVm = useDirectionsViewModel as jest.Mock;

const destination: Place = {
  id: 'SP1',
  name: 'Shahr-e-Pindal North',
  category: 'SpecialRoute',
  description: 'Special route.',
  coordinate: { latitude: 24.9, longitude: 67.1 },
  sourceVersion: 'v2',
} as Place;

const route = { nodes: ['A', 'B'], coordinates: [], totalDistance: 250, estimatedTimeMin: 4 };

function outsideRoute(provider: 'google' | 'offline-osm' | 'direct-guide') {
  return {
    sourceVersion: 'v2',
    ...route,
    outsideRoute: {
      schemaVersion: 1,
      candidateId: 'c1',
      requestId: 'r1',
      requestVersion: 1,
      provider,
      gateId: 'GATE_12',
      distanceM: 120,
      durationSeconds: provider === 'direct-guide' ? null : 240,
      coordinates: [],
      steps: [],
      roadFollowing: provider !== 'direct-guide',
      distanceKind: provider === 'direct-guide' ? 'direct-distance' : 'road',
      warnings: [],
      fallbackReason: null,
      fallbackHistory: [],
    },
  };
}

function vm(overrides: Record<string, unknown> = {}) {
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

const onClose = jest.fn();
// The pinned footer lives in the modal's footer slot, outside the scroll area — mount it as HomeScreen does.
const renderSheet = (props: Partial<React.ComponentProps<typeof LocationSheet>> = {}) =>
  render(
    <>
      <LocationSheet mode="routePreview" destination={destination} onClose={onClose} {...(props as object)} />
      <DirectionsSheetFooter animatedFooterPosition={{ value: 0, get: () => 0 } as never} />
    </>,
  );

beforeEach(() => {
  jest.clearAllMocks();
  useAppStore.setState({ currentLocation: { latitude: 24.9, longitude: 67.1 } as never });
  Dimensions.set({ window: { width: 390, height: 844, scale: 2, fontScale: 1 } });
});

const flat = (node: { props: { style?: unknown } }) =>
  StyleSheet.flatten(typeof node.props.style === 'function' ? undefined : (node.props.style as object)) ?? {};

describe('Get Directions redesign — structure and semantics', () => {
  // #326: pinned, the heading plus the peek row left no scroll window at 200% font on a 320 dp window, so FROM/TO and
  // the route were unreachable. The heading scrolls with the body in every Directions state.
  test('the Get Directions heading scrolls with the body instead of being pinned above it', async () => {
    mockedVm.mockReturnValue(vm());
    await renderSheet();
    const scroll = within(screen.getByTestId('sheet-scroll'));
    expect(scroll.getByRole('header', { name: 'Get Directions' })).toBeOnTheScreen();
    expect(scroll.getByRole('button', { name: 'Back' })).toBeOnTheScreen();
  });

  // GREEN before and after: jest has no native driver, so it cannot reproduce the Android race this guards against
  // (rows stuck at ~15% opacity with animations off). The fix itself is verified on the emulator.
  test('with reduced motion the sheet content is not left to an animated opacity', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
    mockedVm.mockReturnValue(vm());
    await renderSheet();
    // Walk up from the To row: no ancestor may carry an opacity below 1.
    let node: { props: { style?: unknown }; parent: unknown } | null = screen.getByRole('button', { name: /^To .*Change destination\.$/ }) as never;
    while (node) {
      const style = typeof node.props.style === 'function' ? undefined : (StyleSheet.flatten(node.props.style as object) as { opacity?: number } | undefined);
      expect(style?.opacity ?? 1).toBe(1);
      node = node.parent as typeof node;
    }
  });

  test('title is a header; subtitle follows the state', async () => {
    mockedVm.mockReturnValue(vm());
    await renderSheet();

    expect(screen.getByRole('header', { name: 'Get Directions' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: /^From .*Change start\.$/ })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: /^To .*Change destination\.$/ })).toBeOnTheScreen();
    expect(screen.getByText('Plan your walking route inside Ijtema')).toBeOnTheScreen();
  });

  test('raw category enum never leaks: SpecialRoute reads as its Directory label', async () => {
    mockedVm.mockReturnValue(vm());
    await renderSheet();

    expect(screen.getByText('Shahr-e-Pindal')).toBeOnTheScreen();
    expect(screen.queryByText('SpecialRoute')).not.toBeOnTheScreen();
    expect(placeCategoryLabel('Gate')).toBe('Gate');
  });

  test('touch targets: back is 48 dp, change actions are >= 44 dp with hit slop to 48', async () => {
    mockedVm.mockReturnValue(vm());
    await renderSheet();

    expect(flat(screen.getByRole('button', { name: 'Back' }))).toMatchObject({ width: 48, height: 48 });
    for (const name of [/Change destination\./, /Change start\./]) {
      expect(flat(screen.getByRole('button', { name })).minHeight).toBeGreaterThanOrEqual(48);
    }
  });

  test('a live start needs no technical helper line', async () => {
    mockedVm.mockReturnValue(vm());
    await renderSheet();
    expect(screen.queryByText('Using GPS')).not.toBeOnTheScreen();
  });

  test('Starting from helper follows a remembered start instead of claiming GPS', async () => {
    mockedVm.mockReturnValue(
      vm({ startSource: 'remembered_location', startSourceLabel: 'Last known location (from 5 minutes ago)' }),
    );
    await renderSheet();
    expect(screen.queryByText('Using GPS')).not.toBeOnTheScreen();
    expect(screen.getByText('Saved location, not live')).toBeOnTheScreen();
  });

  test('Change Start opens the Directory in start mode and the summary stays put', async () => {
    mockedVm.mockReturnValue(vm());
    const onOpenDirectory = jest.fn();
    const user = userEvent.setup();
    await renderSheet({ onOpenDirectory });

    await user.press(screen.getByRole('button', { name: /Change start\./ }));

    expect(onOpenDirectory).toHaveBeenCalledWith('start');
    expect(screen.getByRole('button', { name: /Change destination\./ })).toBeOnTheScreen();
    expect(screen.queryByText('Choose where you are starting from')).not.toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: /Use my current location/ })).not.toBeOnTheScreen();
  });

  test('Back from the summary closes the sheet', async () => {
    mockedVm.mockReturnValue(vm());
    const user = userEvent.setup();
    await renderSheet();

    await user.press(screen.getByRole('button', { name: 'Back' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('tapping the destination or start row runs the same action as its change button', async () => {
    mockedVm.mockReturnValue(vm());
    const onOpenDirectory = jest.fn();
    const user = userEvent.setup();
    await renderSheet({ onChangeDestination: jest.fn(), onOpenDirectory });

    await user.press(screen.getByText(destination.name));
    expect(onOpenDirectory).toHaveBeenCalledWith('destination');

    await user.press(screen.getByText('My current location'));
    expect(onOpenDirectory).toHaveBeenLastCalledWith('start');
  });
});

describe('Get Directions redesign — pinned footer', () => {
  const ready = (overrides: Record<string, unknown> = {}) =>
    vm({ loadState: 'ready', route, ...overrides });

  test('CTA, summary and reason live in a footer outside the scroll area', async () => {
    mockedVm.mockReturnValue(
      ready({ canStartNavigation: false, startNavigationDisabledReason: 'Fix is stale.' }),
    );
    await renderSheet();

    const scroll = within(screen.getByTestId('sheet-scroll'));
    expect(scroll.queryByText(/Start Navigation/)).not.toBeOnTheScreen();
    expect(scroll.queryByText('Fix is stale.')).not.toBeOnTheScreen();
    expect(scroll.queryByText('Route ready')).not.toBeOnTheScreen();
    expect(screen.getByText('Route ready')).toBeOnTheScreen();
    expect(screen.getByText('Fix is stale.')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Start Navigation. Fix is stale.' })).toBeDisabled();
    expect(within(screen.getByTestId('sheet-footer')).getByText('Fix is stale.')).toBeOnTheScreen();
  });

  test('TalkBack reads header and content before the footer (#128 B)', async () => {
    mockedVm.mockReturnValue(ready());
    await renderSheet();

    // TalkBack flattens plain view groups and sorts the leaves by overlap-sensitive geometry, which
    // interleaved the footer's rows with the body's. Body and footer must each stay one node.
    const body = screen.getByTestId('directions-body');
    expect(body.props.collapsable).toBe(false);
    expect(body.props.importantForAccessibility).toBe('yes');
    const footer = within(screen.getByTestId('sheet-footer')).getByTestId('directions-footer');
    expect(footer.props.importantForAccessibility).toBe('yes');

    // The summary is one stop (eta and distance included), not three that Android sorts apart.
    expect(within(footer).getByLabelText('Route ready, 4 min, 250 m')).toBeOnTheScreen();
  });

  test('enabled CTA keeps its plain accessible name', async () => {
    mockedVm.mockReturnValue(ready());
    await renderSheet();

    expect(screen.getByRole('button', { name: 'Start Navigation' })).toBeEnabled();
  });

  test('at 200% font the footer keeps only the action; summary and caption scroll', async () => {
    Dimensions.set({ window: { width: 390, height: 844, scale: 2, fontScale: 2 } });
    mockedVm.mockReturnValue(ready());
    await renderSheet();

    const scroll = within(screen.getByTestId('sheet-scroll'));
    expect(scroll.getByText('Route ready')).toBeOnTheScreen();
    expect(scroll.getByText('Ijtema routes work without internet.')).toBeOnTheScreen();
    expect(scroll.queryByRole('button', { name: 'Start Navigation' })).not.toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Start Navigation' })).toBeOnTheScreen();
  });

  test('the footer hides at the collapsed snap so it cannot cover the header', async () => {
    mockedVm.mockReturnValue(ready());
    await render(
      <>
        <LocationSheet mode="routePreview" destination={destination} onClose={onClose} />
        <DirectionsSheetFooter animatedFooterPosition={{ value: 0, get: () => 0 } as never} collapsed />
      </>,
    );

    expect(screen.queryByRole('button', { name: 'Start Navigation' })).not.toBeOnTheScreen();
  });

  test('closing the sheet clears the published footer', async () => {
    mockedVm.mockReturnValue(ready());
    const view = await renderSheet();
    expect(screen.getByRole('button', { name: 'Start Navigation' })).toBeOnTheScreen();

    await view.rerender(<DirectionsSheetFooter animatedFooterPosition={{ value: 0, get: () => 0 } as never} />);
    expect(screen.queryByRole('button', { name: 'Start Navigation' })).not.toBeOnTheScreen();
  });

  test('loading status occupies the footer slot', async () => {
    mockedVm.mockReturnValue(vm({ loadState: 'loading' }));
    await renderSheet();
    expect(screen.getByText('Finding route...')).toBeOnTheScreen();
    expect(within(screen.getByTestId('sheet-scroll')).queryByText('Finding route...')).not.toBeOnTheScreen();
  });

  test('error detail scrolls with content while its Retry action is pinned in the footer', async () => {
    mockedVm.mockReturnValue(vm({ loadState: 'error', errorMessage: 'No route.' }));
    await renderSheet();
    expect(within(screen.getByTestId('sheet-scroll')).getByText('No route.')).toBeOnTheScreen();
    expect(within(screen.getByTestId('sheet-scroll')).queryByText('Try again')).not.toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Choose another start' })).toBeOnTheScreen();
  });

  test('same start and destination says so and offers no Start, no route summary and no 0 m', async () => {
    mockedVm.mockReturnValue(vm({ loadState: 'same_place', route: null }));
    await renderSheet();
    expect(screen.getByText('Start and destination are the same place.')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Choose another place' })).toBeOnTheScreen();
    expect(screen.queryByText(/Start Navigation|Route ready|Ready to go| 0 m/)).not.toBeOnTheScreen();
  });
});

describe('Get Directions redesign — truthful offline copy', () => {
  test('caption branches', () => {
    expect(directionsOfflineCaption(undefined, false)).toBe('Ijtema routes work without internet.');
    expect(directionsOfflineCaption('offline-osm', false)).toBe('Ijtema routes work without internet.');
    // The map banner already says the imagery is missing; the sheet must not repeat it (#222 UX-01).
    expect(directionsOfflineCaption(undefined, true)).toBeNull();
    expect(directionsOfflineCaption('offline-osm', true)).toBeNull();
    expect(directionsOfflineCaption('google', false)).toBeNull();
    expect(directionsOfflineCaption('direct-guide', true)).toBeNull();
  });

  test('never claims offline maps or all-information availability', () => {
    const all = [
      directionsOfflineCaption(undefined, false),
    ].join(' ');
    expect(all).not.toMatch(/all maps|all .*information|Works Offline|download/i);
  });

  test('imagery unavailable: the map banner owns the message, the sheet adds no second one', async () => {
    mockedVm.mockReturnValue(vm({ loadState: 'ready', route }));
    await renderSheet({ basemapOffline: true } as never);
    expect(screen.queryByText(/without internet/)).not.toBeOnTheScreen();
    expect(screen.queryByText(/background map picture/)).not.toBeOnTheScreen();
  });

  test.each(['google', 'direct-guide'] as const)('%s routes make no offline claim', async (provider) => {
    mockedVm.mockReturnValue(vm({ loadState: 'ready', route: outsideRoute(provider) }));
    await renderSheet();
    expect(screen.queryByText(/without internet/)).not.toBeOnTheScreen();
  });

  test('State A shows the caption as a banner', async () => {
    mockedVm.mockReturnValue(
      vm({ startSource: 'manual_place', isCurrentLocationStartActive: false, showManualStartSearch: true }),
    );
    await renderSheet();

    expect(screen.getByText('Ijtema routes work without internet.')).toBeOnTheScreen();
  });
});

describe('Get Directions redesign — RTL, colour and jargon guards', () => {
  const parts = readFileSync('src/views/components/map/DirectionsSheetParts.tsx', 'utf8');
  const sheet = readFileSync('src/views/components/map/LocationSheet.tsx', 'utf8');
  const routePreview = sheet.slice(
    sheet.indexOf('function RoutePreviewSection('),
    sheet.indexOf('function PlaceSection('),
  );

  test('layout uses logical (start/end) properties only', () => {
    for (const source of [parts, routePreview]) {
      expect(source).not.toMatch(/\b(left|right):|marginLeft|marginRight|paddingLeft|paddingRight|textAlign: 'left'/);
    }
  });

  test('the two states carry no blue tokens', () => {
    for (const source of [parts, routePreview]) {
      expect(source).not.toMatch(/staticColors\.(info|infoStrong|infoBorder|infoBackground|routeInside|routePreviewPill)|#1A73E8/);
    }
    expect(routePreview).not.toMatch(/variant="secondary"|variant=\{[^}]*'secondary'/);
  });

  test('no uppercase grey labels and no raw category enum in the sheet', () => {
    expect(routePreview).not.toContain("textTransform: 'uppercase'");
    expect(routePreview).not.toMatch(/\{(destination|candidate)\.category\}/);
  });

  test('header and option cards render under RTL (chevron direction follows I18nManager.isRTL)', async () => {
    const original = I18nManager.isRTL;
    Object.defineProperty(I18nManager, 'isRTL', { value: true, configurable: true });
    try {
      await render(
        <>
          <DirectionsHeader title="T" subtitle="S" onBack={jest.fn()} />
          <StartOptionCard icon={null} title="A" subtitle="B" onPress={jest.fn()} />
        </>,
      );
      expect(screen.getByRole('header', { name: 'T' })).toBeOnTheScreen();
      expect(screen.getByRole('button', { name: 'A. B' })).toBeOnTheScreen();
    } finally {
      Object.defineProperty(I18nManager, 'isRTL', { value: original, configurable: true });
    }
  });
});

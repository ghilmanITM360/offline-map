/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { act, fireEvent, render, screen } from './test-utils';

import { HomeScreen } from '../views/screens/HomeScreen';
import { useHomeViewModel } from '../viewmodels/HomeViewModel';
import { useDirectionsViewModel } from '../viewmodels/DirectionsViewModel';
import { useAppStore } from '../store/useAppStore';

// Cold-launch camera decision (see HomeScreen.tsx's onMapReady) is kept in its own file,
// separate from HomeScreen.test.tsx's recenter/pan follow-mode tests. Those tests exercise
// MapLabelOverlay's rAF-coalesced projection under fake timers via userEvent + timer
// advances; chaining more renders after them in the same file is order-sensitive (a stray
// projection promise can resolve during a later test's render and corrupt its act() scope).
// A separate test file gets its own isolated module/act state, sidestepping that entirely.
jest.mock('../viewmodels/HomeViewModel', () => ({
  useHomeViewModel: jest.fn(),
}));

jest.mock('../viewmodels/DirectionsViewModel', () => ({
  useDirectionsViewModel: jest.fn(),
}));

jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  return {
    ...actual,
    useNavigation: jest.fn(),
  };
});

const { useNavigation } = jest.requireMock('@react-navigation/native') as { useNavigation: jest.Mock };
const mockedUseHomeViewModel = useHomeViewModel as jest.Mock;
const mockedUseDirectionsViewModel = useDirectionsViewModel as jest.Mock;

const CATEGORY_CHIPS = [
  { id: 'all', label: 'All' },
  { id: 'blocks', label: 'Blocks' },
  { id: 'gates', label: 'Gates' },
];

const cameraAnimateToUserSpy = jest.fn();
const cameraFitVenueBoundsSpy = jest.fn();

function useFakeHomeViewModel() {
  return {
    mapRef: { current: null },
    bottomSheetRef: { current: null },
    cameraManager: {
      mode: 'IDLE' as const,
      animateToUser: cameraAnimateToUserSpy,
      animateToPlace: jest.fn(),
      fitVenueBounds: cameraFitVenueBoundsSpy,
      fitRoute: jest.fn(),
      followUser: jest.fn(),
      stopFollowing: jest.fn(),
      enterNavigationCamera: jest.fn(),
      exitNavigationCamera: jest.fn(),
    },
    mapType: 'standard' as const,
    searchQuery: '',
    searchResults: [],
    selectedPlace: null,
    suggestedPlaces: [],
    recentSearches: [],
    snapPoints: ['15%', '50%', '92%'],
    initialRegion: { latitude: 24.9, longitude: 67.1, latitudeDelta: 0.01, longitudeDelta: 0.01 },
    isOffline: false,
    offlineData: { isDownloaded: false },
    activeCategory: null,
    categoryChips: CATEGORY_CHIPS,
    searchPlaceholder: 'Search blocks, rastas, gates',
    mapZoomLevel: 15.5,
    venueStatus: { insideVenue: false, insideBlock: null },
    compassMode: 'NORTH_UP' as const,
    setIsMapReady: jest.fn(),
    handleSearch: jest.fn(),
    handlePlaceSelect: jest.fn(),
    handleSheetIndexChange: jest.fn(),
    handleRecenter: jest.fn(async () => true),
    handleCompassToggle: jest.fn(),
    handleZoomIn: jest.fn(),
    handleZoomOut: jest.fn(),
    handleMapRegionChangeComplete: jest.fn(),
    clearSearch: jest.fn(),
    handleCategoryPress: jest.fn(),
    setSelectedPlace: jest.fn(),
    updateSettings: jest.fn(),
    settings: {
      mapMode: 'standard' as const,
      autoFollowLocation: true,
      keepNorthFixed: false,
      darkMode: false,
      voiceInstructions: true,
      walkingSpeed: 1.4,
      autoReroute: true,
      distanceUnit: 'meters' as const,
      language: 'en' as const,
    },
  };
}

let initialStoreState: ReturnType<typeof useAppStore.getState>;

beforeAll(() => {
  initialStoreState = useAppStore.getState();
});

// The mocked MapView (jest.setup.ts) exposes a real pointForCoordinate() via
// useImperativeHandle, so mapReady genuinely kicks off MapLabelOverlay's
// requestAnimationFrame -> Promise.all(pointForCoordinate) -> setPoints chain (see
// MapLabelOverlay.tsx's project()) — this is not a no-op in this file. React Native's own jest
// preset (node_modules/react-native/jest/setup.js) defines requestAnimationFrame as
// `setTimeout(() => callback(jest.now()), 0)`, looked up dynamically at call time — so once
// fake timers are installed, rAF resolves via the *fake* setTimeout queue regardless of any
// `doNotFake` option (there's no real, independent rAF clock to exclude it from in this
// environment). Fake timers are therefore installed explicitly here and the chain is flushed
// deterministically with advanceTimersByTimeAsync (not the old bare jest.runOnlyPendingTimers(),
// which — called with no fake timers ever installed — was a silent no-op: nothing was pending
// for it to flush, so the real chain settled on its own real-clock schedule, sometimes after
// the test had already ended and RNTL had unmounted).
beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  useAppStore.setState(initialStoreState, true);
  useNavigation.mockReturnValue({ navigate: jest.fn(), dispatch: jest.fn(), goBack: jest.fn() });
  mockedUseHomeViewModel.mockImplementation(useFakeHomeViewModel);
  mockedUseDirectionsViewModel.mockReturnValue({
    isVisible: false,
    origin: null,
    destination: null,
    handleClose: jest.fn(),
  });
});

afterEach(() => {
  jest.useRealTimers();
});

// Advances the fake clock enough to fire the pending rAF/setTimeout callback and, via the
// "Async" timer API, yields to the microtask queue between ticks so the chained
// Promise.all(pointForCoordinate).then(setPoints).finally() continuation also fully drains
// before the test ends and RNTL auto-unmounts.
async function flushProjectionTimers() {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(100);
  });
}

describe('HomeScreen — cold-launch camera (Google Maps principles, adapted for a venue)', () => {
  test('first install: fits the venue overview and marks the overview as seen', async () => {
    useAppStore.setState({
      hasSeenMapOverview: false,
      hasLocationPermission: true,
      currentLocation: { latitude: 24.91, longitude: 67.11 },
    });

    await render(<HomeScreen />);
    await act(async () => {
      fireEvent(screen.getByTestId('home-map-view'), 'mapReady');
    });
    // onMapReady also kicks off MapLabelOverlay's rAF-coalesced projection (see
    // requestProjection calls in HomeScreen.tsx / project() in MapLabelOverlay.tsx) — let it
    // fully settle before the test ends and RNTL auto-unmounts.
    await flushProjectionTimers();

    expect(cameraFitVenueBoundsSpy).toHaveBeenCalledTimes(1);
    expect(cameraAnimateToUserSpy).not.toHaveBeenCalled();
    expect(useAppStore.getState().hasSeenMapOverview).toBe(true);
  });

  test('returning user with GPS: animates straight to the current location', async () => {
    const coord = { latitude: 24.912, longitude: 67.113 };
    useAppStore.setState({ hasSeenMapOverview: true, hasLocationPermission: true, currentLocation: coord });

    await render(<HomeScreen />);
    await act(async () => {
      fireEvent(screen.getByTestId('home-map-view'), 'mapReady');
    });
    // onMapReady also kicks off MapLabelOverlay's rAF-coalesced projection (see
    // requestProjection calls in HomeScreen.tsx / project() in MapLabelOverlay.tsx) — let it
    // fully settle before the test ends and RNTL auto-unmounts.
    await flushProjectionTimers();

    expect(cameraAnimateToUserSpy).toHaveBeenCalledTimes(1);
    expect(cameraAnimateToUserSpy).toHaveBeenCalledWith(coord);
    expect(cameraFitVenueBoundsSpy).not.toHaveBeenCalled();
  });

  test('returning user without GPS: falls back to the venue overview', async () => {
    useAppStore.setState({
      hasSeenMapOverview: true,
      hasLocationPermission: false,
      currentLocation: null,
      lastKnownLocation: null,
    });

    await render(<HomeScreen />);
    await act(async () => {
      fireEvent(screen.getByTestId('home-map-view'), 'mapReady');
    });
    // onMapReady also kicks off MapLabelOverlay's rAF-coalesced projection (see
    // requestProjection calls in HomeScreen.tsx / project() in MapLabelOverlay.tsx) — let it
    // fully settle before the test ends and RNTL auto-unmounts.
    await flushProjectionTimers();

    expect(cameraFitVenueBoundsSpy).toHaveBeenCalledTimes(1);
    expect(cameraAnimateToUserSpy).not.toHaveBeenCalled();
  });
});

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render, screen, userEvent, waitFor } from './test-utils';

import { HomeScreen } from '../views/screens/HomeScreen';
import { useHomeViewModel } from '../viewmodels/HomeViewModel';
import { useDirectionsViewModel } from '../viewmodels/DirectionsViewModel';
import { useAppStore } from '../store/useAppStore';
import type { Place } from '../models/types';

jest.useFakeTimers();

// HomeScreen's own GPS/search/map-ref orchestration lives in useHomeViewModel (already covered
// by scripts/test-*.ts for the underlying search/routing logic). We mock the hook boundary with
// a small *stateful* fake (real React state, real handlers wired to spies) so that pressing a
// filter chip or typing in the search box produces the same re-renders a real user would see —
// this keeps the test about HomeScreen's wiring, not the hook's GPS/service internals.
jest.mock('../viewmodels/HomeViewModel', () => ({
  useHomeViewModel: jest.fn(),
}));

// DirectionsScreen's own routing/GPS orchestration is covered by DirectionsScreen.test.tsx and
// the scripts/test-*.ts routing suites. Here we only care whether HomeScreen keeps the
// route-preview card and the Directions sheet mutually exclusive, so the hook boundary is mocked
// the same way DirectionsScreen.test.tsx does.
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

const gateResult: Place = {
  id: 'GATE_05',
  name: 'Gate 5',
  category: 'Gate',
  description: 'Official Gate 5.',
  coordinate: { latitude: 24.9021, longitude: 67.1015 },
  sourceVersion: 'v2',
  sourceKind: 'gate',
} as Place;

const handleCategoryPressSpy = jest.fn();
const handleSearchSpy = jest.fn();
const handlePlaceSelectSpy = jest.fn();
const setSelectedPlaceSpy = jest.fn();

function useFakeHomeViewModel() {
  const [activeCategory, setActiveCategory] = React.useState<string | null>(null);
  const [searchQuery, setSearchQuery] = React.useState('');
  const [searchResults, setSearchResults] = React.useState<Place[]>([]);

  const handleCategoryPress = (category: string) => {
    handleCategoryPressSpy(category);
    setActiveCategory((prev) => (prev === category ? null : category));
  };

  const handleSearch = (text: string) => {
    handleSearchSpy(text);
    setSearchQuery(text);
    setSearchResults(text.length > 1 ? [gateResult] : []);
  };

  return {
    mapRef: { current: null },
    bottomSheetRef: { current: null },
    mapType: 'standard' as const,
    searchQuery,
    searchResults,
    selectedPlace: null,
    recentSearches: [],
    snapPoints: ['15%', '50%', '92%'],
    initialRegion: { latitude: 24.9, longitude: 67.1, latitudeDelta: 0.01, longitudeDelta: 0.01 },
    isOffline: false,
    offlineData: { isDownloaded: false },
    activeCategory,
    categoryChips: CATEGORY_CHIPS,
    searchPlaceholder: 'Search blocks, rastas, gates',
    mapZoomLevel: 15.5,
    venueStatus: { insideVenue: false, insideBlock: null },
    setIsMapReady: jest.fn(),
    handleSearch,
    handlePlaceSelect: handlePlaceSelectSpy,
    handleRecenter: jest.fn(async () => {}),
    handleCompassReset: jest.fn(),
    handleZoomIn: jest.fn(),
    handleZoomOut: jest.fn(),
    handleMapRegionChangeComplete: jest.fn(),
    clearSearch: jest.fn(),
    handleCategoryPress,
    setSelectedPlace: setSelectedPlaceSpy,
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

beforeEach(() => {
  jest.clearAllMocks();
  useAppStore.setState(initialStoreState, true);
  useNavigation.mockReturnValue({ navigate: jest.fn(), dispatch: jest.fn(), goBack: jest.fn() });
  mockedUseHomeViewModel.mockImplementation(useFakeHomeViewModel);
});

describe('HomeScreen — filter chips', () => {
  test('pressing a filter chip invokes handleCategoryPress with the chip id', async () => {
    const user = userEvent.setup();
    await render(<HomeScreen />);

    await user.press(screen.getByText('Gates'));

    expect(handleCategoryPressSpy).toHaveBeenCalledWith('gates');
  });

  test('pressing a filter chip visually marks it active', async () => {
    const user = userEvent.setup();
    await render(<HomeScreen />);

    const gatesChip = screen.getByText('Gates');
    await user.press(gatesChip);

    // The active chip gets bold white text (styles.activeChipText) — real, user-visible output.
    await waitFor(() => {
      expect(gatesChip).toHaveStyle({ color: '#FFFFFF', fontWeight: '700' });
    });
  });

  test('map layers respond to filter selection: selecting "blocks" hides rasta labels', async () => {
    const user = userEvent.setup();
    await render(<HomeScreen />);

    // At the default zoom with no filter, "Rasta 01" is one of the visible rasta labels.
    expect(await screen.findByText('Rasta 01')).toBeOnTheScreen();

    await user.press(screen.getByText('Blocks'));

    // V2MapRenderingService.getHomeLayers zeroes out the rastas layer entirely when the
    // active filter is "blocks" — this is a real production data path, not a style tweak.
    await waitFor(() => {
      expect(screen.queryByText('Rasta 01')).not.toBeOnTheScreen();
    });
  });

  test('map layers respond to filter selection: selecting "gates" shows non-major gate markers', async () => {
    const user = userEvent.setup();
    await render(<HomeScreen />);

    // Gate 2 is not one of the "major" gates surfaced at the default zoom/"all" filter (only
    // major gates + every-other-gate are shown via pickByZoom), so it should be absent...
    expect(screen.queryByText('G02')).not.toBeOnTheScreen();

    await user.press(screen.getByText('Gates'));

    // ...and appear once the "gates" filter forces every gate marker to render — a real
    // production data path (V2MapRenderingService.getHomeLayers), not a style tweak.
    expect(await screen.findByText('G02')).toBeOnTheScreen();
  });
});

describe('HomeScreen — search', () => {
  test('typing in the search bar renders results', async () => {
    const user = userEvent.setup();
    await render(<HomeScreen />);

    const input = screen.getByPlaceholderText('Search blocks, rastas, gates');
    await user.type(input, 'Gate 5');

    expect(handleSearchSpy).toHaveBeenCalled();
    expect(await screen.findByTestId('search-result-GATE_05')).toBeOnTheScreen();
  });

  test('tapping a search result selects it', async () => {
    const user = userEvent.setup();
    await render(<HomeScreen />);

    const input = screen.getByPlaceholderText('Search blocks, rastas, gates');
    await user.type(input, 'Gate 5');

    const result = await screen.findByTestId('search-result-GATE_05');
    await user.press(result);

    expect(handlePlaceSelectSpy).toHaveBeenCalledWith(gateResult);
  });
});

describe('HomeScreen — route preview "Start Navigation" (real handler wiring)', () => {
  test('pressing "Start Navigation" on an active preview calls startNavigation in place, without navigating to a new screen', async () => {
    const navigateSpy = jest.fn();
    useNavigation.mockReturnValue({ navigate: navigateSpy, dispatch: jest.fn(), goBack: jest.fn() });

    const destination: Place = {
      id: 'GATE_08',
      name: 'Gate 8',
      category: 'Gate',
      description: 'Official Gate 8.',
      coordinate: { latitude: 24.903, longitude: 67.103 },
      sourceVersion: 'v2',
      sourceKind: 'gate',
    } as Place;

    const previewRoute = {
      nodes: ['start', 'end'],
      coordinates: [
        { latitude: 24.9, longitude: 67.1 },
        { latitude: 24.903, longitude: 67.103 },
      ],
      totalDistance: 180,
      estimatedTimeMin: 3,
      segments: [],
      startLabel: 'Current location',
      destinationLabel: 'Gate 8',
      startResolution: {
        mode: 'inside',
        coordinate: { latitude: 24.9, longitude: 67.1 },
      },
      instructions: [
        {
          id: 'i1',
          text: 'Head toward Gate 8',
          distance: 180,
          type: 'straight' as const,
          coordinate: { latitude: 24.9, longitude: 67.1 },
        },
        {
          id: 'i2',
          text: 'Arrive at Gate 8',
          distance: 0,
          type: 'arrival' as const,
          coordinate: { latitude: 24.903, longitude: 67.103 },
        },
      ],
    };

    useAppStore.setState({
      routePlannerDest: destination,
      activeRoute: previewRoute as any,
      currentLocation: { latitude: 24.9, longitude: 67.1 },
    });

    await render(<HomeScreen />);

    const startButton = await screen.findByText('Start Navigation');
    await userEvent.setup().press(startButton);

    expect(useAppStore.getState().isNavigating).toBe(true);
    // v2 navigation now transforms Home's own persistent map in place instead of pushing a
    // separate Navigation screen — see docs/MAP_EXPERIENCE_AUDIT.md.
    expect(navigateSpy).not.toHaveBeenCalledWith('Navigation');
  });
});

describe('HomeScreen — Directions sheet / route-preview card mutual exclusion', () => {
  test('route-preview card stays hidden while the Directions sheet is open for the same destination', async () => {
    const destination: Place = {
      id: 'GATE_08',
      name: 'Gate 8',
      category: 'Gate',
      description: 'Official Gate 8.',
      coordinate: { latitude: 24.903, longitude: 67.103 },
      sourceVersion: 'v2',
      sourceKind: 'gate',
    } as Place;

    mockedUseHomeViewModel.mockImplementation(() => ({
      ...useFakeHomeViewModel(),
      selectedPlace: destination,
    }));

    mockedUseDirectionsViewModel.mockReturnValue({
      route: { nodes: ['start', 'end'], coordinates: [], totalDistance: 180, estimatedTimeMin: 3 },
      startSource: 'live_gps',
      rememberedLocationAgeLabel: '',
      rememberedLocationAvailable: false,
      rememberedLocationInsideVenue: false,
      currentRouteOriginInsideVenue: true,
      loadState: 'ready',
      errorMessage: null,
      manualStart: null,
      chooseManualStart: jest.fn(),
      setIsEditingManualStart: jest.fn(),
      setManualStartPlace: jest.fn(),
      chooseCurrentLocation: jest.fn(async () => true),
      chooseRememberedLocation: jest.fn(() => true),
      calculateRoute: jest.fn(async () => {}),
      showManualStartSearch: false,
    });

    // Mirrors what DirectionsViewModel.calculateRoute() writes to the shared store the instant a
    // route resolves — which happens automatically on mount, before the user taps "Show route on
    // map" (see src/viewmodels/DirectionsViewModel.ts calculateRoute()/useEffect at the bottom).
    useAppStore.setState({
      routePlannerDest: destination,
      activeRoute: {
        nodes: ['start', 'end'],
        coordinates: [
          { latitude: 24.9, longitude: 67.1 },
          { latitude: 24.903, longitude: 67.103 },
        ],
        totalDistance: 180,
        estimatedTimeMin: 3,
        segments: [],
        startLabel: 'Current location',
        destinationLabel: 'Gate 8',
        startResolution: {
          mode: 'inside',
          coordinate: { latitude: 24.9, longitude: 67.1 },
        },
      } as any,
      currentLocation: { latitude: 24.9, longitude: 67.1 },
    });

    const user = userEvent.setup();
    await render(<HomeScreen />);

    await user.press(screen.getByText('Directions'));

    // The Directions sheet is open...
    expect(await screen.findByText('Get Directions')).toBeOnTheScreen();
    // ...so the separate bottom-pinned route-preview card must not also be visible underneath it.
    expect(screen.queryByText('Start Navigation')).not.toBeOnTheScreen();
  });
});

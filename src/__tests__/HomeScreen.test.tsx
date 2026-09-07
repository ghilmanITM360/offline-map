/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Alert, Animated, DeviceEventEmitter } from 'react-native';
import { act, fireEvent, render, screen, userEvent, waitFor } from './test-utils';

import { HomeScreen } from '../views/screens/HomeScreen';
import { useHomeViewModel } from '../viewmodels/HomeViewModel';
import { useDirectionsViewModel } from '../viewmodels/DirectionsViewModel';
import { useAppStore } from '../store/useAppStore';
import { MapConfigService } from '../services/MapConfigService';
import * as NavigationOverlayV1Module from '../viewmodels/useNavigationOverlayV1';
import type { Place } from '../models/types';

// requestAnimationFrame stays real (not faked): MapLabelOverlay's projection pipeline
// (rAF -> Promise.all(pointForCoordinate) -> setPoints, see MapLabelOverlay.tsx) schedules
// a rAF on every render. Faking it means those callbacks sit queued until some *later*
// test happens to call advanceTimersByTime/runAllTimers (recenter tests below do, for
// their own unrelated reason) — at which point every backlogged rAF fires at once and its
// promise resolves on the microtask queue right as whichever test runs next is mid-render,
// producing "not wrapped in act()" warnings and, at worst, a corrupted empty render tree
// for that unlucky next test. Real rAF fires promptly within the test that scheduled it.
jest.useFakeTimers({ doNotFake: ['requestAnimationFrame'] });

// HomeScreen's own GPS/search/map-ref orchestration lives in useHomeViewModel (already covered
// by scripts/test-*.ts for the underlying search/routing logic). We mock the hook boundary with
// a small *stateful* fake (real React state, real handlers wired to spies) so that pressing a
// filter chip or typing in the search box produces the same re-renders a real user would see —
// this keeps the test about HomeScreen's wiring, not the hook's GPS/service internals.
jest.mock('../viewmodels/HomeViewModel', () => ({
  useHomeViewModel: jest.fn(),
}));

// LocationSheet's routePreview mode has its own routing/GPS orchestration, covered by
// LocationSheet.test.tsx and the scripts/test-*.ts routing suites. Here we only care whether
// HomeScreen keeps the route-preview card and the Directions sheet mutually exclusive, so the
// hook boundary is mocked the same way LocationSheet.test.tsx does.
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
const { __getLastBottomSheetModalProps } = jest.requireMock('@gorhom/bottom-sheet') as {
  __getLastBottomSheetModalProps: () => { onChange: (index: number) => void; onDismiss: () => void };
};

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

const v1Destination: Place = {
  id: 'GATE_08',
  name: 'Gate 8',
  category: 'Gate',
  description: 'Official Gate 8.',
  coordinate: { latitude: 24.903, longitude: 67.103 },
  sourceVersion: 'v1',
};

// Real IJTEMA_DATA block B2 ("Block 2") — the only block whose `gates` array
// resolves to actual gate-typed nodes (C1-C4) via PlaceDetailService.getBlockGates,
// so it's the one block that renders a "Nearby Gates" chip row in LocationSheet.
const block2Result: Place = {
  id: 'B2',
  name: 'Block 2',
  category: 'Block',
  description: 'Block 2 — part of Karachi Ijtema ground.',
  coordinate: { latitude: 24.9685, longitude: 66.999917 },
  sourceVersion: 'v1',
};

const v1Route = {
  id: 'route-v1-marker-policy',
  nodes: ['A', 'B'],
  coordinates: [
    { latitude: 24.9, longitude: 67.1 },
    v1Destination.coordinate,
  ],
  totalDistance: 300,
  estimatedTimeMin: 5,
  segments: [],
};

const v2ArrivalRoute = {
  id: 'route-v2-arrival-marker-policy',
  routeId: 'route-v2-arrival-marker-policy',
  sourceVersion: 'v2' as const,
  nodes: ['A', 'B'],
  coordinates: [
    { latitude: 24.9, longitude: 67.1 },
    gateResult.coordinate,
  ],
  totalDistance: 300,
  totalDistanceM: 300,
  estimatedTimeMin: 5,
  etaMinutes: 5,
  segments: [],
  origin: {
    coordinate: { latitude: 24.9, longitude: 67.1 },
    label: 'Current location',
    type: 'inside_snap' as const,
  },
  destination: {
    coordinate: gateResult.coordinate,
    label: gateResult.name,
    type: 'gate' as const,
    gateId: gateResult.id,
  },
  instructions: [],
  metadata: {
    startedOutside: false,
    usesOfficialGateEntry: false,
    graphVersion: 'test',
  },
};

const handleCategoryPressSpy = jest.fn();
const handleSearchSpy = jest.fn();
const handlePlaceSelectSpy = jest.fn();
const setSelectedPlaceSpy = jest.fn();
const clearSearchSpy = jest.fn();
const cancelPendingSheetPresentationSpy = jest.fn();
const cameraFollowUserSpy = jest.fn();
const cameraStopFollowingSpy = jest.fn();
const handleRecenterSpy = jest.fn();

function useFakeHomeViewModel(initialSearchResults: Place[] = []) {
  const [activeCategory, setActiveCategory] = React.useState<string | null>(null);
  const [searchQuery, setSearchQuery] = React.useState('');
  const [searchResults, setSearchResults] = React.useState<Place[]>(initialSearchResults);
  const [selectedPlace, setSelectedPlaceState] = React.useState<Place | null>(null);
  const [cameraMode, setCameraMode] = React.useState<'IDLE' | 'EXPLORING' | 'FOLLOWING_USER'>('IDLE');
  // Real useRef (matches production useHomeViewModel's own bottomSheetRef) — a fresh
  // { current: null } object literal here would be replaced every render, silently
  // discarding the mocked BottomSheetModal's imperative handle before tests can assert
  // on close()/present()/snapToIndex() call counts across a reselection sequence.
  const bottomSheetRef = React.useRef<{ present: jest.Mock; close: jest.Mock; snapToIndex: jest.Mock } | null>(null);

  // Mirrors the real useHomeViewModel.handleRecenter(), which resolves the user's location
  // and then calls cameraManager.followUser(...) — see HomeViewModel.ts.
  const handleRecenter = async () => {
    handleRecenterSpy();
    setCameraMode('FOLLOWING_USER');
    return true;
  };

  const handleCategoryPress = (category: string) => {
    handleCategoryPressSpy(category);
    setActiveCategory((prev) => (prev === category ? null : category));
  };

  const handleSearch = (text: string) => {
    handleSearchSpy(text);
    setSearchQuery(text);
    setSearchResults(text.length > 1 ? [gateResult] : []);
  };

  const handlePlaceSelect = (place: Place) => {
    handlePlaceSelectSpy(place);
    setSelectedPlaceState(place);
    setSearchQuery('');
    setSearchResults([]);
  };

  const setSelectedPlace = (place: Place | null) => {
    setSelectedPlaceSpy(place);
    setSelectedPlaceState(place);
  };

  const clearSearch = () => {
    clearSearchSpy();
    setSearchQuery('');
    setSearchResults([]);
    setActiveCategory(null);
  };

  return {
    mapRef: { current: null },
    bottomSheetRef,
    cameraManager: {
      mode: cameraMode,
      animateToUser: jest.fn(),
      animateToPlace: jest.fn(),
      fitVenueBounds: jest.fn(),
      fitRoute: jest.fn(),
      followUser: cameraFollowUserSpy,
      stopFollowing: cameraStopFollowingSpy.mockImplementation(() => setCameraMode('EXPLORING')),
      enterNavigationCamera: jest.fn(),
      exitNavigationCamera: jest.fn(),
    },
    mapType: 'standard' as const,
    searchQuery,
    searchResults,
    selectedPlace,
    suggestedPlaces: [],
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
    compassMode: 'NORTH_UP' as const,
    setIsMapReady: jest.fn(),
    handleSearch,
    handlePlaceSelect,
    directorySelectionForDirections: null,
    clearDirectorySelectionForDirections: jest.fn(),
    handleSheetIndexChange: jest.fn(),
    handleRecenter,
    handleCompassToggle: jest.fn(),
    handleZoomIn: jest.fn(),
    handleZoomOut: jest.fn(),
    handleMapRegionChangeComplete: jest.fn(),
    clearSearch,
    cancelPendingSheetPresentation: cancelPendingSheetPresentationSpy,
    handleCategoryPress,
    setSelectedPlace,
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

// Deliberately placed early in the file (not after "recenter follow mode" below): the
// "recenter" tests are the only ones in this file that call jest.advanceTimersByTime, which
// also flushes any MapLabelOverlay projection work queued by earlier tests' rAF callbacks —
// letting their promises resolve outside any test's own act() and land mid-render in
// whichever test happens to run next. Running these before "recenter" avoids that.
// Stage 4 audit — the map surface is the root, so the Android hardware back button must
// step back through MapMode one level at a time (never fall through to the drawer/stack
// while a sheet mode is open). Fires the real 'hardwareBackPress' device event (what
// BackHandler.addEventListener actually subscribes to on Android), not the on-screen Back
// icon — the SEARCH-mode on-screen button was already covered above; this is the gap.
describe('HomeScreen — hardware back button (mode-aware, Google Maps parity)', () => {
  async function pressHardwareBack() {
    await act(async () => {
      DeviceEventEmitter.emit('hardwareBackPress');
    });
  }

  test('hardware back press closes SEARCH mode', async () => {
    const user = userEvent.setup();
    await render(<HomeScreen />);

    const input = screen.getByPlaceholderText('Search blocks, rastas, gates');
    await user.type(input, '');
    expect(await screen.findByLabelText('Back')).toBeOnTheScreen();

    await pressHardwareBack();

    expect(screen.queryByLabelText('Back')).not.toBeOnTheScreen();
    expect(screen.getByLabelText('Open menu')).toBeOnTheScreen();
  });

  test('hardware back press in PLACE_SELECTED mode closes the sheet back to EXPLORE', async () => {
    const user = userEvent.setup();
    await render(<HomeScreen />);

    const input = screen.getByPlaceholderText('Search blocks, rastas, gates');
    await user.type(input, 'Gate 5');
    await user.press(await screen.findByTestId('search-result-GATE_05'));
    expect(await screen.findByText('Gate 5')).toBeOnTheScreen();

    await pressHardwareBack();

    expect(setSelectedPlaceSpy).toHaveBeenCalledWith(null);
    // "Gate 5" itself is a poor absence check — GateLayer/MapLabelOverlay render it as an
    // on-map label regardless of selection. "Official entry / exit gate" only renders inside
    // the sheet's PlaceSection, so its absence is the real signal the sheet actually closed.
    expect(screen.queryByText('Official entry / exit gate')).not.toBeOnTheScreen();
  });

  // Phase F: a Route Preview reached via a Locations Directory selection has no real "place
  // preview" step in the user's actual history (Phase B skips it programmatically) — Back
  // must return to Locations directly, not flash an unvisited place-details card. A Route
  // Preview reached by tapping the map/search keeps its existing "return to place preview"
  // behavior (see the test above), since that place preview *is* real task history there.
  test('hardware back press in ROUTE_PREVIEW mode returns to Locations when the destination came from the Locations Directory', async () => {
    const navigateSpy = jest.fn();
    useNavigation.mockReturnValue({ navigate: navigateSpy, dispatch: jest.fn(), goBack: jest.fn() });
    mockedUseHomeViewModel.mockImplementation(() => ({
      ...useFakeHomeViewModel(),
      selectedPlace: gateResult,
      directorySelectionForDirections: gateResult,
      clearDirectorySelectionForDirections: jest.fn(),
    }));
    mockedUseDirectionsViewModel.mockReturnValue({
      route: null,
      startSource: 'live_gps',
      rememberedLocationAgeLabel: '',
      rememberedLocationAvailable: false,
      rememberedLocationInsideVenue: false,
      currentRouteOriginInsideVenue: true,
      loadState: 'idle',
      errorMessage: null,
      manualStart: null,
      calculateRoute: jest.fn(async () => {}),
    });

    await render(<HomeScreen />);
    expect(await screen.findByText('Get Directions')).toBeOnTheScreen();

    await pressHardwareBack();

    expect(navigateSpy).toHaveBeenCalledWith('LocationsDirectory');
  });

  test('hardware back press in ROUTE_PREVIEW mode returns to the place preview, not exit', async () => {
    mockedUseDirectionsViewModel.mockReturnValue({
      route: null,
      startSource: 'live_gps',
      rememberedLocationAgeLabel: '',
      rememberedLocationAvailable: false,
      rememberedLocationInsideVenue: false,
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
      showManualStartSearch: false,
    });

    const user = userEvent.setup();
    await render(<HomeScreen />);

    const input = screen.getByPlaceholderText('Search blocks, rastas, gates');
    await user.type(input, 'Gate 5');
    await user.press(await screen.findByTestId('search-result-GATE_05'));
    await user.press(await screen.findByText('Directions'));
    expect(await screen.findByText('Get Directions')).toBeOnTheScreen();

    await pressHardwareBack();

    // One step back — to Gate 5's place preview, not all the way to EXPLORE — mirrors
    // exactly what the sheet's own visible "Get Directions" back chevron does.
    expect(screen.queryByText('Get Directions')).not.toBeOnTheScreen();
    expect(await screen.findByText('Gate 5')).toBeOnTheScreen();
    expect(setSelectedPlaceSpy).not.toHaveBeenCalledWith(null);
  });

  test('hardware back on a resolved ROUTE_PREVIEW asks before cancelling, then returns to the selected place', async () => {
    const previewRoute = {
      nodes: ['start', 'end'],
      coordinates: [{ latitude: 24.9, longitude: 67.1 }, gateResult.coordinate],
      totalDistance: 180,
      estimatedTimeMin: 3,
      segments: [],
      startLabel: 'Current location',
      destinationLabel: gateResult.name,
      startResolution: { mode: 'inside', coordinate: { latitude: 24.9, longitude: 67.1 } },
      instructions: [],
    };
    mockedUseDirectionsViewModel.mockReturnValue({
      route: previewRoute,
      startSource: 'live_gps',
      startSourceLabel: 'My current location',
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
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const user = userEvent.setup();
    await render(<HomeScreen />);
    const input = screen.getByPlaceholderText('Search blocks, rastas, gates');
    await user.type(input, 'Gate 5');
    await user.press(await screen.findByTestId('search-result-GATE_05'));
    await user.press(await screen.findByText('Directions'));
    await act(async () => {
      useAppStore.setState({ routePlannerDest: gateResult, activeRoute: previewRoute as any });
    });

    await pressHardwareBack();

    expect(alertSpy).toHaveBeenCalledWith('Cancel route?', expect.any(String), expect.any(Array));
    expect(useAppStore.getState().activeRoute).toBe(previewRoute);
    const confirmCancel = (alertSpy.mock.calls.at(-1)?.[2] as Array<{ text: string; onPress?: () => void }>).find(
      (button) => button.text === 'Cancel route',
    )?.onPress;
    await act(async () => confirmCancel?.());
    expect(useAppStore.getState().activeRoute).toBeNull();
    expect(screen.queryByText('Get Directions')).not.toBeOnTheScreen();
    expect(await screen.findByText('Directions')).toBeOnTheScreen();
    alertSpy.mockRestore();
  });

  test('hardware back on a resolved ROUTE_PREVIEW from a Locations Directory hand-off returns to Locations after confirming cancel', async () => {
    const navigateSpy = jest.fn();
    useNavigation.mockReturnValue({ navigate: navigateSpy, dispatch: jest.fn(), goBack: jest.fn() });
    mockedUseHomeViewModel.mockImplementation(() => ({
      ...useFakeHomeViewModel(),
      selectedPlace: gateResult,
      directorySelectionForDirections: gateResult,
      clearDirectorySelectionForDirections: jest.fn(),
    }));
    const previewRoute = {
      nodes: ['start', 'end'],
      coordinates: [{ latitude: 24.9, longitude: 67.1 }, gateResult.coordinate],
      totalDistance: 180,
      estimatedTimeMin: 3,
      segments: [],
      startLabel: 'Current location',
      destinationLabel: gateResult.name,
      startResolution: { mode: 'inside', coordinate: { latitude: 24.9, longitude: 67.1 } },
      instructions: [],
    };
    mockedUseDirectionsViewModel.mockReturnValue({
      route: previewRoute,
      startSource: 'live_gps',
      startSourceLabel: 'My current location',
      rememberedLocationAgeLabel: '',
      rememberedLocationAvailable: false,
      rememberedLocationInsideVenue: false,
      currentRouteOriginInsideVenue: true,
      loadState: 'ready',
      errorMessage: null,
      manualStart: null,
      calculateRoute: jest.fn(async () => {}),
    });
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});

    await render(<HomeScreen />);
    expect(await screen.findByText('Get Directions')).toBeOnTheScreen();
    await act(async () => {
      useAppStore.setState({ routePlannerDest: gateResult, activeRoute: previewRoute as any });
    });

    await pressHardwareBack();

    expect(navigateSpy).not.toHaveBeenCalledWith('LocationsDirectory');
    const confirmCancel = (alertSpy.mock.calls.at(-1)?.[2] as Array<{ text: string; onPress?: () => void }>).find(
      (button) => button.text === 'Cancel route',
    )?.onPress;
    await act(async () => confirmCancel?.());

    expect(navigateSpy).toHaveBeenCalledWith('LocationsDirectory');
    alertSpy.mockRestore();
  });
});

// Stage 4 audit scenario 7 — selecting a different object while the sheet is already open
// must update the same sheet in place, not close-then-reopen (flicker).
describe('HomeScreen — selection switching (Google Maps parity, no flicker)', () => {
  test('switching selected place while the sheet is open updates content directly, with no intermediate close', async () => {
    const user = userEvent.setup();
    await render(<HomeScreen />);

    const input = screen.getByPlaceholderText('Search blocks, rastas, gates');
    await user.type(input, 'Gate 5');
    await user.press(await screen.findByTestId('search-result-GATE_05'));
    expect(await screen.findByText('Gate 5')).toBeOnTheScreen();

    await user.press(screen.getByTestId('facility_marker_LM_MASJID_MAIN'));

    expect(await screen.findByText('Main Masjid')).toBeOnTheScreen();
    // "Gate 5" itself is a poor absence check — GateLayer/MapLabelOverlay render it as an
    // on-map label regardless of selection. "Official entry / exit gate" only renders inside
    // the sheet's PlaceSection, so its absence confirms the sheet content actually switched.
    expect(screen.queryByText('Official entry / exit gate')).not.toBeOnTheScreen();
    // closeSheet() is the only HomeScreen path that clears selectedPlace to null — asserting
    // it never fired proves the sheet updated in place rather than closing between taps.
    expect(setSelectedPlaceSpy).not.toHaveBeenCalledWith(null);
  });
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

    // The active chip gets bold theme.chipActiveText — real, user-visible output. Same
    // WCAG-AA-checked token pair the search-results category tile grid already used.
    await waitFor(() => {
      expect(gatesChip).toHaveStyle({ color: '#174EA6', fontWeight: '700' });
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
  test('entering search (focusing the bar) opens the full-screen MapMode.SEARCH overlay', async () => {
    await render(<HomeScreen />);

    const user = userEvent.setup();
    const input = screen.getByPlaceholderText('Search blocks, rastas, gates');
    // The top filter-chip row and the SEARCH overlay's own Categories grid both render a
    // "Gates" label — assert they never coexist before asserting on either one.
    expect(screen.getByLabelText('Open menu')).toBeOnTheScreen();
    expect(screen.queryByLabelText('Back')).not.toBeOnTheScreen();

    // type('') focuses the input the same way userEvent.type does before typing any
    // characters — TextInput has no onPress handler, so userEvent.press wouldn't focus it.
    await user.type(input, '');

    // MapMode.SEARCH: back button replaces the menu icon, and the full-screen
    // Recent/Suggestions/Categories content renders in place of the map. No voice
    // search affordance — speech recognition isn't implemented.
    expect(await screen.findByLabelText('Back')).toBeOnTheScreen();
    expect(screen.queryByLabelText('Open menu')).not.toBeOnTheScreen();
    expect(screen.queryByLabelText('Voice search')).not.toBeOnTheScreen();
    expect(screen.getByText('Categories')).toBeOnTheScreen();
    expect(screen.getByText('Gates')).toBeOnTheScreen();
  });

  test('exiting search (pressing Back) returns to MapMode.EXPLORE', async () => {
    const user = userEvent.setup();
    await render(<HomeScreen />);

    const input = screen.getByPlaceholderText('Search blocks, rastas, gates');
    await user.type(input, '');
    const backButton = await screen.findByLabelText('Back');

    await user.press(backButton);

    // Overlay content and Back/Voice icons are gone; the menu icon and filter-chip row
    // (same "Gates" label, now from the chip row instead of the category grid) are back.
    expect(screen.queryByLabelText('Back')).not.toBeOnTheScreen();
    expect(screen.queryByText('Categories')).not.toBeOnTheScreen();
    expect(screen.getByLabelText('Open menu')).toBeOnTheScreen();
    expect(screen.getByText('Gates')).toBeOnTheScreen();
  });

  test('search X clears transient query/results but keeps Search open', async () => {
    const user = userEvent.setup();
    await render(<HomeScreen />);
    const input = screen.getByPlaceholderText('Search blocks, rastas, gates');
    await user.type(input, 'Gate 5');

    await user.press(screen.getByLabelText('Clear search'));

    expect(clearSearchSpy).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText('Back')).toBeOnTheScreen();
    expect(screen.queryByTestId('search-result-GATE_05')).not.toBeOnTheScreen();
  });

  test('search Back clears query/results, result markers, and keyboard state', async () => {
    const keyboardDismissSpy = jest.spyOn(require('react-native').Keyboard, 'dismiss');
    const user = userEvent.setup();
    await render(<HomeScreen />);
    const input = screen.getByPlaceholderText('Search blocks, rastas, gates');
    await user.type(input, 'Gate 5');
    expect(await screen.findByTestId('search-map-marker-GATE_05')).toBeOnTheScreen();

    await user.press(screen.getByLabelText('Back'));

    expect(clearSearchSpy).toHaveBeenCalledTimes(1);
    expect(keyboardDismissSpy).toHaveBeenCalled();
    expect(input.props.value).toBe('');
    expect(screen.queryByTestId('search-map-marker-GATE_05')).not.toBeOnTheScreen();
  });

  test('typing in the search bar renders results', async () => {
    const user = userEvent.setup();
    await render(<HomeScreen />);

    const input = screen.getByPlaceholderText('Search blocks, rastas, gates');
    await user.type(input, 'Gate 5');

    expect(handleSearchSpy).toHaveBeenCalled();
    expect(await screen.findByTestId('search-result-GATE_05')).toBeOnTheScreen();
  });

  test('selecting a search result dismisses the overlay, selects the place, and opens LocationSheet', async () => {
    const user = userEvent.setup();
    await render(<HomeScreen />);

    const input = screen.getByPlaceholderText('Search blocks, rastas, gates');
    await user.type(input, 'Gate 5');

    const result = await screen.findByTestId('search-result-GATE_05');
    await user.press(result);

    expect(handlePlaceSelectSpy).toHaveBeenCalledWith(gateResult);

    // SEARCH overlay dismissed (MapMode.PLACE_SELECTED now, not SEARCH)...
    expect(screen.queryByLabelText('Back')).not.toBeOnTheScreen();
    expect(screen.queryByLabelText('Open menu')).not.toBeOnTheScreen();
    // ...and LocationSheet opened for the selected place — real content, not just a spy call.
    expect(await screen.findByText('Gate 5')).toBeOnTheScreen();
    expect(screen.getByText('Gate')).toBeOnTheScreen();
    expect(screen.getByText('Directions')).toBeOnTheScreen();
    expect(screen.getByText('Share')).toBeOnTheScreen();
    expect(screen.queryByPlaceholderText('Search blocks, rastas, gates')).not.toBeOnTheScreen();
    expect(screen.queryByTestId('search-map-marker-GATE_05')).not.toBeOnTheScreen();
  });

  test('selecting a map search-result marker dismisses Search before opening LocationSheet', async () => {
    const user = userEvent.setup();
    await render(<HomeScreen />);
    const input = screen.getByPlaceholderText('Search blocks, rastas, gates');
    await user.type(input, 'Gate 5');

    await user.press(await screen.findByTestId('search-map-marker-GATE_05'));

    expect(screen.queryByLabelText('Back')).not.toBeOnTheScreen();
    expect(screen.queryByPlaceholderText('Search blocks, rastas, gates')).not.toBeOnTheScreen();
    expect(screen.queryByTestId('search-map-marker-GATE_05')).not.toBeOnTheScreen();
    expect(await screen.findByText('Directions')).toBeOnTheScreen();
  });

  test('selected place owns attention until closing its sheet returns discovery chrome', async () => {
    const user = userEvent.setup();
    await render(<HomeScreen />);
    const input = screen.getByPlaceholderText('Search blocks, rastas, gates');
    await user.type(input, 'Gate 5');
    await user.press(await screen.findByTestId('search-result-GATE_05'));
    expect(screen.getByTestId('selected-place-marker')).toBeOnTheScreen();

    expect(screen.queryByPlaceholderText('Search blocks, rastas, gates')).not.toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Map layers and filters' })).not.toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Zoom in' })).not.toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Center map on my current location' })).toBeOnTheScreen();
    await act(async () => __getLastBottomSheetModalProps().onChange(1));
    await act(async () => {
      __getLastBottomSheetModalProps().onChange(-1);
      __getLastBottomSheetModalProps().onDismiss();
    });
    await user.type(screen.getByPlaceholderText('Search blocks, rastas, gates'), '');
    await user.press(await screen.findByLabelText('Back'));

    expect(setSelectedPlaceSpy).toHaveBeenCalledWith(null);
    expect(screen.queryByTestId('selected-place-marker')).not.toBeOnTheScreen();
    expect(screen.queryByText('Official entry / exit gate')).not.toBeOnTheScreen();
  });

  test('rapid open/cancel cycles never resurrect transient results', async () => {
    const user = userEvent.setup();
    await render(<HomeScreen />);
    const input = screen.getByPlaceholderText('Search blocks, rastas, gates');
    await user.type(input, 'Gate 5');
    await user.press(screen.getByLabelText('Back'));
    await user.type(input, '');
    await user.press(screen.getByLabelText('Back'));

    expect(screen.queryByLabelText('Back')).not.toBeOnTheScreen();
    expect(screen.queryByTestId('search-map-marker-GATE_05')).not.toBeOnTheScreen();
    expect(input.props.value).toBe('');
  });

  test('reopening Search keeps recent history while transient results stay cleared', async () => {
    mockedUseHomeViewModel.mockImplementation(() => ({ ...useFakeHomeViewModel(), recentSearches: [gateResult] }));
    const user = userEvent.setup();
    await render(<HomeScreen />);
    const input = screen.getByPlaceholderText('Search blocks, rastas, gates');
    await user.type(input, 'Gate 5');
    await user.press(screen.getByLabelText('Back'));
    await user.type(input, '');

    expect(await screen.findByText('Recent')).toBeOnTheScreen();
    expect(screen.getByTestId('search-result-GATE_05')).toBeOnTheScreen();
    expect(input.props.value).toBe('');
  });

  test('dismissing and reopening Search does not retain a stale category selection or empty state', async () => {
    const user = userEvent.setup();
    await render(<HomeScreen />);
    const input = screen.getByPlaceholderText('Search blocks, rastas, gates');

    await user.type(input, '');
    await user.press(screen.getByRole('button', { name: 'Gates' }));
    expect(screen.getByRole('button', { name: 'Gates' }).props.accessibilityState).toMatchObject({ selected: true });
    await user.press(screen.getByLabelText('Back'));
    await user.type(input, '');

    expect(screen.getByRole('button', { name: 'Gates' }).props.accessibilityState).toMatchObject({ selected: false });
    expect(screen.queryByText('No places in this category.')).not.toBeOnTheScreen();
  });
});

describe('HomeScreen — search-result marker mode policy', () => {
  function useHomeWithInitialResults() {
    return useFakeHomeViewModel([gateResult]);
  }

  function startV1Navigation(currentLocation: { latitude: number; longitude: number }) {
    useAppStore.getState().setCurrentLocation(currentLocation, 'gps');
    useAppStore.getState().startNavigation(v1Destination, v1Route as any, []);
  }

  function startArrivedV2Navigation() {
    useAppStore.getState().setCurrentLocation({ ...gateResult.coordinate, accuracy: 5 }, 'gps');
    useAppStore.getState().startNavigation(gateResult, v2ArrivalRoute, []);
  }

  test('Explore with current results renders their map pins', async () => {
    mockedUseHomeViewModel.mockImplementation(useHomeWithInitialResults);
    await render(<HomeScreen />);

    expect(screen.getByTestId('search-map-marker-GATE_05')).toBeOnTheScreen();
  });

  test('route preview keeps result pins cleared by destination selection', async () => {
    mockedUseHomeViewModel.mockImplementation(useHomeWithInitialResults);
    mockedUseDirectionsViewModel.mockReturnValue({
      route: null,
      startSource: 'live_gps',
      rememberedLocationAgeLabel: '',
      rememberedLocationAvailable: false,
      rememberedLocationInsideVenue: false,
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
      showManualStartSearch: false,
    });
    const user = userEvent.setup();
    await render(<HomeScreen />);
    await user.press(screen.getByTestId('facility_marker_LM_MASJID_MAIN'));
    await user.press(await screen.findByText('Directions'));

    expect(await screen.findByText('Get Directions')).toBeOnTheScreen();
    expect(screen.queryByTestId('search-map-marker-GATE_05')).not.toBeOnTheScreen();
  });

  test('navigation hides result pins', async () => {
    mockedUseHomeViewModel.mockImplementation(useHomeWithInitialResults);
    startV1Navigation(v1Route.coordinates[0]);
    await render(<HomeScreen />);

    expect(await screen.findByTestId('nav-exit-button')).toBeOnTheScreen();
    expect(screen.queryByTestId('search-map-marker-GATE_05')).not.toBeOnTheScreen();
  });

  test('Arrival hides result pins and Done clears them before returning to Explore', async () => {
    mockedUseHomeViewModel.mockImplementation(useHomeWithInitialResults);
    startArrivedV2Navigation();
    const user = userEvent.setup();
    await render(<HomeScreen />);

    const done = await screen.findByTestId('nav-arrived-done-button');
    expect(screen.queryByTestId('search-map-marker-GATE_05')).not.toBeOnTheScreen();
    await user.press(done);

    await waitFor(() => expect(clearSearchSpy).toHaveBeenCalled());
    expect(screen.queryByTestId('search-map-marker-GATE_05')).not.toBeOnTheScreen();
    await user.type(screen.getByPlaceholderText('Search blocks, rastas, gates'), '');
    expect(screen.queryByTestId('search-map-marker-GATE_05')).not.toBeOnTheScreen();
  });
});

describe('HomeScreen — canonical bottom-sheet dismissal', () => {
  async function selectGate() {
    const user = userEvent.setup();
    const input = screen.getByPlaceholderText('Search blocks, rastas, gates');
    await user.type(input, 'Gate 5');
    await user.press(await screen.findByTestId('search-result-GATE_05'));
    return user;
  }

  async function dismissSheet() {
    const sheetProps = __getLastBottomSheetModalProps();
    await act(async () => {
      sheetProps.onChange(-1);
      sheetProps.onDismiss();
    });
    await waitFor(() => expect(cancelPendingSheetPresentationSpy).toHaveBeenCalled());
  }

  // Models the native confirmation that a present()/snapToIndex() call actually landed
  // (BottomSheetModal reporting an open index) — the real-world event the P0 fix's
  // pendingNativeSheetEchoRef waits for before treating a later dismiss as genuine. Real
  // native round-trips are async; this mock fires nothing on its own, so any test whose
  // dismiss is meant to be a *real* user pan-down (not a same-sheet-replacement echo)
  // must call this first, exactly as a real device would eventually confirm it.
  async function settleSheet(index = 1) {
    const sheetProps = __getLastBottomSheetModalProps();
    await act(async () => {
      sheetProps.onChange(index);
    });
  }

  test('pan-down preview dismissal clears selection, marker, and pending presentation', async () => {
    await render(<HomeScreen />);
    await selectGate();
    await settleSheet();
    expect(screen.getByTestId('selected-place-marker')).toBeOnTheScreen();

    await dismissSheet();

    expect(setSelectedPlaceSpy).toHaveBeenCalledWith(null);
    expect(cancelPendingSheetPresentationSpy).toHaveBeenCalled();
    await waitFor(() => {
      expect(screen.queryByTestId('selected-place-marker')).not.toBeOnTheScreen();
    });
  });

  test('pan-down details dismissal clears DETAILS instead of leaving hidden state', async () => {
    await render(<HomeScreen />);
    const user = await selectGate();
    await settleSheet();
    await user.press(screen.getByText('Details'));
    expect(screen.getByLabelText('Back')).toBeOnTheScreen();

    await dismissSheet();

    expect(screen.queryByLabelText('Back')).not.toBeOnTheScreen();
    expect(setSelectedPlaceSpy).toHaveBeenCalledWith(null);
  });

  test('DETAILS hides discovery until sheet dismissal restores category selection', async () => {
    await render(<HomeScreen />);
    const user = await selectGate();
    await user.press(screen.getByText('Details'));
    expect(screen.getByLabelText('Back')).toBeOnTheScreen();

    expect(screen.queryByLabelText('Gates')).not.toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Center map on my current location' })).not.toBeOnTheScreen();
    await settleSheet(2);
    await dismissSheet();
    await user.press(screen.getByLabelText('Gates'));

    expect(setSelectedPlaceSpy).toHaveBeenCalledWith(null);
    expect(screen.queryByLabelText('Back')).not.toBeOnTheScreen();
    expect(screen.queryByTestId('selected-place-marker')).not.toBeOnTheScreen();
  });

  test('pan-down route-preview dismissal clears planner and returns to Explore', async () => {
    mockedUseDirectionsViewModel.mockReturnValue({
      route: null,
      startSource: 'live_gps',
      rememberedLocationAgeLabel: '',
      rememberedLocationAvailable: false,
      rememberedLocationInsideVenue: false,
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
      showManualStartSearch: false,
    });
    await render(<HomeScreen />);
    const user = await selectGate();
    await user.press(screen.getByText('Directions'));
    // The Directions tap re-presents the sheet under a new (route:) identity — model
    // that the replacement has genuinely landed before treating the coming dismiss as
    // a real user pan-down rather than the tap's own transient close echo.
    await settleSheet();
    await act(async () => {
      useAppStore.setState({ routePlannerDest: gateResult });
    });

    await dismissSheet();

    expect(useAppStore.getState().routePlannerDest).toBeNull();
    expect(setSelectedPlaceSpy).toHaveBeenCalledWith(null);
    expect(screen.queryByText('Get Directions')).not.toBeOnTheScreen();
  });

  test('programmatic close during Start Navigation does not clear the active route', async () => {
    const destination = gateResult;
    const previewRoute = {
      nodes: ['start', 'end'],
      coordinates: [
        { latitude: 24.9, longitude: 67.1 },
        destination.coordinate,
      ],
      totalDistance: 180,
      estimatedTimeMin: 3,
      segments: [],
      startLabel: 'Current location',
      destinationLabel: destination.name,
      startResolution: { mode: 'inside', coordinate: { latitude: 24.9, longitude: 67.1 } },
      instructions: [],
    };
    mockedUseHomeViewModel.mockImplementation(() => ({ ...useFakeHomeViewModel(), selectedPlace: destination }));
    mockedUseDirectionsViewModel.mockReturnValue({
      route: previewRoute,
      startSource: 'live_gps',
      startSourceLabel: 'My current location',
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
    useAppStore.setState({ routePlannerDest: destination, activeRoute: previewRoute as any, currentLocation: { latitude: 24.9, longitude: 67.1 } });
    await render(<HomeScreen />);

    await userEvent.setup().press(await screen.findByText('Start Navigation'));
    await act(async () => {
      __getLastBottomSheetModalProps().onDismiss();
    });

    expect(useAppStore.getState().isNavigating).toBe(true);
    expect(useAppStore.getState().activeRoute).not.toBeNull();
  });

  test('Cancel Route confirmation clears the resolved preview and returns to the selected place', async () => {
    const destination = gateResult;
    const previewRoute = {
      nodes: ['start', 'end'],
      coordinates: [
        { latitude: 24.9, longitude: 67.1 },
        destination.coordinate,
      ],
      totalDistance: 180,
      estimatedTimeMin: 3,
      segments: [],
      startLabel: 'Current location',
      destinationLabel: destination.name,
      startResolution: { mode: 'inside', coordinate: { latitude: 24.9, longitude: 67.1 } },
      instructions: [],
    };
    mockedUseDirectionsViewModel.mockReturnValue({
      route: previewRoute,
      startSource: 'live_gps',
      startSourceLabel: 'My current location',
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
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    await render(<HomeScreen />);
    const user = await selectGate();
    await user.press(screen.getByText('Directions'));
    await act(async () => {
      useAppStore.setState({
        routePlannerDest: destination,
        activeRoute: previewRoute as any,
        currentLocation: { latitude: 24.9, longitude: 67.1 },
      });
    });
    expect(await screen.findByText('Cancel Route')).toBeOnTheScreen();

    await user.press(screen.getByText('Cancel Route'));
    const confirmCancel = (alertSpy.mock.calls.at(-1)?.[2] as Array<{ text: string; onPress?: () => void }>).find(
      (button) => button.text === 'Cancel route',
    )?.onPress;
    await act(async () => confirmCancel?.());

    expect(useAppStore.getState().routePlannerDest).toBeNull();
    expect(useAppStore.getState().activeRoute).toBeNull();
    expect(screen.queryByText('Get Directions')).not.toBeOnTheScreen();
    expect(await screen.findByText('Directions')).toBeOnTheScreen();
    alertSpy.mockRestore();
  });

  test('stale dismissal from a previous selection does not clear rapid replacement', async () => {
    await render(<HomeScreen />);
    const user = await selectGate();
    const selectionASheetProps = __getLastBottomSheetModalProps();
    await act(async () => {
      selectionASheetProps.onChange(-1);
    });
    await user.press(screen.getByTestId('facility_marker_LM_MASJID_MAIN'));
    expect(await screen.findByText('Main Masjid')).toBeOnTheScreen();

    await act(async () => {
      selectionASheetProps.onDismiss();
    });

    expect(screen.getByText('Main Masjid')).toBeOnTheScreen();
    expect(screen.getByTestId('selected-place-marker')).toBeOnTheScreen();
  });

  test('repeated onDismiss calls are idempotent', async () => {
    await render(<HomeScreen />);
    await selectGate();
    await settleSheet();
    const sheetProps = __getLastBottomSheetModalProps();
    await act(async () => {
      sheetProps.onChange(-1);
      sheetProps.onDismiss();
      sheetProps.onDismiss();
    });

    expect(setSelectedPlaceSpy.mock.calls.filter(([place]) => place === null)).toHaveLength(1);
  });

  // ── P0 regression coverage: BottomSheet identity-transition race ──────────────────
  // The sheet's programmatic-dismiss guard used to compare two independently-captured
  // identity snapshots (the FROM identity at arm time vs. whatever was "current" when
  // the native echo happened to arrive). Once a synchronous identity-changing state
  // update outran the async native echo, those two snapshots silently stopped meaning
  // the same thing, and a same-sheet transient echo could wipe out state that had
  // already moved on. Each test below reproduces one such transition with the echo
  // deliberately arriving *after* the identity change has already committed — the
  // "late echo" ordering the old mechanism got wrong.
  const directionsIdleViewModel = () => ({
    route: null,
    startSource: 'live_gps' as const,
    rememberedLocationAgeLabel: '',
    rememberedLocationAvailable: false,
    rememberedLocationInsideVenue: false,
    currentRouteOriginInsideVenue: true,
    loadState: 'idle' as const,
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

  test('Directions from DETAILS immediately gives route preview ownership before the native snap echo', async () => {
    mockedUseDirectionsViewModel.mockReturnValue(directionsIdleViewModel());
    await render(<HomeScreen />);
    const user = await selectGate();
    await user.press(screen.getByText('Details'));
    await settleSheet(2);
    await user.press(screen.getByText('Directions'));

    expect(await screen.findByText('Get Directions')).toBeOnTheScreen();
    expect(screen.queryByPlaceholderText('Search blocks, rastas, gates')).not.toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Zoom in' })).not.toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Center map on my current location' })).toBeOnTheScreen();
  });

  // NEW UX Phase B: a Locations Directory selection must auto-route straight to Directions
  // — no manual "Directions" tap. directorySelectionForDirections is the one-shot signal
  // HomeViewModel raises for exactly that hand-off (see HomeViewModel.test.tsx); this checks
  // HomeScreen actually consumes it by opening Directions itself and then clearing it.
  test('a Locations Directory hand-off auto-opens Directions without a manual tap', async () => {
    const clearDirectorySelectionForDirections = jest.fn();
    mockedUseHomeViewModel.mockImplementation(() => ({
      ...useFakeHomeViewModel(),
      selectedPlace: gateResult,
      directorySelectionForDirections: gateResult,
      clearDirectorySelectionForDirections,
    }));
    mockedUseDirectionsViewModel.mockReturnValue(directionsIdleViewModel());

    await render(<HomeScreen />);

    expect(await screen.findByText('Get Directions')).toBeOnTheScreen();
    expect(clearDirectorySelectionForDirections).toHaveBeenCalled();
  });

  test('P0-1: late dismiss echo from Open Directions arriving after the place->route identity switch does not clear the route', async () => {
    mockedUseDirectionsViewModel.mockReturnValue(directionsIdleViewModel());
    await render(<HomeScreen />);
    const user = await selectGate();
    await settleSheet();

    await user.press(screen.getByText('Directions'));
    expect(await screen.findByText('Get Directions')).toBeOnTheScreen();
    // The transient echo produced by re-presenting the sheet under the new "route:"
    // identity arrives only now — after setDirectionsDestination has already
    // committed and currentSheetIdentityRef already reflects "route:GATE_05".
    const sheetProps = __getLastBottomSheetModalProps();
    await act(async () => {
      sheetProps.onChange(-1);
      sheetProps.onDismiss();
    });

    expect(screen.getByText('Get Directions')).toBeOnTheScreen();
    expect(setSelectedPlaceSpy).not.toHaveBeenCalledWith(null);
  });

  test('P0-3: late dismiss echo arriving after a rapid reselection has already committed does not clear the newer selection', async () => {
    await render(<HomeScreen />);
    const user = await selectGate();
    const sheetProps = __getLastBottomSheetModalProps();
    // No settle and no onChange(-1) yet — Gate 5's own native echo has not arrived at
    // all when the user immediately taps a different object (unlike the existing
    // "stale dismissal from a previous selection" test above, which fires onChange(-1)
    // *before* the reselection and was already safe under the old mechanism).
    await user.press(screen.getByTestId('facility_marker_LM_MASJID_MAIN'));
    expect(await screen.findByText('Main Masjid')).toBeOnTheScreen();

    await act(async () => {
      sheetProps.onChange(-1);
      sheetProps.onDismiss();
    });

    expect(screen.getByText('Main Masjid')).toBeOnTheScreen();
    expect(screen.getByTestId('selected-place-marker')).toBeOnTheScreen();
    expect(setSelectedPlaceSpy).not.toHaveBeenCalledWith(null);
  });

  test('P0-4: late dismiss echo arriving after selecting a nearby gate from Block details does not clear the gate', async () => {
    // Block 2 is seeded directly as the selected place (the fake hook's handleSearch
    // always returns a single fixed gate result regardless of query text, so it can't
    // be used to search this block into view) — onSelectGate's identity-changing
    // handlePlaceSelectWithCameraIntent call is what's under test, not how Block 2
    // itself got selected.
    mockedUseHomeViewModel.mockImplementation(() => ({ ...useFakeHomeViewModel(), selectedPlace: block2Result }));
    const user = userEvent.setup();
    await render(<HomeScreen />);
    expect(await screen.findByText('Block 2')).toBeOnTheScreen();
    const sheetProps = __getLastBottomSheetModalProps();

    await user.press(await screen.findByLabelText('Gate C1'));

    await act(async () => {
      sheetProps.onChange(-1);
      sheetProps.onDismiss();
    });

    expect(screen.getByTestId('selected-place-marker')).toBeOnTheScreen();
    expect(setSelectedPlaceSpy).not.toHaveBeenCalledWith(null);
  });
});

describe('HomeScreen — navigation completion cleanup', () => {
  test('ending navigation clears selected-place state before Explore can revive its marker', async () => {
    const user = userEvent.setup();
    await render(<HomeScreen />);
    const input = screen.getByPlaceholderText('Search blocks, rastas, gates');
    await user.type(input, 'Gate 5');
    await user.press(await screen.findByTestId('search-result-GATE_05'));
    expect(screen.getByTestId('selected-place-marker')).toBeOnTheScreen();

    await act(async () => useAppStore.setState({ isNavigating: true }));
    await act(async () => useAppStore.getState().stopNavigation());

    expect(screen.queryByTestId('selected-place-marker')).not.toBeOnTheScreen();
    expect(setSelectedPlaceSpy).toHaveBeenCalledWith(null);
  });

  test('v1 completion swaps the navigation marker set for one clean Explore user marker', async () => {
    const user = userEvent.setup();
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    useAppStore.getState().setCurrentLocation({ ...v1Route.coordinates[0], accuracy: 12 }, 'gps');
    await render(<HomeScreen />);
    const input = screen.getByPlaceholderText('Search blocks, rastas, gates');
    await user.type(input, 'Gate 5');
    await user.press(await screen.findByTestId('search-result-GATE_05'));

    await act(async () => {
      useAppStore.getState().startNavigation(v1Destination, v1Route as any, []);
    });
    expect(await screen.findByTestId('navigation-user-location-marker')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Zoom in' })).not.toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Map layers and filters' })).not.toBeOnTheScreen();
    expect(screen.getAllByTestId('navigation-start-marker')).toHaveLength(1);
    expect(screen.getAllByTestId('navigation-destination-marker')).toHaveLength(1);
    expect(screen.queryByTestId('browse-user-location-marker')).not.toBeOnTheScreen();
    expect(screen.queryByTestId('browse-user-accuracy-circle')).not.toBeOnTheScreen();
    expect(screen.queryByTestId('selected-place-marker')).not.toBeOnTheScreen();

    await user.press(screen.getByTestId('nav-exit-button'));
    const confirmExit = (alertSpy.mock.calls.at(-1)?.[2] as Array<{ text: string; onPress?: () => void }>).find(
      (button) => button.text === 'Exit',
    )?.onPress;
    await act(async () => confirmExit?.());

    await waitFor(() => expect(screen.queryByTestId('navigation-user-location-marker')).not.toBeOnTheScreen());
    expect(screen.queryByTestId('navigation-start-marker')).not.toBeOnTheScreen();
    expect(screen.queryByTestId('navigation-destination-marker')).not.toBeOnTheScreen();
    expect(screen.getAllByTestId('browse-user-location-marker')).toHaveLength(1);
    expect(screen.getAllByTestId('browse-user-accuracy-circle')).toHaveLength(1);
    expect(screen.queryByTestId('selected-place-marker')).not.toBeOnTheScreen();
    alertSpy.mockRestore();
  });

  test('confirmed Exit permits selecting a fresh destination and opening a new route preview', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    mockedUseDirectionsViewModel.mockReturnValue({
      route: null,
      startSource: 'live_gps',
      rememberedLocationAgeLabel: '',
      rememberedLocationAvailable: false,
      rememberedLocationInsideVenue: false,
      currentRouteOriginInsideVenue: true,
      loadState: 'loading',
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
    useAppStore.getState().setCurrentLocation({ ...v1Route.coordinates[0], accuracy: 12 }, 'gps');
    useAppStore.getState().startNavigation(v1Destination, v1Route as any, []);
    const user = userEvent.setup();
    await render(<HomeScreen />);

    await user.press(await screen.findByTestId('nav-exit-button'));
    const confirmExit = (alertSpy.mock.calls.at(-1)?.[2] as Array<{ text: string; onPress?: () => void }>).find(
      (button) => button.text === 'Exit',
    )?.onPress;
    await act(async () => confirmExit?.());

    const input = await screen.findByPlaceholderText('Search blocks, rastas, gates');
    await user.type(input, 'Gate 5');
    await user.press(await screen.findByTestId('search-result-GATE_05'));
    await user.press(await screen.findByText('Directions'));

    expect(await screen.findByText('Get Directions')).toBeOnTheScreen();
    expect(screen.queryByTestId('nav-exit-button')).not.toBeOnTheScreen();
    alertSpy.mockRestore();
  });
});

describe('HomeScreen — canonical navigation pan ownership', () => {
  test('manual pan disables the active v1 overlay follow state', async () => {
    const setIsAutoFollowing = jest.fn();
    const overlaySpy = jest.spyOn(NavigationOverlayV1Module, 'useNavigationOverlayV1').mockReturnValue({
      active: true,
      route: null,
      arrived: false,
      snappedLocation: null,
      mapLayers: { venueBoundary: [], blocks: [], edges: [] },
      setIsAutoFollowing,
    } as unknown as ReturnType<typeof NavigationOverlayV1Module.useNavigationOverlayV1>);
    await render(<HomeScreen />);

    await fireEvent(screen.getByTestId('home-map-view'), 'panDrag');

    expect(setIsAutoFollowing).toHaveBeenCalledWith(false);
    overlaySpy.mockRestore();
  });
});

describe('HomeScreen — v1 Arrival marker fallback', () => {
  test('renders one browse user fallback with accuracy and one v1 destination when snapped location is unavailable', async () => {
    useAppStore.getState().setCurrentLocation({ latitude: 24.902, longitude: 67.102, accuracy: 12 }, 'gps');
    const overlaySpy = jest.spyOn(NavigationOverlayV1Module, 'useNavigationOverlayV1').mockReturnValue({
      active: true,
      route: v1Route,
      destination: v1Destination,
      instructions: [],
      currentStepIndex: 0,
      isMuted: false,
      setIsMuted: jest.fn(),
      remainingDistance: 0,
      arrived: true,
      reroutePending: false,
      isWeakGps: false,
      rerouteStatusMessage: null,
      snappedLocation: null,
      mapLayers: {
        venueBoundary: [
          { latitude: 24.89, longitude: 67.09 },
          { latitude: 24.91, longitude: 67.11 },
        ],
        blocks: [],
        edges: [],
      },
      userPulseAnim: new Animated.Value(0),
      currentLocationSource: 'gps',
      settings: {
        distanceUnit: 'meters',
        keepNorthFixed: false,
        voiceInstructions: true,
        walkingSpeed: 1.4,
        autoReroute: true,
      },
      graphOnlyFallbackUsed: false,
      requestNavigationExit: jest.fn(),
      completeArrivalNavigation: jest.fn(),
      setIsAutoFollowing: jest.fn(),
      bottomBarHeight: 0,
      setBottomBarHeight: jest.fn(),
    } as unknown as ReturnType<typeof NavigationOverlayV1Module.useNavigationOverlayV1>);

    await render(<HomeScreen />);

    expect(screen.getAllByTestId('browse-user-location-marker')).toHaveLength(1);
    expect(screen.getAllByTestId('browse-user-accuracy-circle')).toHaveLength(1);
    expect(screen.queryByTestId('navigation-user-location-marker')).not.toBeOnTheScreen();
    expect(screen.queryByTestId('navigation-start-marker')).not.toBeOnTheScreen();
    expect(screen.getAllByTestId('navigation-destination-marker')).toHaveLength(1);
    expect(screen.queryByTestId('selected-place-marker')).not.toBeOnTheScreen();

    expect(screen.queryByPlaceholderText('Search blocks, rastas, gates')).not.toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Map layers and filters' })).not.toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Zoom in' })).not.toBeOnTheScreen();
    expect(screen.queryByTestId('navigation-top-stack-v1')).not.toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Done, return to map' })).toBeOnTheScreen();

    overlaySpy.mockRestore();
  });
});

describe('HomeScreen — resolved base-map rendering', () => {
  function useDownloadedTilesViewModel() {
    return { ...useFakeHomeViewModel(), isOffline: false, offlineData: { isDownloaded: true } };
  }

  beforeEach(() => {
    useAppStore.setState({ offlineMapStatus: 'downloaded' });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('online missing-key state renders one LocalTile fallback', async () => {
    mockedUseHomeViewModel.mockImplementation(useDownloadedTilesViewModel);
    await render(<HomeScreen />);

    expect(screen.getAllByTestId('local-base-map-tiles')).toHaveLength(1);
    expect(screen.getByTestId('home-map-view').props.mapType).toBe('none');
  });

  test('online Google map renders without LocalTile conflict', async () => {
    jest.spyOn(MapConfigService, 'getRuntimeStatus').mockReturnValue({
      keyPresent: true,
      packageName: 'com.test',
      platform: 'android',
      source: 'env',
    });
    mockedUseHomeViewModel.mockImplementation(useDownloadedTilesViewModel);
    await render(<HomeScreen />);

    expect(screen.queryByTestId('local-base-map-tiles')).not.toBeOnTheScreen();
    expect(screen.getByTestId('home-map-view').props.mapType).toBe('standard');
    expect(screen.getByTestId('home-map-view').props.provider).toBe('google');
  });

  test('Google load watchdog switches once to one LocalTile fallback', async () => {
    jest.spyOn(MapConfigService, 'getRuntimeStatus').mockReturnValue({
      keyPresent: true,
      packageName: 'com.test',
      platform: 'android',
      source: 'env',
    });
    mockedUseHomeViewModel.mockImplementation(useDownloadedTilesViewModel);
    await render(<HomeScreen />);

    await act(async () => {
      jest.advanceTimersByTime(7_100);
    });

    expect(screen.getAllByTestId('local-base-map-tiles')).toHaveLength(1);
    expect(screen.getByTestId('home-map-view').props.mapType).toBe('none');
  });

  test('late Google map-loaded event cannot replace watchdog LocalTile fallback', async () => {
    jest.spyOn(MapConfigService, 'getRuntimeStatus').mockReturnValue({
      keyPresent: true,
      packageName: 'com.test',
      platform: 'android',
      source: 'env',
    });
    mockedUseHomeViewModel.mockImplementation(useDownloadedTilesViewModel);
    await render(<HomeScreen />);

    await act(async () => {
      jest.advanceTimersByTime(7_100);
    });
    const map = screen.getByTestId('home-map-view');
    expect(screen.getAllByTestId('local-base-map-tiles')).toHaveLength(1);
    expect(map.props.mapType).toBe('none');

    await act(async () => {
      map.props.onMapLoaded();
    });

    expect(screen.getAllByTestId('local-base-map-tiles')).toHaveLength(1);
    expect(screen.getByTestId('home-map-view').props.mapType).toBe('none');
  });

  test.each(['corrupt', 'needs_update'] as const)('%s tiles stay graph-only', async (offlineMapStatus) => {
    useAppStore.setState({ offlineMapStatus });
    mockedUseHomeViewModel.mockImplementation(useDownloadedTilesViewModel);
    await render(<HomeScreen />);

    expect(screen.queryByTestId('local-base-map-tiles')).not.toBeOnTheScreen();
    expect(screen.getByText(MapConfigService.getMissingGoogleMapsMessage())).toBeOnTheScreen();
  });

  test('returning online replaces LocalTile with Google without duplicate rendering', async () => {
    jest.spyOn(MapConfigService, 'getRuntimeStatus').mockReturnValue({
      keyPresent: true,
      packageName: 'com.test',
      platform: 'android',
      source: 'env',
    });
    useAppStore.setState({ hasInternet: false });
    mockedUseHomeViewModel.mockImplementation(() => {
      const home = useFakeHomeViewModel();
      const hasInternet = useAppStore((state) => state.hasInternet);
      return { ...home, isOffline: !hasInternet, offlineData: { isDownloaded: true } };
    });
    await render(<HomeScreen />);
    expect(screen.getAllByTestId('local-base-map-tiles')).toHaveLength(1);

    await act(async () => {
      useAppStore.setState({ hasInternet: true });
    });

    expect(screen.queryByTestId('local-base-map-tiles')).not.toBeOnTheScreen();
    expect(screen.getByTestId('home-map-view').props.mapType).toBe('standard');
  });
});

describe('HomeScreen — facility markers (Google Maps POI parity)', () => {
  // P0-1: facilities (masjid, food, water, medical, parking, terminals, help) are real,
  // tappable map objects — not search-only — and route through the exact same
  // handlePlaceSelect -> LocationSheet -> Directions chain as blocks/gates.
  test('a known facility (Main Masjid) renders as a tappable map marker', async () => {
    await render(<HomeScreen />);

    expect(screen.getByTestId('facility_marker_LM_MASJID_MAIN')).toBeOnTheScreen();
  });

  test('tapping a facility marker selects it and opens LocationSheet', async () => {
    const user = userEvent.setup();
    await render(<HomeScreen />);

    await user.press(screen.getByTestId('facility_marker_LM_MASJID_MAIN'));

    expect(handlePlaceSelectSpy).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'LM_MASJID_MAIN', name: 'Main Masjid' }),
    );
    expect(await screen.findByText('Main Masjid')).toBeOnTheScreen();
    expect(screen.getByText('Directions')).toBeOnTheScreen();
  });

  test('the facility Directions CTA opens the same route-preview flow as any other place', async () => {
    mockedUseDirectionsViewModel.mockReturnValue({
      route: null,
      startSource: 'live_gps',
      rememberedLocationAgeLabel: '',
      rememberedLocationAvailable: false,
      rememberedLocationInsideVenue: false,
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
      showManualStartSearch: false,
    });

    const user = userEvent.setup();
    await render(<HomeScreen />);

    await user.press(screen.getByTestId('facility_marker_LM_MASJID_MAIN'));
    await user.press(await screen.findByText('Directions'));

    expect(await screen.findByText('Get Directions')).toBeOnTheScreen();
  });
});

describe('HomeScreen — route preview "Start Navigation" (real handler wiring)', () => {
  test('canonical v1 Facility preview is visible and starts with Facility metadata preserved', async () => {
    const destination: Place = {
      id: 'LM_MASJID_MAIN',
      name: 'Main Masjid',
      category: 'Masjid',
      description: 'Central prayer hall for the Ijtema ground.',
      coordinate: { latitude: 24.9682, longitude: 67.003 },
      sourceVersion: 'v1',
    };
    const previewRoute = {
      id: 'v2_route_P3_P6',
      sourceVersion: 'v2' as const,
      nodes: ['P3', 'P6'],
      coordinates: [
        { latitude: 24.97, longitude: 67.0025 },
        { latitude: 24.9682, longitude: 67.003 },
      ],
      totalDistance: 200,
      estimatedTimeMin: 3,
      segments: [{ fromId: 'P3', toId: 'P6', distance: 200, isRasta: true }],
      startLabel: 'Current location',
      destinationLabel: destination.name,
      destinationEntryNodeId: 'P6',
      startResolution: { mode: 'inside' as const, coordinate: { latitude: 24.97, longitude: 67.0025 } },
      instructions: [{
        id: 'i1',
        text: 'Continue to Main Masjid',
        distance: 200,
        type: 'straight' as const,
        coordinate: { latitude: 24.97, longitude: 67.0025 },
      }],
    };
    mockedUseHomeViewModel.mockImplementation(() => ({ ...useFakeHomeViewModel(), selectedPlace: destination }));
    mockedUseDirectionsViewModel.mockReturnValue({
      route: previewRoute,
      startSource: 'live_gps',
      startSourceLabel: 'My current location',
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
    useAppStore.setState({
      routePlannerDest: destination,
      activeRoute: previewRoute,
      currentLocation: previewRoute.coordinates[0],
    });

    await render(<HomeScreen />);
    await userEvent.setup().press(await screen.findByText('Start Navigation'));

    expect(useAppStore.getState().isNavigating).toBe(true);
    expect(useAppStore.getState().activeRoute).toMatchObject({
      destination: { type: 'facility', facilityId: 'LM_MASJID_MAIN', entryNodeId: 'P6', label: 'Main Masjid' },
    });
  });

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

    // The route-preview sheet's "Start Navigation" button now lives inside LocationSheet's
    // routePreview mode (single source of truth — no separate floating card), which is
    // driven by useDirectionsViewModel. HomeScreen's own handleStartPreviewNavigation (under
    // test here) still reads the resolved route straight from the store above, independent
    // of this mock — this just needs to render the ready-state CTA.
    mockedUseDirectionsViewModel.mockReturnValue({
      route: previewRoute,
      startSource: 'live_gps',
      startSourceLabel: 'My current location',
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
      handleStartNavigation: jest.fn(),
      showManualStartSearch: false,
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

describe('HomeScreen — route preview is a single surface (P0-2 consolidation)', () => {
  test('a resolved route and its matching selected place render exactly one route-preview surface, not a duplicate', async () => {
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

    await render(<HomeScreen />);

    // LocationSheet.routePreview mode renders directly — MapMode.ROUTE_PREVIEW is the single
    // source of truth, there is no separate floating route-preview card and no intermediate
    // place-details sheet to tap "Directions" on first (see HomeScreen.routePreviewSheetDestination).
    expect(await screen.findByText('Get Directions')).toBeOnTheScreen();
    // Exactly one "Start Navigation" CTA — getByText throws if this ever matches more than
    // one element, which is what a duplicate surface would produce.
    expect(screen.getByText('Start Navigation')).toBeOnTheScreen();
    // Place-details-only content (PlaceSection, not RoutePreviewSection) must not also be
    // mounted underneath — confirms there isn't a second, duplicate sheet.
    expect(screen.queryByText('Share')).not.toBeOnTheScreen();
  });

  test('destination selected -> Directions tap -> route preview appears once -> Start Navigation works', async () => {
    const destination: Place = {
      id: 'GATE_09',
      name: 'Gate 9',
      category: 'Gate',
      description: 'Official Gate 9.',
      coordinate: { latitude: 24.904, longitude: 67.104 },
      sourceVersion: 'v2',
      sourceKind: 'gate',
    } as Place;

    mockedUseHomeViewModel.mockImplementation(() => ({
      ...useFakeHomeViewModel(),
      selectedPlace: destination,
    }));

    const previewRoute = {
      nodes: ['start', 'end'],
      coordinates: [
        { latitude: 24.9, longitude: 67.1 },
        { latitude: 24.904, longitude: 67.104 },
      ],
      totalDistance: 220,
      estimatedTimeMin: 4,
      segments: [],
      startLabel: 'Current location',
      destinationLabel: 'Gate 9',
      startResolution: { mode: 'inside', coordinate: { latitude: 24.9, longitude: 67.1 } },
      instructions: [],
    };

    mockedUseDirectionsViewModel.mockReturnValue({
      route: previewRoute,
      startSource: 'live_gps',
      startSourceLabel: 'My current location',
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
      handleStartNavigation: jest.fn(),
      showManualStartSearch: false,
    });

    useAppStore.setState({ currentLocation: { latitude: 24.9, longitude: 67.1 } });

    const user = userEvent.setup();
    await render(<HomeScreen />);

    // Bare selectedPlace, no route resolved yet — the sheet is in plain "preview" mode with
    // a "Directions" CTA, not route preview (nothing to duplicate yet).
    await user.press(screen.getByText('Directions'));

    expect(await screen.findByText('Get Directions')).toBeOnTheScreen();

    // Mirrors DirectionsViewModel.calculateRoute() writing the resolved route to the shared
    // store the instant it resolves (see src/viewmodels/DirectionsViewModel.ts) — this is what
    // makes handleStartPreviewNavigation's store read valid, and is what would otherwise risk
    // a second, duplicate route-preview surface if the sheet weren't the single source of truth.
    await act(async () => {
      useAppStore.setState({ routePlannerDest: destination, activeRoute: previewRoute as any });
    });

    expect(screen.getByText('Start Navigation')).toBeOnTheScreen();
    // Still exactly one route-preview surface, not a second one appearing alongside it.
    expect(screen.getAllByText('Get Directions')).toHaveLength(1);

    await user.press(screen.getByText('Start Navigation'));

    expect(useAppStore.getState().isNavigating).toBe(true);
  });
});

describe('HomeScreen — recenter follow mode (Google Maps parity)', () => {
  // Pressing recenter shows a brief transient "success" checkmark (see recenterState in
  // HomeScreen.tsx) before settling into the sustained "active" follow state — advance past
  // that 1200ms window so tests observe the settled state, not the momentary confirmation.
  async function pressRecenterAndSettle(user: ReturnType<typeof userEvent.setup>) {
    await user.press(screen.getByLabelText('Center map on my current location'));
    expect(handleRecenterSpy).toHaveBeenCalled();
    await act(async () => {
      jest.advanceTimersByTime(1300);
    });
  }

  test('tapping recenter resolves location, enters follow mode, and the button reflects an active state', async () => {
    const user = userEvent.setup();
    await render(<HomeScreen />);

    expect(screen.getByLabelText('Center map on my current location')).toBeOnTheScreen();

    await pressRecenterAndSettle(user);

    expect(await screen.findByLabelText('Following my current location. Tap to re-center.')).toBeOnTheScreen();
    expect(screen.queryByLabelText('Center map on my current location')).not.toBeOnTheScreen();
  });

  test('panning the map exits follow mode and the recenter button reverts to idle', async () => {
    const user = userEvent.setup();
    await render(<HomeScreen />);

    await pressRecenterAndSettle(user);
    expect(await screen.findByLabelText('Following my current location. Tap to re-center.')).toBeOnTheScreen();

    await fireEvent(screen.getByTestId('home-map-view'), 'panDrag');

    expect(cameraStopFollowingSpy).toHaveBeenCalled();
    expect(await screen.findByLabelText('Center map on my current location')).toBeOnTheScreen();
  });
});

describe('HomeScreen — offline background-map empty state', () => {
  test('"Download background map" is exposed as an accessible button', async () => {
    mockedUseHomeViewModel.mockImplementation(() => ({
      ...useFakeHomeViewModel(),
      isOffline: true,
      offlineData: { isDownloaded: false },
    }));
    await render(<HomeScreen />);

    expect(screen.getByRole('button', { name: 'Download background map' })).toBeOnTheScreen();
  });
});

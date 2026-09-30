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
import {
  MIN_TOP_VISIBLE_MAP_FOR_ROUTE_PREVIEW,
} from '../viewmodels/useOverlayInsets';
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
  __getLastBottomSheetModalProps: () => { onChange: (index: number) => void; onDismiss: () => void; snapPoints: string[] };
};

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

const handlePlaceSelectSpy = jest.fn();
const setSelectedPlaceSpy = jest.fn();
const clearSearchSpy = jest.fn();
const cancelPendingSheetPresentationSpy = jest.fn();
const cameraFollowUserSpy = jest.fn();
const cameraStopFollowingSpy = jest.fn();
const cameraFitRouteSpy = jest.fn();
const handleRecenterSpy = jest.fn();

function useFakeHomeViewModel() {
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

  const handlePlaceSelect = (place: Place) => {
    handlePlaceSelectSpy(place);
    setSelectedPlaceState(place);
  };

  const setSelectedPlace = (place: Place | null) => {
    setSelectedPlaceSpy(place);
    setSelectedPlaceState(place);
  };

  const clearSearch = () => {
    clearSearchSpy();
  };

  return {
    mapRef: { current: null },
    bottomSheetRef,
    cameraManager: {
      mode: cameraMode,
      animateToUser: jest.fn(),
      animateToPlace: jest.fn(),
      fitVenueBounds: jest.fn(),
      fitRoute: cameraFitRouteSpy,
      followUser: cameraFollowUserSpy,
      stopFollowing: cameraStopFollowingSpy.mockImplementation(() => setCameraMode('EXPLORING')),
      enterNavigationCamera: jest.fn(),
      exitNavigationCamera: jest.fn(),
      notifyNativeMapReady: jest.fn(),
      notifyMapLayout: jest.fn(),
    },
    mapType: 'standard' as const,
    selectedPlace,
    snapPoints: ['15%', '50%', '92%'],
    initialRegion: { latitude: 24.9, longitude: 67.1, latitudeDelta: 0.01, longitudeDelta: 0.01 },
    isOffline: false,
    offlineData: { isDownloaded: false },
    mapZoomLevel: 15.5,
    venueStatus: { insideVenue: false, insideBlock: null },
    compassMode: 'NORTH_UP' as const,
    setIsMapReady: jest.fn(),
    handlePlaceSelect,
    handleSheetIndexChange: jest.fn(),
    handleRecenter,
    handleCompassToggle: jest.fn(),
    handleZoomIn: jest.fn(),
    handleZoomOut: jest.fn(),
    handleMapRegionChangeComplete: jest.fn(),
    clearSearch,
    cancelPendingSheetPresentation: cancelPendingSheetPresentationSpy,
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
// BackHandler.addEventListener actually subscribes to on Android).
describe('HomeScreen — hardware back button (mode-aware, Google Maps parity)', () => {
  async function pressHardwareBack() {
    await act(async () => {
      DeviceEventEmitter.emit('hardwareBackPress');
    });
  }

  test('hardware back press in PLACE_SELECTED mode closes the sheet back to EXPLORE', async () => {
    const user = userEvent.setup();
    await render(<HomeScreen />);

    await user.press(screen.getByTestId('facility_marker_LM_GATE_MAIN_NORTH'));
    expect(await screen.findByText('Main North Gate')).toBeOnTheScreen();

    await pressHardwareBack();

    expect(setSelectedPlaceSpy).toHaveBeenCalledWith(null);
    // "Main North Gate" itself is a poor absence check — GateLayer/MapLabelOverlay render it
    // as an on-map label regardless of selection. "Official entry / exit gate" only renders
    // inside the sheet's PlaceSection, so its absence is the real signal the sheet closed.
    expect(screen.queryByText('Official entry / exit gate')).not.toBeOnTheScreen();
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
      canStartNavigation: true,
      startNavigationDisabledReason: '',
    });

    const user = userEvent.setup();
    await render(<HomeScreen />);

    await user.press(screen.getByTestId('facility_marker_LM_GATE_MAIN_NORTH'));
    await user.press(await screen.findByText('Directions'));
    expect(await screen.findByText('Get Directions')).toBeOnTheScreen();

    await pressHardwareBack();

    // One step back — to the place preview, not all the way to EXPLORE — mirrors
    // exactly what the sheet's own visible "Get Directions" back chevron does.
    expect(screen.queryByText('Get Directions')).not.toBeOnTheScreen();
    expect(await screen.findByText('Main North Gate')).toBeOnTheScreen();
    expect(setSelectedPlaceSpy).not.toHaveBeenCalledWith(null);
  });
});

describe('HomeScreen — Get Directions sheet detents (#177)', () => {
  test('route preview uses the 79% middle detent; place preview keeps 15/50/92', async () => {
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
      canStartNavigation: true,
      startNavigationDisabledReason: '',
    });
    const user = userEvent.setup();
    await render(<HomeScreen />);

    await user.press(screen.getByTestId('facility_marker_LM_GATE_MAIN_NORTH'));
    expect(__getLastBottomSheetModalProps().snapPoints).toEqual(['15%', '50%', '92%']);

    await user.press(await screen.findByText('Directions'));
    expect(await screen.findByText('Get Directions')).toBeOnTheScreen();
    expect(__getLastBottomSheetModalProps().snapPoints).toEqual(['15%', '79%', '92%']);
  });
});

// Stage 4 audit scenario 7 — selecting a different object while the sheet is already open
// must update the same sheet in place, not close-then-reopen (flicker).
describe('HomeScreen — selection switching (Google Maps parity, no flicker)', () => {
  test('switching selected place while the sheet is open updates content directly, with no intermediate close', async () => {
    const user = userEvent.setup();
    await render(<HomeScreen />);

    await user.press(screen.getByTestId('facility_marker_LM_GATE_MAIN_NORTH'));
    expect(await screen.findByText('Main North Gate')).toBeOnTheScreen();

    await user.press(screen.getByTestId('facility_marker_LM_MASJID_MAIN'));

    expect(await screen.findByText('Main Masjid')).toBeOnTheScreen();
    // "Main North Gate" itself is a poor absence check — GateLayer/MapLabelOverlay render it
    // as an on-map label regardless of selection. "Official entry / exit gate" only renders
    // inside the sheet's PlaceSection, so its absence confirms the sheet content switched.
    expect(screen.queryByText('Official entry / exit gate')).not.toBeOnTheScreen();
    // closeSheet() is the only HomeScreen path that clears selectedPlace to null — asserting
    // it never fired proves the sheet updated in place rather than closing between taps.
    expect(setSelectedPlaceSpy).not.toHaveBeenCalledWith(null);
  });
});

describe('HomeScreen — canonical bottom-sheet dismissal', () => {
  // Selects a real map object through the same universal handlePlaceSelectWithCameraIntent
  // pipeline a search result used to (Home's own search UI is gone — LocationsDirectoryScreen
  // owns discovery now), via a facility marker (always tappable, no map-projection needed).
  async function selectGate() {
    const user = userEvent.setup();
    await user.press(screen.getByTestId('facility_marker_LM_GATE_MAIN_NORTH'));
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
      canStartNavigation: true,
      startNavigationDisabledReason: '',
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
      canStartNavigation: true,
      startNavigationDisabledReason: '',
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
    canStartNavigation: true,
    startNavigationDisabledReason: '',
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

  test('P0-2: late dismiss echo from Open Directions does not clear a destination already swapped via Change Destination', async () => {
    mockedUseDirectionsViewModel.mockReturnValue(directionsIdleViewModel());
    await render(<HomeScreen />);
    const user = await selectGate();
    await settleSheet();

    await user.press(screen.getByText('Directions'));
    // Deliberately do not settle here — Open Directions' own native echo is still
    // "in flight" when Change Destination fires next, same as a user tapping through
    // before the previous transition's round-trip has confirmed.
    await user.press(await screen.findByLabelText('Change destination'));
    await user.type(
      await screen.findByPlaceholderText('Search destination: gate, rasta, block'),
      'Gate 8',
    );
    await user.press(await screen.findByLabelText('Gate 08, Gate'));
    expect(await screen.findByText('Gate 08')).toBeOnTheScreen();

    const sheetProps = __getLastBottomSheetModalProps();
    await act(async () => {
      sheetProps.onChange(-1);
      sheetProps.onDismiss();
    });

    expect(screen.getByText('Get Directions')).toBeOnTheScreen();
    expect(screen.getByText('Gate 08')).toBeOnTheScreen();
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
    await user.press(screen.getByTestId('facility_marker_LM_GATE_MAIN_NORTH'));
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
    await user.press(screen.getByTestId('facility_marker_LM_GATE_MAIN_NORTH'));

    await act(async () => {
      useAppStore.getState().startNavigation(v1Destination, v1Route as any, []);
    });
    expect(await screen.findByTestId('navigation-user-location-marker')).toBeOnTheScreen();
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

  test('Arrival Done hands the user to the Locations Directory instead of a passive map', async () => {
    const navigateSpy = jest.fn();
    useNavigation.mockReturnValue({ navigate: navigateSpy, dispatch: jest.fn(), goBack: jest.fn() });
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
      snappedLocation: v1Destination.coordinate,
      mapLayers: { venueBoundary: [], blocks: [], edges: [] },
      userPulseAnim: new Animated.Value(0),
      settings: useAppStore.getState().settings,
      graphOnlyFallbackUsed: false,
      requestNavigationExit: jest.fn(),
      completeArrivalNavigation: jest.fn(),
      setIsAutoFollowing: jest.fn(),
      bottomBarHeight: 0,
      setBottomBarHeight: jest.fn(),
    } as unknown as ReturnType<typeof NavigationOverlayV1Module.useNavigationOverlayV1>);

    await render(<HomeScreen />);
    await userEvent.setup().press(await screen.findByTestId('nav-arrived-done-button'));

    expect(navigateSpy).toHaveBeenCalledWith('LocationsDirectory');
    overlaySpy.mockRestore();
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

  test('map padding bottom inset is just the safe area with no sheet open', async () => {
    await render(<HomeScreen />);
    expect(screen.getByTestId('home-map-view').props.mapPadding.bottom).toBe(34);
  });

  test('map padding grows past the safe area to clear the sheet once a place is selected, so Google attribution stays visible (ATTR-001)', async () => {
    const user = userEvent.setup();
    await render(<HomeScreen />);
    await user.press(screen.getByTestId('facility_marker_LM_MASJID_MAIN'));
    await screen.findByText('Main Masjid');

    expect(screen.getByTestId('home-map-view').props.mapPadding.bottom).toBeGreaterThan(0);
  });

  // ATTR-001 follow-up: on-device, dragging Route Preview to its plain, always-declared
  // 92% snap point ALONE reproduced the Google logo clip — no dynamic sizing or
  // over-drag needed. @gorhom/bottom-sheet computes every snap point (declared
  // percentages included, not just content-driven dynamic sizing) as a percentage of its
  // own containerHeight, so mapLabelEdgeInsets' clamp couldn't fix this alone: it only
  // changes what we tell the Google Maps SDK is obstructed, not how tall the sheet
  // actually renders, so the SDK could still place the logo somewhere the real (taller)
  // sheet covered. `topInset` is gorhom's own mechanism for bounding this — it shrinks
  // the containerHeight every snap point is computed against, so 92% of a shrunk
  // container can never reach into the reserved band. `maxDynamicContentSize` remains a
  // backstop for the one thing topInset alone doesn't cover: content so tall its
  // dynamic-sizing detent would still exceed the shrunk container.
  test('Route Preview always leaves room for the Google logo, even at the plain 92% snap (ATTR-001 follow-up)', async () => {
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
      canStartNavigation: true,
      startNavigationDisabledReason: '',
    });
    const user = userEvent.setup();
    await render(<HomeScreen />);

    await user.press(screen.getByTestId('facility_marker_LM_MASJID_MAIN'));
    await user.press(await screen.findByText('Directions'));
    expect(await screen.findByText('Get Directions')).toBeOnTheScreen();

    const sheetProps = __getLastBottomSheetModalProps() as unknown as {
      onChange: (index: number) => void;
      topInset: number;
      maxDynamicContentSize: number;
      enableDynamicSizing: boolean;
    };
    // Route Preview hides the search bar/chip row, so the sheet's own top reservation is
    // the larger route-preview floor — no additional top overlay to add here.
    expect(sheetProps.topInset).toBe(MIN_TOP_VISIBLE_MAP_FOR_ROUTE_PREVIEW);
    expect(sheetProps.enableDynamicSizing).toBe(false);

    // Route Preview disables dynamic detent insertion, so index 2 remains the declared
    // 92% maximum and cannot be shifted by content-height changes.
    await act(async () => {
      sheetProps.onChange(2);
    });

    const mapPaddingBottom = screen.getByTestId('home-map-view').props.mapPadding.bottom;
    expect(sheetProps.maxDynamicContentSize).toBeGreaterThan(0);
    // The dynamic-content ceiling can never actually render taller than mapPadding
    // assumed it might — same shared formula (computeMaxSheetOcclusionForAttribution)
    // on both sides.
    expect(sheetProps.maxDynamicContentSize).toBe(mapPaddingBottom);
  });

  test('Route Preview camera fit does not duplicate map padding at the maximum sheet snap', async () => {
    const previewRoute = {
      sourceVersion: 'v2' as const,
      coordinates: [
        { latitude: 24.963, longitude: 67.006 },
        gateResult.coordinate,
      ],
      startResolution: {
        mode: 'inside' as const,
        coordinate: { latitude: 24.963, longitude: 67.006 },
      },
      startLabel: 'Current location',
      destinationLabel: gateResult.name,
    };
    mockedUseDirectionsViewModel.mockReturnValue({
      route: previewRoute,
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
      canStartNavigation: true,
      startNavigationDisabledReason: '',
    });
    useAppStore.setState({ routePlannerDest: gateResult, activeRoute: previewRoute as any });
    await render(<HomeScreen />);

    const sheetProps = __getLastBottomSheetModalProps() as unknown as {
      onChange: (index: number) => void;
      topInset: number;
    };
    expect(sheetProps.topInset).toBe(MIN_TOP_VISIBLE_MAP_FOR_ROUTE_PREVIEW);

    const scheduledFrames: FrameRequestCallback[] = [];
    const requestAnimationFrameSpy = jest
      .spyOn(global, 'requestAnimationFrame')
      .mockImplementation((callback) => {
        scheduledFrames.push(callback);
        return scheduledFrames.length;
      });
    cameraFitRouteSpy.mockClear();
    await act(async () => {
      sheetProps.onChange(2);
    });

    // Runtime regression: fitting in the same React commit as mapPadding changes lets
    // Android execute fitToCoordinates against the previous native base padding. After
    // maximum -> normal, one endpoint then stays behind the sheet. Defer the camera
    // command until the next rendered frame, after the native padding prop is applied.
    expect(cameraFitRouteSpy).not.toHaveBeenCalled();
    await act(async () => {
      scheduledFrames.splice(0).forEach((callback) => callback(performance.now()));
    });

    const mapPaddingBottom = screen.getByTestId('home-map-view').props.mapPadding.bottom;
    const [, edgeInsets] = cameraFitRouteSpy.mock.calls.at(-1) as [unknown, { top: number; bottom: number }];
    // react-native-maps adds fitToCoordinates edgePadding to MapView mapPadding on
    // Android. Reusing the sheet inset here double-counts the occluded area and can
    // push an endpoint out of the remaining Route Preview viewport.
    expect(mapPaddingBottom).toBeGreaterThan(edgeInsets.bottom);
    expect(edgeInsets.bottom).toBe(32);
    expect(edgeInsets.top).toBeGreaterThanOrEqual(90);
    requestAnimationFrameSpy.mockRestore();
  });

  test('online Google map renders without LocalTile conflict', async () => {
    jest.spyOn(MapConfigService, 'getRuntimeStatus').mockReturnValue({
      keyPresent: true,
      keyPreview: null,
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
      keyPreview: null,
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

  // MAPLOAD-04 (#28): a Google map that loads successfully AFTER the 7s watchdog fires
  // (slow/software-rendered device, not a real failure) must recover instead of staying
  // stuck on the LocalTile fallback for the rest of the session — see MapLoadWatchdog.ts.
  test('late Google map-loaded event recovers from watchdog LocalTile fallback', async () => {
    jest.spyOn(MapConfigService, 'getRuntimeStatus').mockReturnValue({
      keyPresent: true,
      keyPreview: null,
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

    expect(screen.queryByTestId('local-base-map-tiles')).not.toBeOnTheScreen();
    expect(screen.getByTestId('home-map-view').props.mapType).toBe('standard');
  });

  // MAPLOAD-05/07 (#28): once the app has genuinely left Google mode (offline / no key —
  // MapLoadWatchdog's INACTIVE state), a stray late onMapLoaded from an old attempt must not
  // pull the UI back into Google mode.
  test('late Google map-loaded event cannot override an offline switch away from Google', async () => {
    jest.spyOn(MapConfigService, 'getRuntimeStatus').mockReturnValue({
      keyPresent: true,
      keyPreview: null,
      packageName: 'com.test',
      platform: 'android',
      source: 'env',
    });
    useAppStore.setState({ hasInternet: true });
    mockedUseHomeViewModel.mockImplementation(() => {
      const home = useFakeHomeViewModel();
      const hasInternet = useAppStore((state) => state.hasInternet);
      return { ...home, isOffline: !hasInternet, offlineData: { isDownloaded: true } };
    });
    await render(<HomeScreen />);
    const map = screen.getByTestId('home-map-view');

    await act(async () => {
      useAppStore.setState({ hasInternet: false });
    });
    expect(screen.getAllByTestId('local-base-map-tiles')).toHaveLength(1);

    await act(async () => {
      map.props.onMapLoaded();
    });

    expect(screen.getAllByTestId('local-base-map-tiles')).toHaveLength(1);
    expect(screen.getByTestId('home-map-view').props.mapType).toBe('none');
  });

  // MAPLOAD-08 (#28): unmounting mid-watchdog must not throw or leak the timer. The watchdog
  // effect returns `clearTimeout(timeout)` as its cleanup (standard React effect teardown,
  // unchanged by this fix), so the pending timer is always canceled before it could fire
  // post-unmount — this is already implicitly exercised every time RTL's own per-test cleanup
  // unmounts a HomeScreen tree with a live watchdog timer (e.g. the fallback test above), with
  // zero console errors across this whole suite. A manual `.unmount()` call here was tried and
  // dropped: it fought RTL's own auto-cleanup and corrupted `screen` for later tests, testing
  // the harness rather than the watchdog. MapLoadWatchdog.test.ts's stale-generation tests
  // cover the defense-in-depth case where a callback fires anyway.

  // MAPLOAD-09 (#28): basemap fallback/recovery is purely visual — it must never touch the
  // active route.
  test('watchdog fallback and recovery preserve the active route', async () => {
    jest.spyOn(MapConfigService, 'getRuntimeStatus').mockReturnValue({
      keyPresent: true,
      keyPreview: null,
      packageName: 'com.test',
      platform: 'android',
      source: 'env',
    });
    mockedUseHomeViewModel.mockImplementation(useDownloadedTilesViewModel);
    useAppStore.setState({ routePlannerDest: gateResult, activeRoute: v1Route as any });
    await render(<HomeScreen />);
    const map = screen.getByTestId('home-map-view');

    await act(async () => {
      jest.advanceTimersByTime(7_100);
    });
    await act(async () => {
      map.props.onMapLoaded();
    });

    expect(useAppStore.getState().activeRoute).toEqual(v1Route);
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
      keyPreview: null,
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
      canStartNavigation: true,
      startNavigationDisabledReason: '',
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
      canStartNavigation: true,
      startNavigationDisabledReason: '',
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
      canStartNavigation: true,
      startNavigationDisabledReason: '',
    });

    await render(<HomeScreen />);

    const startButton = await screen.findByText('Start Navigation');
    await userEvent.setup().press(startButton);

    expect(useAppStore.getState().isNavigating).toBe(true);
    // v2 navigation now transforms Home's own persistent map in place instead of pushing a
    // separate Navigation screen — see docs/ARCHITECTURE.md.
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
      canStartNavigation: true,
      startNavigationDisabledReason: '',
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
      canStartNavigation: true,
      startNavigationDisabledReason: '',
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

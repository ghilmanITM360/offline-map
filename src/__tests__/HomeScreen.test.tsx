/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Alert, Animated, DeviceEventEmitter, Dimensions } from 'react-native';
import { getAnimatedStyle } from 'react-native-reanimated';
import { act, fireEvent, render, screen, userEvent, waitFor } from './test-utils';

import { DrawerStatusContext } from '@react-navigation/drawer';
import { HomeScreen } from '../views/screens/HomeScreen';
import { facilityIds, hasSource, pinRoles, pressMapFeature, sourceFeatures, userDot } from './mapTestUtils';
import { fullSheetHeight, MIN_BOTTOM_FLOOR, MIN_TOP_VISIBLE_MAP_FOR_ATTRIBUTION, OVERLAY_CONTROL_GAP } from '../viewmodels/useOverlayInsets';
import { useHomeViewModel } from '../viewmodels/HomeViewModel';
import { useDirectionsViewModel } from '../viewmodels/DirectionsViewModel';
import { useAppStore } from '../store/useAppStore';
import { SearchService } from '../services/SearchService';
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
    useIsFocused: jest.fn(() => true),
  };
});

const { useNavigation, useIsFocused } = jest.requireMock('@react-navigation/native') as {
  useNavigation: jest.Mock;
  useIsFocused: jest.Mock;
};
const mockedUseHomeViewModel = useHomeViewModel as jest.Mock;
const mockedUseDirectionsViewModel = useDirectionsViewModel as jest.Mock;
const { __getLastBottomSheetModalProps } = jest.requireMock('@gorhom/bottom-sheet') as {
  __getLastBottomSheetModalProps: () => { onChange: (index: number) => void; onDismiss: () => void; snapPoints: Array<string | number> };
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
      notifyInitialRegionSettled: jest.fn(),
      cancelEarlyReplay: jest.fn(),
      notifyMapLayout: jest.fn(),
    },
    selectedPlace,
    snapPoints: ['15%', '50%', '92%'],
    initialRegion: { latitude: 24.9, longitude: 67.1, latitudeDelta: 0.01, longitudeDelta: 0.01 },
    isOffline: false,
    mapZoomLevel: 15.5,
    isInsideVenue: () => true,
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
  useIsFocused.mockReturnValue(true);
  mockedUseHomeViewModel.mockImplementation(useFakeHomeViewModel);
});

// #190 — Home's sheet is portal-hosted above the whole navigator, so it must be suppressed
// (hidden from touch and the accessibility tree, state preserved) whenever another screen or
// the drawer owns the foreground, and Home's hardware-back handler must stand down with it.
// test-utils' SafeAreaProvider reports a 34 dp bottom inset.
const TEST_BOTTOM_INSET = 34;
// test-utils' safe-area metrics report a 47 dp top inset (and the Android StatusBar mock is not taller).
const TEST_TOP_INSET = 47;

describe('HomeScreen — foreground workflow exclusivity (#190)', () => {
  const sheetProps = () =>
    __getLastBottomSheetModalProps() as unknown as { containerStyle?: { display?: string } | undefined };
  const suppressed = () => sheetProps().containerStyle?.display === 'none';

  async function openPlaceSheet() {
    await render(<HomeScreen />);
    await pressMapFeature('facility', 'LM_GATE_MAIN_NORTH');
    expect(await screen.findByText('Official entry / exit gate')).toBeOnTheScreen();
  }

  test('sheet is live while Home is the focused screen', async () => {
    await openPlaceSheet();
    expect(suppressed()).toBe(false);
  });

  test('sheet is suppressed while another screen is focused, and returns unchanged on refocus', async () => {
    await openPlaceSheet();

    useIsFocused.mockReturnValue(false);
    await screen.rerender(<HomeScreen />);
    expect(suppressed()).toBe(true);
    // Suppression must not tear down what Home needs when the user comes back.
    expect(setSelectedPlaceSpy).not.toHaveBeenCalledWith(null);

    useIsFocused.mockReturnValue(true);
    await screen.rerender(<HomeScreen />);
    expect(suppressed()).toBe(false);
    expect(screen.getByText('Official entry / exit gate')).toBeOnTheScreen();
  });

  test('sheet is suppressed while the drawer is open', async () => {
    await render(
      <DrawerStatusContext.Provider value="open">
        <HomeScreen />
      </DrawerStatusContext.Provider>,
    );
    await pressMapFeature('facility', 'LM_GATE_MAIN_NORTH');
    expect(suppressed()).toBe(true);
  });

  test('hardware back is left to the focused screen while Home is not focused', async () => {
    await openPlaceSheet();
    useIsFocused.mockReturnValue(false);
    await screen.rerender(<HomeScreen />);

    await act(async () => {
      DeviceEventEmitter.emit('hardwareBackPress');
    });

    expect(setSelectedPlaceSpy).not.toHaveBeenCalledWith(null);
  });
});

// #128 — TalkBack reaches the Home MapView (sibling of the portal-hosted sheet, so earlier in
// the Android accessibility tree) before the sheet, and gorhom's default accessible sheet
// container swallows its own title, subtitle and footer text. Exclusive workflows must hide the
// map subtree; Place Details must not, because marker selection is still a valid action there.
describe('HomeScreen — accessibility tree ownership (#128)', () => {
  const mapA11y = () =>
    screen.getByTestId('home-map-view', { includeHiddenElements: true }).props.importantForAccessibility;
  const sheetProps = () =>
    __getLastBottomSheetModalProps() as unknown as {
      accessible?: boolean | null;
      accessibilityLabel?: string | null;
      accessibilityRole?: string | null;
    };

  function mockRoutePreviewDirections() {
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
  }

  test('the map has no place search or browse control: the Directory is the one place chooser', async () => {
    await render(<HomeScreen />);
    expect(screen.getByRole('button', { name: 'Open menu' })).toBeOnTheScreen();
    expect(screen.queryByText('Search destinations')).not.toBeOnTheScreen();
    expect(screen.queryByText('All Locations')).not.toBeOnTheScreen();
    expect(screen.queryByLabelText('Browse all locations')).not.toBeOnTheScreen();
  });

  test('map stays reachable while exploring and on Place Details', async () => {
    await render(<HomeScreen />);
    expect(mapA11y()).toBe('auto');

    await pressMapFeature('facility', 'LM_GATE_MAIN_NORTH');
    expect(await screen.findByText('Official entry / exit gate')).toBeOnTheScreen();
    expect(mapA11y()).toBe('auto');
  });

  test('map subtree is hidden from accessibility while Get Directions is open, and restored when it closes', async () => {
    mockRoutePreviewDirections();
    const user = userEvent.setup();
    await render(<HomeScreen />);

    await pressMapFeature('facility', 'LM_GATE_MAIN_NORTH');
    await user.press(await screen.findByText('Directions'));
    expect(await screen.findByText('Get Directions')).toBeOnTheScreen();
    expect(mapA11y()).toBe('no-hide-descendants');

    await act(async () => {
      DeviceEventEmitter.emit('hardwareBackPress');
    });
    expect(screen.queryByText('Get Directions')).not.toBeOnTheScreen();
    expect(mapA11y()).toBe('auto');
  });

  test('sheet container is not itself an accessibility stop that swallows its text', async () => {
    await render(<HomeScreen />);
    await pressMapFeature('facility', 'LM_GATE_MAIN_NORTH');

    expect(sheetProps().accessible).toBe(false);
    expect(sheetProps().accessibilityLabel).toBeNull();
    expect(sheetProps().accessibilityRole).toBeNull();
  });

  test('sheet background is decorative, not a labelled "Bottom Sheet" stop', async () => {
    await render(<HomeScreen />);
    await pressMapFeature('facility', 'LM_GATE_MAIN_NORTH');
    const { backgroundComponent: Background } = __getLastBottomSheetModalProps() as unknown as {
      backgroundComponent?: React.ComponentType<{ pointerEvents: 'none'; style: object }>;
    };
    expect(Background).toBeDefined();

    await render(<Background pointerEvents="none" style={{}} />);
    type Json = { props: Record<string, unknown>; children?: Json[] | null };
    const find = (n: Json): Json | undefined =>
      n.props.pointerEvents === 'none' ? n : n.children?.map((c) => (typeof c === 'string' ? undefined : find(c))).find(Boolean);
    const background = find(screen.toJSON() as Json)!;
    expect(background.props.accessible).not.toBe(true);
    expect(background.props.importantForAccessibility).toBe('no');
    expect(background.props.accessibilityLabel).toBeUndefined();
    expect(background.props.accessibilityRole).toBeUndefined();
  });

  test('Get Directions title stays an independently reachable heading', async () => {
    mockRoutePreviewDirections();
    const user = userEvent.setup();
    await render(<HomeScreen />);
    await pressMapFeature('facility', 'LM_GATE_MAIN_NORTH');
    await user.press(await screen.findByText('Directions'));

    expect(await screen.findByRole('header', { name: 'Get Directions' })).toBeOnTheScreen();
  });
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
describe('HomeScreen — map-control stack follows the measured sheet top (#208 F1)', () => {
  test('the sheet exposes its measured position and the stack stays reachable while it rests', async () => {
    await render(<HomeScreen />);
    await pressMapFeature('facility', 'LM_GATE_MAIN_NORTH');

    const props = __getLastBottomSheetModalProps() as unknown as { animatedPosition?: { value: number } };
    expect(props.animatedPosition).toBeDefined();
    expect(typeof props.animatedPosition?.value).toBe('number');

    // The stack stays reachable; Layers now lives under the single "More map controls" button.
    expect(screen.getByLabelText('More map controls')).toBeOnTheScreen();
    expect(screen.getByLabelText('Center map on my current location')).toBeOnTheScreen();
  });
});

describe('HomeScreen — hardware back button (mode-aware, Google Maps parity)', () => {
  async function pressHardwareBack() {
    await act(async () => {
      DeviceEventEmitter.emit('hardwareBackPress');
    });
  }

  test('hardware back press in PLACE_SELECTED mode closes the sheet back to EXPLORE', async () => {
    await render(<HomeScreen />);

    await pressMapFeature('facility', 'LM_GATE_MAIN_NORTH');
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

    await pressMapFeature('facility', 'LM_GATE_MAIN_NORTH');
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

    await pressMapFeature('facility', 'LM_GATE_MAIN_NORTH');
    // Place preview keeps its collapsed and middle detents; only the middle snap is lifted by the device's bottom
    // system inset (see insetAwareSnapPoints), so the CTA is not left behind the navigation bar. The snaps
    // are pixel heights (a container that excludes the reserved top band), not percentages: gorhom never
    // recomputes its container for a later `topInset` change (#208 F2). The top one is FULL: everything below the
    // status bar, not a share of that reduced container.
    const { height } = Dimensions.get('window');
    const placeContainer = height - MIN_TOP_VISIBLE_MAP_FOR_ATTRIBUTION;
    const placeProps = __getLastBottomSheetModalProps() as unknown as { snapPoints: number[]; topInset?: number; enableOverDrag?: boolean };
    const [lowSnap, midSnap, highSnap] = placeProps.snapPoints;
    expect(placeProps.topInset).toBeUndefined();
    expect(placeProps.enableOverDrag).toBe(false);
    expect([lowSnap, highSnap]).toEqual([Math.round(0.15 * placeContainer), Math.round(fullSheetHeight(height, TEST_TOP_INSET))]);
    expect(midSnap / placeContainer).toBeGreaterThan(0.5);
    expect(midSnap / placeContainer).toBeLessThan(0.6);

    await user.press(await screen.findByText('Directions'));
    expect(await screen.findByText('Get Directions')).toBeOnTheScreen();
    // Switching to Route Preview must re-derive the heights from the route-preview band while the same
    // sheet stays presented — with no mode-dependent topInset left for gorhom to hold stale.
    const routeContainer = height - MIN_TOP_VISIBLE_MAP_FOR_ROUTE_PREVIEW;
    const routeProps = __getLastBottomSheetModalProps() as unknown as { snapPoints: number[]; topInset?: number };
    expect(routeProps.topInset).toBeUndefined();
    // Collapsed and middle detents keep their meaning; the top one is the same FULL as the place sheet's, so a
    // programmatic snapToIndex(2) and a drag to the top land in exactly the same place.
    expect(routeProps.snapPoints).toEqual([
      Math.round(0.15 * routeContainer),
      Math.round(0.79 * routeContainer),
      Math.round(fullSheetHeight(height, TEST_TOP_INSET)),
    ]);
    expect(routeProps.snapPoints[2]).toBe(placeProps.snapPoints[2]);
  });
});

// Stage 4 audit scenario 7 — selecting a different object while the sheet is already open
// must update the same sheet in place, not close-then-reopen (flicker).
describe('HomeScreen — selection switching (Google Maps parity, no flicker)', () => {
  test('switching selected place while the sheet is open updates content directly, with no intermediate close', async () => {
    await render(<HomeScreen />);

    await pressMapFeature('facility', 'LM_GATE_MAIN_NORTH');
    expect(await screen.findByText('Main North Gate')).toBeOnTheScreen();

    await pressMapFeature('facility', 'LM_MASJID_MAIN');

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
    await pressMapFeature('facility', 'LM_GATE_MAIN_NORTH');
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

  test('#208 F1: the control stack sits above the sheet\'s measured top edge, whatever the declared snaps say', async () => {
    await render(<HomeScreen />);
    await selectGate();
    await settleSheet();

    const { height } = Dimensions.get('window');
    const stackNode = () => screen.getByTestId('map-control-stack', { includeHiddenElements: true });
    const stackBottom = () => getAnimatedStyle(stackNode()).bottom;
    const sheet = __getLastBottomSheetModalProps() as unknown as { animatedPosition: { value: number } };

    // Before gorhom reports a position (or once the sheet is closed) the stack rests above the bottom inset.
    expect(stackBottom()).toBe(Math.max(TEST_BOTTOM_INSET, MIN_BOTTOM_FLOOR) + OVERLAY_CONTROL_GAP);

    // gorhom reports the sheet top in window coordinates; the stack stacks OVERLAY_CONTROL_GAP above it.
    await act(async () => {
      sheet.animatedPosition.value = height - 240;
    });
    await waitFor(() => expect(stackBottom()).toBeCloseTo(240 + OVERLAY_CONTROL_GAP, 1));
  });

  test('pan-down preview dismissal clears selection, marker, and pending presentation', async () => {
    await render(<HomeScreen />);
    await selectGate();
    await settleSheet();
    expect(pinRoles()).toEqual(['destination']);

    await dismissSheet();

    expect(setSelectedPlaceSpy).toHaveBeenCalledWith(null);
    expect(cancelPendingSheetPresentationSpy).toHaveBeenCalled();
    await waitFor(() => {
      expect(pinRoles()).toEqual([]);
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
    await selectGate();
    const selectionASheetProps = __getLastBottomSheetModalProps();
    await act(async () => {
      selectionASheetProps.onChange(-1);
    });
    await pressMapFeature('facility', 'LM_MASJID_MAIN');
    expect(await screen.findByText('Main Masjid')).toBeOnTheScreen();

    await act(async () => {
      selectionASheetProps.onDismiss();
    });

    expect(screen.getByText('Main Masjid')).toBeOnTheScreen();
    expect(pinRoles()).toEqual(['destination']);
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
    await user.press(await screen.findByLabelText(/Change destination\./));
    // What the Directory does when the visitor taps Gate 08 for "Where do you want to go?".
    const gate08 = SearchService.search('Gate 8').find((place) => place.name === 'Gate 08');
    expect(gate08).toBeDefined();
    await act(async () => {
      useAppStore.getState().setDirectoryChoice({ purpose: 'destination', place: gate08! });
    });
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
    await selectGate();
    const sheetProps = __getLastBottomSheetModalProps();
    // No settle and no onChange(-1) yet — Gate 5's own native echo has not arrived at
    // all when the user immediately taps a different object (unlike the existing
    // "stale dismissal from a previous selection" test above, which fires onChange(-1)
    // *before* the reselection and was already safe under the old mechanism).
    await pressMapFeature('facility', 'LM_MASJID_MAIN');
    expect(await screen.findByText('Main Masjid')).toBeOnTheScreen();

    await act(async () => {
      sheetProps.onChange(-1);
      sheetProps.onDismiss();
    });

    expect(screen.getByText('Main Masjid')).toBeOnTheScreen();
    expect(pinRoles()).toEqual(['destination']);
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

    expect(pinRoles()).toEqual(['destination']);
    expect(setSelectedPlaceSpy).not.toHaveBeenCalledWith(null);
  });
});

describe('HomeScreen — navigation completion cleanup', () => {
  test('ending navigation clears selected-place state before Explore can revive its marker', async () => {
    await render(<HomeScreen />);
    await pressMapFeature('facility', 'LM_GATE_MAIN_NORTH');
    expect(pinRoles()).toEqual(['destination']);

    await act(async () => useAppStore.setState({ isNavigating: true }));
    await act(async () => useAppStore.getState().stopNavigation());

    expect(pinRoles()).toEqual([]);
    expect(setSelectedPlaceSpy).toHaveBeenCalledWith(null);
  });

  test('v1 completion swaps the navigation marker set for one clean Explore user marker', async () => {
    const user = userEvent.setup();
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    useAppStore.getState().setCurrentLocation({ ...v1Route.coordinates[0], accuracy: 12 }, 'gps');
    await render(<HomeScreen />);
    await pressMapFeature('facility', 'LM_GATE_MAIN_NORTH');

    await act(async () => {
      useAppStore.getState().startNavigation(v1Destination, v1Route as any, []);
    });
    await waitFor(() => expect(userDot()).not.toBeNull());
    // Navigation owns the pins (start + destination) and the single user dot; no browse selection pin or accuracy circle.
    expect([...pinRoles()].sort()).toEqual(['destination', 'start']);
    expect(sourceFeatures('markers-user')).toHaveLength(1);
    expect(screen.queryByTestId('layer-user-accuracy', { includeHiddenElements: true })).not.toBeOnTheScreen();

    await user.press(screen.getByTestId('nav-exit-button'));
    const confirmExit = (alertSpy.mock.calls.at(-1)?.[2] as Array<{ text: string; onPress?: () => void }>).find(
      (button) => button.text === 'Stop',
    )?.onPress;
    await act(async () => confirmExit?.());

    await waitFor(() => expect(pinRoles()).toEqual([]));
    // Back in Explore: one clean browse user dot with its accuracy circle, and no leftover navigation or selection pins.
    expect(sourceFeatures('markers-user')).toHaveLength(1);
    expect(screen.getByTestId('layer-user-accuracy', { includeHiddenElements: true })).toBeOnTheScreen();
    alertSpy.mockRestore();
  });

  test('Arrival Done hands the user to the Locations Directory as the new stack root, not pushed over the Map (#307)', async () => {
    const navigateSpy = jest.fn();
    const dispatchSpy = jest.fn();
    useNavigation.mockReturnValue({ navigate: navigateSpy, dispatch: dispatchSpy, goBack: jest.fn() });
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

    expect(dispatchSpy).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'RESET', payload: expect.objectContaining({ index: 0, routes: [{ name: 'LocationsDirectory' }] }) }),
    );
    expect(navigateSpy).not.toHaveBeenCalledWith('LocationsDirectory');
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

    await fireEvent(screen.getByTestId('home-map-view', { includeHiddenElements: true }), 'regionWillChange', { nativeEvent: { userInteraction: true } });

    expect(setIsAutoFollowing).toHaveBeenCalledWith(false);
    overlaySpy.mockRestore();
  });
});

describe('HomeScreen — arrival motion', () => {
  test('plays one destination ring on arrival, then rests — GPS noise never replays it', async () => {
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
    const ringOpacity = () => screen.getByTestId('layer-destination-pulse', { includeHiddenElements: true }).props.paint['circle-opacity'];
    expect(ringOpacity()).toBeGreaterThan(0);

    await act(async () => { jest.advanceTimersByTime(5000); });
    expect(ringOpacity()).toBe(0);

    await act(async () => { useAppStore.getState().setCurrentLocation({ latitude: 24.9021, longitude: 67.1021, accuracy: 12 }, 'gps'); });
    await act(async () => { jest.advanceTimersByTime(5000); });
    expect(ringOpacity()).toBe(0);

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

    expect(sourceFeatures('markers-user')).toHaveLength(1);
    expect(screen.getByTestId('layer-user-accuracy', { includeHiddenElements: true })).toBeOnTheScreen();
    // Fallback to the browse dot (no snapped fix): only the destination pin, no start pin.
    expect(pinRoles()).toEqual(['destination']);

    overlaySpy.mockRestore();
  });
});

describe('HomeScreen — bundled offline basemap (#140)', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  const MISSING_MAP_COPY = [
    'Loading map...',
    'Map background is unavailable. Ijtema routes still work.',
    'Map background did not load. Ijtema routes still work.',
    'Background map not downloaded. Ijtema routes still work.',
    'Download background map',
    'No internet. Ijtema routes still work.',
  ];

  test('renders the map from the bundled local archive, never a remote source', async () => {
    await render(<HomeScreen />);
    const map = screen.getByTestId('home-map-view', { includeHiddenElements: true });
    await waitFor(() => {
      const style = screen.getByTestId('home-map-view', { includeHiddenElements: true }).props.mapStyle;
      expect(Object.values(style.sources).map((src: any) => src.url)).toEqual(['pmtiles://file:///mock/map/ijtema-basemap.pmtiles']);
    });
    expect(JSON.stringify(map.props.mapStyle)).not.toMatch(/https?:\/\//);
  });

  test('offline is the normal mode: no Offline badge, and the map never claims to be missing', async () => {
    mockedUseHomeViewModel.mockImplementation(() => ({ ...useFakeHomeViewModel(), isOffline: true }));
    useAppStore.setState({ hasInternet: false });
    await render(<HomeScreen />);

    expect(screen.queryByText('Offline')).not.toBeOnTheScreen();
    for (const copy of MISSING_MAP_COPY) expect(screen.queryByText(copy)).not.toBeOnTheScreen();
  });

  test('online or offline, no loading spinner, download card or satellite option appears', async () => {
    await render(<HomeScreen />);
    for (const copy of MISSING_MAP_COPY) expect(screen.queryByText(copy)).not.toBeOnTheScreen();
    expect(screen.queryByText('Satellite')).not.toBeOnTheScreen();
  });

  test('a failed basemap install degrades to a plain canvas (venue overlays still render), not an error screen', async () => {
    const { getBundledBasemap } = jest.requireMock('../services/BundledBasemap') as { getBundledBasemap: jest.Mock };
    getBundledBasemap.mockRejectedValueOnce(new Error('disk full'));
    await render(<HomeScreen />);

    await waitFor(() => expect(screen.getByTestId('home-map-view', { includeHiddenElements: true }).props.mapStyle.sources).toEqual({}));
    expect(hasSource('venue-boundary')).toBe(true);
    for (const copy of MISSING_MAP_COPY) expect(screen.queryByText(copy)).not.toBeOnTheScreen();
  });
});

describe('HomeScreen — map attribution band', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('map padding bottom inset is just the safe area with no sheet open', async () => {
    await render(<HomeScreen />);
    expect(screen.getByTestId('home-map-view', { includeHiddenElements: true }).props.attributionPosition.bottom - 8).toBe(34);
  });

  test('map padding grows past the safe area to clear the sheet once a place is selected, so the map attribution stays visible (ATTR-001)', async () => {
    await render(<HomeScreen />);
    await pressMapFeature('facility', 'LM_MASJID_MAIN');
    await screen.findByText('Main Masjid');

    expect(screen.getByTestId('home-map-view', { includeHiddenElements: true }).props.attributionPosition.bottom - 8).toBeGreaterThan(0);
  });

  // ATTR-001 follow-up: on-device, dragging Route Preview to its plain, always-declared
  // 92% snap point ALONE reproduced the Google logo clip — no dynamic sizing or
  // over-drag needed. @gorhom/bottom-sheet computes every snap point (declared
  // percentages included, not just content-driven dynamic sizing) as a percentage of its
  // own containerHeight, so mapLabelEdgeInsets' clamp couldn't fix this alone: it only
  // changes what we tell the Google Maps SDK is obstructed, not how tall the sheet
  // actually renders, so the SDK could still place the logo somewhere the real (taller)
  // sheet covered. The snap heights are computed from a container that already excludes
  // the reserved band (see HomeScreen's sheetSnapPoints), so 92% of it can never reach into
  // that band. `maxDynamicContentSize` remains a backstop for the one thing the snaps don't
  // cover: content so tall its dynamic-sizing detent would still exceed that container.
  test('Route Preview always leaves room for the map attribution, even at the plain 92% snap (ATTR-001 follow-up)', async () => {
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

    await pressMapFeature('facility', 'LM_MASJID_MAIN');
    await user.press(await screen.findByText('Directions'));
    expect(await screen.findByText('Get Directions')).toBeOnTheScreen();

    const sheetProps = __getLastBottomSheetModalProps() as unknown as {
      onChange: (index: number) => void;
      topInset?: number;
      maxDynamicContentSize: number;
      enableDynamicSizing: boolean;
    };
    // Route Preview hides the search bar/chip row, so the reserved top band is the larger route-preview
    // floor. It is applied to the snap heights, not as a gorhom topInset (#208 F2).
    expect(sheetProps.topInset).toBeUndefined();
    expect(sheetProps.enableDynamicSizing).toBe(false);

    // Route Preview disables dynamic detent insertion, so index 2 remains the declared
    // 92% maximum and cannot be shifted by content-height changes.
    await act(async () => {
      sheetProps.onChange(2);
    });

    // FULL covers the map on purpose (the owner asked for a genuinely useful full-height sheet), so the sheet is no
    // longer held below the attribution band. What stays true: the map's own padding and attribution control are still
    // clamped to the visible band (so camera fits and labels never aim at the covered area), and the dynamic-content
    // ceiling is exactly FULL, so content can never push the sheet past the status bar.
    const { height } = Dimensions.get('window');
    const mapPaddingBottom = screen.getByTestId('home-map-view', { includeHiddenElements: true }).props.attributionPosition.bottom - 8;
    expect(mapPaddingBottom).toBeLessThanOrEqual(height - MIN_TOP_VISIBLE_MAP_FOR_ROUTE_PREVIEW);
    expect(sheetProps.maxDynamicContentSize).toBe(Math.round(fullSheetHeight(height, TEST_TOP_INSET)));
  });

  test('Route Preview camera fit reserves the sheet-covered band itself at the maximum sheet snap', async () => {
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
      topInset?: number;
    };
    expect(sheetProps.topInset).toBeUndefined();

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

    // The sheet moves between snaps; the fit is deferred to the next rendered frame so it measures the settled
    // sheet band rather than the previous one.
    expect(cameraFitRouteSpy).not.toHaveBeenCalled();
    await act(async () => {
      scheduledFrames.splice(0).forEach((callback) => callback(performance.now()));
    });

    const sheetBand = screen.getByTestId('home-map-view', { includeHiddenElements: true }).props.attributionPosition.bottom - 8;
    const [, edgeInsets] = cameraFitRouteSpy.mock.calls.at(-1) as [unknown, { top: number; bottom: number }];
    // MapLibre has no native base padding, so the fit must keep both route endpoints above the sheet itself:
    // the sheet-covered band (the same inset labels and attribution avoid) plus the small inner margin.
    expect(sheetBand).toBeGreaterThan(0);
    expect(edgeInsets.bottom).toBe(sheetBand + 32);
    expect(edgeInsets.top).toBeGreaterThanOrEqual(90);
    requestAnimationFrameSpy.mockRestore();
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
});

describe('HomeScreen — facility markers (Google Maps POI parity)', () => {
  // P0-1: facilities (masjid, food, water, medical, parking, terminals, help) are real,
  // tappable map objects — not search-only — and route through the exact same
  // handlePlaceSelect -> LocationSheet -> Directions chain as blocks/gates.
  test('a known facility (Main Masjid) renders as a tappable map marker', async () => {
    await render(<HomeScreen />);

    expect(facilityIds()).toContain('LM_MASJID_MAIN');
  });

  test('tapping a facility marker selects it and opens LocationSheet', async () => {
    await render(<HomeScreen />);

    await pressMapFeature('facility', 'LM_MASJID_MAIN');

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

    await pressMapFeature('facility', 'LM_MASJID_MAIN');
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

    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    await render(<HomeScreen />);

    const startButton = await screen.findByText('Start Navigation');
    await userEvent.setup().press(startButton);

    expect(useAppStore.getState().isNavigating).toBe(true);
    // v2 navigation now transforms Home's own persistent map in place instead of pushing a
    // separate Navigation screen — see docs/ARCHITECTURE.md.
    expect(navigateSpy).not.toHaveBeenCalledWith('Navigation');
    // Starting is not cancelling: the sheet's close after Start must never raise the "Cancel route?" confirmation
    // over live navigation (runtime finding, #307).
    expect(alertSpy).not.toHaveBeenCalledWith('Cancel route?', expect.anything(), expect.anything());
    alertSpy.mockRestore();
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

    await fireEvent(screen.getByTestId('home-map-view', { includeHiddenElements: true }), 'regionWillChange', { nativeEvent: { userInteraction: true } });

    expect(cameraStopFollowingSpy).toHaveBeenCalled();
    expect(await screen.findByLabelText('Center map on my current location')).toBeOnTheScreen();
  });
});

describe('HomeScreen — a journey handed over by the Directory (#307)', () => {
  const idleDirectionsVm = () => ({
    route: null, startSource: 'live_gps', rememberedLocationAgeLabel: '', rememberedLocationAvailable: false,
    rememberedLocationInsideVenue: false, currentRouteOriginInsideVenue: true, loadState: 'idle', errorMessage: null,
    manualStart: null, chooseManualStart: jest.fn(), setIsEditingManualStart: jest.fn(), setManualStartPlace: jest.fn(),
    chooseCurrentLocation: jest.fn(async () => true), chooseRememberedLocation: jest.fn(() => true),
    calculateRoute: jest.fn(async () => {}), showManualStartSearch: false, canStartNavigation: true, startNavigationDisabledReason: '',
  });

  test('consumes the journey, opens Directions for its destination and remembers it as a recent place', async () => {
    mockedUseDirectionsViewModel.mockReturnValue(idleDirectionsVm());
    useAppStore.setState({ pendingJourney: { destination: gateResult, start: null, mode: 'live' } });

    await render(<HomeScreen />);

    expect(await screen.findByText('Get Directions')).toBeOnTheScreen();
    expect(useAppStore.getState().pendingJourney).toBeNull();
    expect(mockedUseDirectionsViewModel).toHaveBeenCalledWith(expect.objectContaining({ id: gateResult.id }));
    expect(useAppStore.getState().recentSearches.map((p) => p.id)).toContain(gateResult.id);
  });

  test('the chosen start reaches the sheet: it is applied as FROM (the intent must survive Home\'s own mount effects)', async () => {
    const setManualStartPlace = jest.fn();
    mockedUseDirectionsViewModel.mockReturnValue({ ...idleDirectionsVm(), setManualStartPlace });
    const startPlace = { ...gateResult, id: 'B9', name: 'Block 9', category: 'Block' } as Place;
    useAppStore.setState({ pendingJourney: { destination: gateResult, start: startPlace, mode: 'guide' } });

    await render(<HomeScreen />);

    expect(await screen.findByText('Get Directions')).toBeOnTheScreen();
    expect(setManualStartPlace).toHaveBeenCalledWith(startPlace);
  });

  test('while a journey is already being navigated it falls back to showing the place, never silently replacing the trip', async () => {
    mockedUseDirectionsViewModel.mockReturnValue(idleDirectionsVm());
    useAppStore.setState({ isNavigating: true, pendingJourney: { destination: gateResult, start: null, mode: 'live' } });

    await render(<HomeScreen />);

    expect(useAppStore.getState().pendingJourney).toBeNull();
    expect(useAppStore.getState().pendingDirectorySelection).toEqual(gateResult);
    expect(screen.queryByText('Get Directions')).not.toBeOnTheScreen();
  });
});

describe('HomeScreen — contextual top bar (#307)', () => {
  const directionsVm = () => ({
    route: null, startSource: 'live_gps', rememberedLocationAgeLabel: '', rememberedLocationAvailable: false,
    rememberedLocationInsideVenue: false, currentRouteOriginInsideVenue: true, loadState: 'idle', errorMessage: null,
    manualStart: null, chooseManualStart: jest.fn(), setIsEditingManualStart: jest.fn(), setManualStartPlace: jest.fn(),
    chooseCurrentLocation: jest.fn(async () => true), chooseRememberedLocation: jest.fn(() => true),
    calculateRoute: jest.fn(async () => {}), showManualStartSearch: false, canStartNavigation: true, startNavigationDisabledReason: '',
  });

  test('exploring: Places goes back to the Directory by pushing it over the Map', async () => {
    const navigate = jest.fn();
    useNavigation.mockReturnValue({ navigate, dispatch: jest.fn(), goBack: jest.fn() });
    mockedUseDirectionsViewModel.mockReturnValue(directionsVm());
    await render(<HomeScreen />);

    await userEvent.setup().press(screen.getByRole('button', { name: 'Places' }));

    expect(navigate).toHaveBeenCalledWith('LocationsDirectory');
    expect(screen.queryByText(gateResult.name, { includeHiddenElements: true })).not.toBeOnTheScreen();
  });

  test('a selected place names itself in the top bar', async () => {
    mockedUseDirectionsViewModel.mockReturnValue(directionsVm());
    mockedUseHomeViewModel.mockImplementation(() => ({ ...useFakeHomeViewModel(), selectedPlace: gateResult }));
    await render(<HomeScreen />);

    // The sheet names the place for screen readers; the bar repeats it for sighted orientation (hidden from them).
    expect(screen.getAllByText(gateResult.name, { includeHiddenElements: true }).length).toBeGreaterThan(
      screen.getAllByText(gateResult.name).length,
    );
    expect(screen.getByRole('button', { name: 'Places' })).toBeOnTheScreen();
  });

  test('the bar stays through Directions and says what the sheet is', async () => {
    mockedUseDirectionsViewModel.mockReturnValue(directionsVm());
    mockedUseHomeViewModel.mockImplementation(() => ({ ...useFakeHomeViewModel(), selectedPlace: gateResult }));
    await render(<HomeScreen />);

    await userEvent.setup().press(screen.getByText('Directions'));

    expect(screen.getByText('Directions', { includeHiddenElements: true })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Places' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Open menu' })).toBeOnTheScreen();
  });

  test('the route guide is named in the bar', async () => {
    mockedUseDirectionsViewModel.mockReturnValue(directionsVm());
    mockedUseHomeViewModel.mockImplementation(() => ({ ...useFakeHomeViewModel(), selectedPlace: gateResult }));
    useAppStore.setState({ routePlannerDest: gateResult, routeGuide: { steps: [{ text: 'Walk', distanceM: 10 }], stepIndex: 0 } });
    await render(<HomeScreen />);
    await userEvent.setup().press(screen.getByText('Directions'));

    // The sheet header names it for screen readers; the top bar repeats it for sighted orientation (hidden from them).
    expect(screen.getAllByText('Route guide', { includeHiddenElements: true }).length).toBeGreaterThan(
      screen.getAllByText('Route guide').length,
    );
  });

  test('live navigation keeps its own chrome: no top bar competes with the maneuver banner', async () => {
    mockedUseDirectionsViewModel.mockReturnValue(directionsVm());
    const overlaySpy = jest.spyOn(NavigationOverlayV1Module, 'useNavigationOverlayV1').mockReturnValue({
      active: true, route: v1Route, destination: v1Destination, instructions: [], currentStepIndex: 0, isMuted: false,
      setIsMuted: jest.fn(), remainingDistance: 100, arrived: false, reroutePending: false, isWeakGps: false,
      rerouteStatusMessage: null, snappedLocation: v1Destination.coordinate,
      mapLayers: { venueBoundary: [], blocks: [], edges: [] }, userPulseAnim: new Animated.Value(0),
      settings: useAppStore.getState().settings, graphOnlyFallbackUsed: false, requestNavigationExit: jest.fn(),
      completeArrivalNavigation: jest.fn(), setIsAutoFollowing: jest.fn(), bottomBarHeight: 0, setBottomBarHeight: jest.fn(),
    } as unknown as ReturnType<typeof NavigationOverlayV1Module.useNavigationOverlayV1>);
    await render(<HomeScreen />);

    expect(screen.queryByRole('button', { name: 'Places' })).not.toBeOnTheScreen();
    overlaySpy.mockRestore();
  });
});

describe('HomeScreen — collapsed Directions keeps a visible peek (#307)', () => {
  const directionsVm = () => ({
    route: null, startSource: 'live_gps', rememberedLocationAgeLabel: '', rememberedLocationAvailable: false,
    rememberedLocationInsideVenue: false, currentRouteOriginInsideVenue: true, loadState: 'idle', errorMessage: null,
    manualStart: null, chooseManualStart: jest.fn(), setIsEditingManualStart: jest.fn(), setManualStartPlace: jest.fn(),
    chooseCurrentLocation: jest.fn(async () => true), chooseRememberedLocation: jest.fn(() => true),
    calculateRoute: jest.fn(async () => {}), showManualStartSearch: false, canStartNavigation: true, startNavigationDisabledReason: '',
  });
  const handleComponent = () => (__getLastBottomSheetModalProps() as unknown as { handleComponent?: unknown }).handleComponent;

  test('Directions uses the peek as its handle at every detent (never swapped), so the sheet index cannot desynchronise', async () => {
    mockedUseDirectionsViewModel.mockReturnValue(directionsVm());
    mockedUseHomeViewModel.mockImplementation(() => ({ ...useFakeHomeViewModel(), selectedPlace: gateResult }));
    await render(<HomeScreen />);
    await userEvent.setup().press(screen.getByText('Directions'));

    const sheetProps = __getLastBottomSheetModalProps() as unknown as { onChange: (index: number) => void };
    const first = handleComponent();
    expect(first).toBeDefined();
    for (const index of [1, 0, 1, 2, 0]) {
      await act(async () => sheetProps.onChange(index));
      expect(handleComponent()).toBe(first);
    }
  });

  test('a folded place sheet (not Directions) keeps the default handle', async () => {
    mockedUseDirectionsViewModel.mockReturnValue(directionsVm());
    mockedUseHomeViewModel.mockImplementation(() => ({ ...useFakeHomeViewModel(), selectedPlace: gateResult }));
    await render(<HomeScreen />);

    const sheetProps = __getLastBottomSheetModalProps() as unknown as { onChange: (index: number) => void };
    await act(async () => sheetProps.onChange(0));
    expect(handleComponent()).toBeUndefined();
  });
});

describe('HomeScreen — Start Navigation reads the store when it runs (#307)', () => {
  test('a start handler captured before the route was published still starts navigation (the sheet renders through a portal and can hold a stale closure)', async () => {
    const LocationSheetModule = require('../views/components/map/LocationSheet') as typeof import('../views/components/map/LocationSheet');
    const actualSheet = LocationSheetModule.LocationSheet;
    let firstStart: (() => void) | undefined;
    const spy = jest.spyOn(LocationSheetModule, 'LocationSheet').mockImplementation(((props: { mode: string; onStartNavigation?: () => void }) => {
      if (props.mode === 'routePreview' && !firstStart) firstStart = props.onStartNavigation;
      return (actualSheet as unknown as (p: unknown) => React.ReactElement)(props);
    }) as never);

    const destination: Place = {
      id: 'GATE_08', name: 'Gate 8', category: 'Gate', description: 'Official Gate 8.',
      coordinate: { latitude: 24.903, longitude: 67.103 }, sourceVersion: 'v2', sourceKind: 'gate',
    } as Place;
    const previewRoute = {
      nodes: ['start', 'end'],
      coordinates: [{ latitude: 24.9, longitude: 67.1 }, { latitude: 24.903, longitude: 67.103 }],
      totalDistance: 180, estimatedTimeMin: 3, segments: [], startLabel: 'Current location', destinationLabel: 'Gate 8',
      startResolution: { mode: 'inside', coordinate: { latitude: 24.9, longitude: 67.1 } },
      instructions: [{ id: 'i1', text: 'Head toward Gate 8', distance: 180, type: 'straight' as const, coordinate: { latitude: 24.9, longitude: 67.1 } }],
    };
    mockedUseHomeViewModel.mockImplementation(() => ({ ...useFakeHomeViewModel(), selectedPlace: destination }));
    mockedUseDirectionsViewModel.mockReturnValue({
      route: null, startSource: 'live_gps', rememberedLocationAgeLabel: '', rememberedLocationAvailable: false,
      rememberedLocationInsideVenue: false, currentRouteOriginInsideVenue: true, loadState: 'idle', errorMessage: null,
      manualStart: null, chooseManualStart: jest.fn(), setIsEditingManualStart: jest.fn(), setManualStartPlace: jest.fn(),
      chooseCurrentLocation: jest.fn(async () => true), chooseRememberedLocation: jest.fn(() => true),
      calculateRoute: jest.fn(async () => {}), showManualStartSearch: false, canStartNavigation: true, startNavigationDisabledReason: '',
    });

    await render(<HomeScreen />);
    await userEvent.setup().press(screen.getByText('Directions'));
    expect(firstStart).toBeDefined(); // captured while the store still had no preview route

    await act(async () => {
      useAppStore.setState({ routePlannerDest: destination, activeRoute: previewRoute as never, currentLocation: { latitude: 24.9, longitude: 67.1 } });
    });
    await act(async () => firstStart!());

    expect(useAppStore.getState().isNavigating).toBe(true);
    spy.mockRestore();
  });
});

// Directions-sheet contract: during place preview, Directions setup, Route Ready and the manual Route Guide the sheet may
// fold to a visible, tappable peek but never disappear; once live navigation actually runs the setup sheet is removed.
describe('HomeScreen — Directions sheet presentation contract', () => {
  type SheetProps = {
    onChange: (index: number) => void;
    enablePanDownToClose?: boolean;
    snapPoints: number[];
    handleComponent?: React.ComponentType;
  };
  const sheetProps = () => __getLastBottomSheetModalProps() as unknown as SheetProps;
  const destination: Place = {
    id: 'GATE_08', name: 'Gate 8', category: 'Gate', description: 'Official Gate 8.',
    coordinate: { latitude: 24.903, longitude: 67.103 }, sourceVersion: 'v2', sourceKind: 'gate',
  } as Place;
  const previewRoute = {
    nodes: ['start', 'end'],
    coordinates: [{ latitude: 24.9, longitude: 67.1 }, destination.coordinate],
    totalDistance: 180, estimatedTimeMin: 3, segments: [], startLabel: 'Current location', destinationLabel: destination.name,
    startResolution: { mode: 'inside', coordinate: { latitude: 24.9, longitude: 67.1 } },
    instructions: [{ id: 'i1', text: 'Head toward Gate 8', distance: 180, type: 'straight' as const, coordinate: { latitude: 24.9, longitude: 67.1 } }],
  };
  const directionsVm = (route: unknown = null) => ({
    route, startSource: 'live_gps', startSourceLabel: 'My current location', rememberedLocationAgeLabel: '',
    rememberedLocationAvailable: false, rememberedLocationInsideVenue: false, currentRouteOriginInsideVenue: true,
    loadState: route ? 'ready' : 'idle', errorMessage: null, manualStart: null, chooseManualStart: jest.fn(),
    setIsEditingManualStart: jest.fn(), setManualStartPlace: jest.fn(), chooseCurrentLocation: jest.fn(async () => true),
    chooseRememberedLocation: jest.fn(() => true), calculateRoute: jest.fn(async () => {}), showManualStartSearch: false,
    canStartNavigation: true, startNavigationDisabledReason: '',
  });
  let sheetRef: { current: { snapToIndex: jest.Mock } | null } | undefined;
  function useHomeWithPlace() {
    mockedUseHomeViewModel.mockImplementation(() => {
      const vm = useFakeHomeViewModel();
      sheetRef = vm.bottomSheetRef as never;
      return { ...vm, selectedPlace: destination };
    });
  }

  type Setup = () => Promise<void>;
  const modes: Array<[string, Setup]> = [
    ['place preview', async () => {
      mockedUseDirectionsViewModel.mockReturnValue(directionsVm());
      useHomeWithPlace();
      await render(<HomeScreen />);
    }],
    ['Directions setup', async () => {
      mockedUseDirectionsViewModel.mockReturnValue(directionsVm());
      useHomeWithPlace();
      await render(<HomeScreen />);
      await userEvent.setup().press(screen.getByText('Directions'));
    }],
    ['Route Ready', async () => {
      mockedUseDirectionsViewModel.mockReturnValue(directionsVm(previewRoute));
      useHomeWithPlace();
      useAppStore.setState({ routePlannerDest: destination, activeRoute: previewRoute as never, currentLocation: { latitude: 24.9, longitude: 67.1 } });
      await render(<HomeScreen />);
    }],
    ['manual Route Guide preview', async () => {
      mockedUseDirectionsViewModel.mockReturnValue(directionsVm());
      useHomeWithPlace();
      useAppStore.setState({ routeGuide: { steps: [{ text: 'Walk', distanceM: 10 }], stepIndex: 0 } });
      await render(<HomeScreen />);
      await userEvent.setup().press(screen.getByText('Directions'));
    }],
  ];

  test.each(modes)('%s: the sheet cannot be swiped away, only folded to a peek between three ascending detents', async (_name, setup) => {
    await setup();
    expect(sheetProps().enablePanDownToClose).toBe(false);
    const { snapPoints } = sheetProps();
    expect(snapPoints).toHaveLength(3);
    expect(snapPoints[0]).toBeGreaterThan(0);
    expect(snapPoints[0]).toBeLessThan(snapPoints[1]);
    expect(snapPoints[1]).toBeLessThan(snapPoints[2]);
  });

  const directionsModes = modes.filter(([name]) => name !== 'place preview');
  test.each(directionsModes)('%s: PEEK -> PARTIAL -> FULL -> PEEK -> FULL, every detent reachable from every other', async (_name, setup) => {
    await setup();
    // The peek is the sheet's handle at every detent (the Jest sheet stand-in does not draw handles, so mount it here).
    const Handle = sheetProps().handleComponent!;
    expect(Handle).toBeDefined();
    const handle = await render(<Handle />);
    const tapPeek = async () => {
      const call = sheetRef!.current!.snapToIndex;
      call.mockClear();
      await userEvent.setup().press(handle.getByRole('button'));
      return call;
    };
    const landAt = (index: number) => act(async () => sheetProps().onChange(index));

    await landAt(0); // PEEK
    expect(handle.getByRole('button', { name: /Show route details/ })).toBeOnTheScreen();
    expect(await tapPeek()).toHaveBeenCalledWith(1); // PEEK -> PARTIAL
    await landAt(1);
    expect(handle.getByRole('button', { name: /Hide route details/ })).toBeOnTheScreen();
    await landAt(2); // PARTIAL -> FULL (drag; the detents are real snaps)
    expect(handle.getByRole('button', { name: /Hide route details/ })).toBeOnTheScreen();
    expect(await tapPeek()).toHaveBeenCalledWith(0); // FULL -> PEEK
    await landAt(0);
    expect(handle.getByRole('button', { name: /Show route details/ })).toBeOnTheScreen();
    await landAt(2); // PEEK -> FULL (drag)
    expect(handle.getByRole('button', { name: /Hide route details/ })).toBeOnTheScreen();
  });

  const sheetRemoved = () => {
    const props = __getLastBottomSheetModalProps() as unknown as { containerStyle?: { display?: string } };
    return props.containerStyle?.display === 'none';
  };
  const directionsRemnants = () => [
    screen.queryByTestId('directions-body', { includeHiddenElements: true }),
    screen.queryByText('Get Directions', { includeHiddenElements: true }),
    screen.queryByText('Start Navigation', { includeHiddenElements: true }),
  ].filter(Boolean);

  test('Start Navigation removes the Directions sheet entirely (no content, no footer, not touchable); stopping brings the normal sheet back', async () => {
    await modes[2][1]();
    expect(sheetRemoved()).toBe(false);
    expect(directionsRemnants().length).toBeGreaterThan(0);

    await userEvent.setup().press(await screen.findByText('Start Navigation'));

    expect(useAppStore.getState().isNavigating).toBe(true);
    const live = __getLastBottomSheetModalProps() as unknown as { footerComponent?: unknown };
    expect(sheetRemoved()).toBe(true);
    expect(live.footerComponent).toBeUndefined();
    expect(directionsRemnants()).toEqual([]);
    // No setup sheet competes with the live chrome: no Directions peek handle either.
    expect(sheetProps().handleComponent).toBeUndefined();

    await act(async () => useAppStore.getState().stopNavigation());
    expect(useAppStore.getState().isNavigating).toBe(false);
    expect(sheetRemoved()).toBe(false);
    expect((__getLastBottomSheetModalProps() as unknown as { footerComponent?: unknown }).footerComponent).toBeDefined();
  });
});

describe('HomeScreen — the route guide opens at the top detent (#307)', () => {
  test('starting the guide expands the sheet so the whole card fits above the navigation bar', async () => {
    const LocationSheetModule = require('../views/components/map/LocationSheet') as typeof import('../views/components/map/LocationSheet');
    const actualSheet = LocationSheetModule.LocationSheet;
    let guideStarted: (() => void) | undefined;
    const spy = jest.spyOn(LocationSheetModule, 'LocationSheet').mockImplementation(((props: { mode: string; onRouteGuideStarted?: () => void }) => {
      if (props.mode === 'routePreview') guideStarted = props.onRouteGuideStarted;
      return (actualSheet as unknown as (p: unknown) => React.ReactElement)(props);
    }) as never);
    let sheetRef: { current: { snapToIndex: jest.Mock } | null } | undefined;
    mockedUseHomeViewModel.mockImplementation(() => {
      const vm = useFakeHomeViewModel();
      sheetRef = vm.bottomSheetRef as never;
      return { ...vm, selectedPlace: gateResult };
    });
    mockedUseDirectionsViewModel.mockReturnValue({
      route: null, startSource: 'live_gps', rememberedLocationAgeLabel: '', rememberedLocationAvailable: false,
      rememberedLocationInsideVenue: false, currentRouteOriginInsideVenue: true, loadState: 'idle', errorMessage: null,
      manualStart: null, chooseManualStart: jest.fn(), setIsEditingManualStart: jest.fn(), setManualStartPlace: jest.fn(),
      chooseCurrentLocation: jest.fn(async () => true), chooseRememberedLocation: jest.fn(() => true),
      calculateRoute: jest.fn(async () => {}), showManualStartSearch: false, canStartNavigation: true, startNavigationDisabledReason: '',
    });
    await render(<HomeScreen />);
    await userEvent.setup().press(screen.getByText('Directions'));
    expect(guideStarted).toBeDefined();

    sheetRef!.current!.snapToIndex.mockClear();
    await act(async () => guideStarted!());

    expect(sheetRef!.current!.snapToIndex).toHaveBeenCalledWith(2);
    spy.mockRestore();
  });

  test('a request made while the sheet is still landing at the middle detent is repeated once it lands, and only once', async () => {
    const LocationSheetModule = require('../views/components/map/LocationSheet') as typeof import('../views/components/map/LocationSheet');
    const actualSheet = LocationSheetModule.LocationSheet;
    let guideStarted: (() => void) | undefined;
    const spy = jest.spyOn(LocationSheetModule, 'LocationSheet').mockImplementation(((props: { mode: string; onRouteGuideStarted?: () => void }) => {
      if (props.mode === 'routePreview') guideStarted = props.onRouteGuideStarted;
      return (actualSheet as unknown as (p: unknown) => React.ReactElement)(props);
    }) as never);
    let sheetRef: { current: { snapToIndex: jest.Mock } | null } | undefined;
    mockedUseHomeViewModel.mockImplementation(() => {
      const vm = useFakeHomeViewModel();
      sheetRef = vm.bottomSheetRef as never;
      return { ...vm, selectedPlace: gateResult };
    });
    mockedUseDirectionsViewModel.mockReturnValue({
      route: null, startSource: 'live_gps', rememberedLocationAgeLabel: '', rememberedLocationAvailable: false,
      rememberedLocationInsideVenue: false, currentRouteOriginInsideVenue: true, loadState: 'idle', errorMessage: null,
      manualStart: null, chooseManualStart: jest.fn(), setIsEditingManualStart: jest.fn(), setManualStartPlace: jest.fn(),
      chooseCurrentLocation: jest.fn(async () => true), chooseRememberedLocation: jest.fn(() => true),
      calculateRoute: jest.fn(async () => {}), showManualStartSearch: false, canStartNavigation: true, startNavigationDisabledReason: '',
    });
    await render(<HomeScreen />);
    await userEvent.setup().press(screen.getByText('Directions'));
    await act(async () => guideStarted!());

    // The sheet reports landing at the middle detent: the earlier request was swallowed by the opening animation.
    // (The mocked modal re-creates its handle on every render, so hold the one the call goes to.)
    const handleAtLanding = sheetRef!.current!;
    handleAtLanding.snapToIndex.mockClear();
    await act(async () => __getLastBottomSheetModalProps().onChange(1));
    expect(handleAtLanding.snapToIndex).toHaveBeenCalledWith(2);

    // Once it is at the top, the user choosing the middle detent again is theirs to make.
    await act(async () => __getLastBottomSheetModalProps().onChange(2));
    const handleAtTop = sheetRef!.current!;
    handleAtTop.snapToIndex.mockClear();
    await act(async () => __getLastBottomSheetModalProps().onChange(1));
    expect(handleAtTop.snapToIndex).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { act, fireEvent, render, screen } from './test-utils';

import { HomeScreen } from '../views/screens/HomeScreen';
import { pressMapFeature, userDot } from './mapTestUtils';
import { useHomeViewModel } from '../viewmodels/HomeViewModel';
import { useDirectionsViewModel } from '../viewmodels/DirectionsViewModel';
import { useAppStore } from '../store/useAppStore';
import { LocationAccessService } from '../services/LocationAccessService';
import type { LocationResolveResult } from '../services/LocationAccessService';
import type { Place } from '../models/types';

// Cold/returning launch camera decisions (see HomeScreen.tsx's onMapReady) live in this file,
// separate from HomeScreen.test.tsx's recenter/pan follow-mode tests. Those tests exercise
// MapLabelOverlay's rAF-coalesced projection under fake timers via userEvent + timer
// advances; keeping startup-camera tests isolated avoids cross-file act/timer coupling.
jest.mock('../viewmodels/HomeViewModel', () => ({
  useHomeViewModel: jest.fn(),
}));

jest.mock('../viewmodels/DirectionsViewModel', () => ({
  useDirectionsViewModel: jest.fn(),
}));

jest.mock('../services/LocationAccessService', () => ({
  LocationAccessService: {
    resolveCurrentLocation: jest.fn(),
  },
}));

// Pass-through wrappers so a test can see which dependency arrays HomeScreen hands to the Reanimated hooks.
jest.mock('react-native-reanimated', () => {
  const actual = jest.requireActual('react-native-reanimated');
  const wrapped: Record<string, jest.Mock> = {
    useAnimatedStyle: jest.fn(actual.useAnimatedStyle),
    useAnimatedReaction: jest.fn(actual.useAnimatedReaction),
  };
  // A proxy keeps every other export (including the default Animated object) exactly as the real module has it.
  return new Proxy(actual, { get: (target, key: string) => wrapped[key] ?? target[key] });
});

jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  return {
    ...actual,
    useNavigation: jest.fn(),
    useIsFocused: jest.fn(() => true),
  };
});

const { useNavigation } = jest.requireMock('@react-navigation/native') as { useNavigation: jest.Mock };
const mockedUseHomeViewModel = useHomeViewModel as jest.Mock;
const mockedUseDirectionsViewModel = useDirectionsViewModel as jest.Mock;
const mockedResolveCurrentLocation = LocationAccessService.resolveCurrentLocation as jest.MockedFunction<typeof LocationAccessService.resolveCurrentLocation>;

const cameraAnimateToUserSpy = jest.fn();
const cameraFitVenueBoundsSpy = jest.fn();
const cameraFitRouteSpy = jest.fn();
const cameraNotifyNativeMapReadySpy = jest.fn();
const cameraNotifyInitialRegionSettledSpy = jest.fn();
const cameraCancelEarlyReplaySpy = jest.fn();
const cameraStopFollowingSpy = jest.fn();
const handlePlaceSelectSpy = jest.fn();
const handleRecenterSpy = jest.fn(async () => true);
const clearSearchSpy = jest.fn();
const setIsMapReadySpy = jest.fn();

const liveCoordinate = { latitude: 24.9656, longitude: 67.0072, accuracy: 6, heading: 88 };
const staleRememberedCoordinate = { latitude: 24.9011, longitude: 67.1012, accuracy: 40 };
const deviceLastKnownCoordinate = { latitude: 24.9022, longitude: 67.1024, accuracy: 35 };
// Verified repository entity B2 (Block 2) centre: the camera fallback when no usable location exists (#222).
const block2AnchorCoordinate = { latitude: 24.9685, longitude: 66.9999167 };

const basePermissionState: LocationResolveResult['permissionState'] = {
  granted: true,
  canAskAgain: true,
  status: 'granted' as any,
  servicesEnabled: true,
};

const searchResultPlace: Place = {
  id: 'GATE_12',
  name: 'Gate 12',
  category: 'Gate',
  description: 'Gate 12',
  coordinate: { latitude: 24.963676, longitude: 67.006339 },
  sourceVersion: 'v2',
  sourceKind: 'gate',
} as Place;

function locationResult(
  source: LocationResolveResult['source'] | 'remembered',
  coordinate: LocationResolveResult['coordinate'],
  overrides: Partial<LocationResolveResult> = {},
): LocationResolveResult {
  return {
    ok: Boolean(coordinate),
    coordinate,
    source: source as LocationResolveResult['source'],
    permissionState: basePermissionState,
    message: null,
    ...overrides,
  };
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function useFakeHomeViewModel(overrides: Record<string, unknown> = {}) {
  return {
    mapRef: { current: null },
    bottomSheetRef: { current: null },
    cameraManager: {
      mode: 'IDLE' as const,
      animateToUser: cameraAnimateToUserSpy,
      animateToPlace: jest.fn(),
      fitVenueBounds: cameraFitVenueBoundsSpy,
      fitRoute: cameraFitRouteSpy,
      followUser: jest.fn(),
      stopFollowing: cameraStopFollowingSpy,
      enterNavigationCamera: jest.fn(),
      exitNavigationCamera: jest.fn(),
      notifyNativeMapReady: cameraNotifyNativeMapReadySpy,
      notifyInitialRegionSettled: cameraNotifyInitialRegionSettledSpy,
      cancelEarlyReplay: cameraCancelEarlyReplaySpy,
      notifyMapLayout: jest.fn(),
    },
    selectedPlace: null,
    snapPoints: ['15%', '50%', '92%'],
    initialRegion: { latitude: 24.9, longitude: 67.1, latitudeDelta: 0.01, longitudeDelta: 0.01 },
    isOffline: false,
    mapZoomLevel: 15.5,
    venueStatus: { insideVenue: false, insideBlock: null },
    isInsideVenue: (c: { latitude: number; longitude: number }) => c.latitude > 24.963 && c.latitude < 24.9758 && c.longitude > 66.9974 && c.longitude < 67.0155,
    compassMode: 'NORTH_UP' as const,
    setIsMapReady: setIsMapReadySpy,
    handlePlaceSelect: handlePlaceSelectSpy,
    cancelPendingSheetPresentation: jest.fn(),
    handleSheetIndexChange: jest.fn(),
    handleRecenter: handleRecenterSpy,
    handleCompassToggle: jest.fn(),
    handleZoomIn: jest.fn(),
    handleZoomOut: jest.fn(),
    handleMapRegionChangeComplete: jest.fn(),
    clearSearch: clearSearchSpy,
    setSelectedPlace: jest.fn(),
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
    ...overrides,
  };
}

let initialStoreState: ReturnType<typeof useAppStore.getState>;

beforeAll(() => {
  initialStoreState = useAppStore.getState();
});

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  useAppStore.setState(initialStoreState, true);
  useNavigation.mockReturnValue({ navigate: jest.fn(), dispatch: jest.fn(), goBack: jest.fn() });
  mockedUseHomeViewModel.mockImplementation(useFakeHomeViewModel);
  mockedResolveCurrentLocation.mockResolvedValue(locationResult('live', liveCoordinate));
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

async function flushProjectionTimers() {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(100);
  });
}

async function flushLaunchMicrotasks() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

const initialRegionEvent = { latitude: 24.9694, longitude: 67.0064, latitudeDelta: 0.026, longitudeDelta: 0.016 };

// MapLibre reports centre + bounds; HomeScreen turns them back into a Region.
const regionDidChangeEvent = (r: typeof initialRegionEvent, userInteraction = false) => ({
  nativeEvent: {
    center: [r.longitude, r.latitude],
    zoom: 16,
    bearing: 0,
    pitch: 0,
    animated: false,
    userInteraction,
    bounds: [r.longitude - r.longitudeDelta / 2, r.latitude - r.latitudeDelta / 2, r.longitude + r.longitudeDelta / 2, r.latitude + r.latitudeDelta / 2],
  },
});
const userPanEvent = { nativeEvent: { userInteraction: true } };

// The native map applies its initial region shortly after onMapReady and reports it as the first
// region-complete; startup camera moves wait for that event (or a short bound).
async function settleInitialRegion() {
  await act(async () => {
    fireEvent(screen.getByTestId('home-map-view', { includeHiddenElements: true }), 'regionDidChange', regionDidChangeEvent(initialRegionEvent));
  });
}

async function renderAndMapReady() {
  const rendered = await render(<HomeScreen />);
  await act(async () => {
    fireEvent(screen.getByTestId('home-map-view', { includeHiddenElements: true }), 'didFinishLoadingMap');
  });
  await settleInitialRegion();
  return rendered;
}

function expectNoLaunchMutationOrCamera() {
  expect(cameraAnimateToUserSpy).not.toHaveBeenCalled();
  expect(cameraFitVenueBoundsSpy).not.toHaveBeenCalled();
  expect(useAppStore.getState().currentLocation).toBeNull();
  expect(useAppStore.getState().currentLocationSource).toBeNull();
}

const invalidatingInteractions: Array<[string, () => Promise<void> | void]> = [
  ['user pan', () => fireEvent(screen.getByTestId('home-map-view', { includeHiddenElements: true }), 'regionWillChange', userPanEvent)],
  ['Recenter', async () => {
    fireEvent.press(screen.getByLabelText('Center map on my current location'));
    await jest.advanceTimersByTimeAsync(1300);
  }],
  ['facility selection', async () => {
    await pressMapFeature('facility', 'LM_MASJID_MAIN');
    await jest.advanceTimersByTimeAsync(100);
  }],
  // A destination picked in the Directory outranks the launch camera (destination > user > Block 2).
  ['Directory hand-off', async () => {
    useAppStore.setState({ pendingDirectorySelection: searchResultPlace as any });
    await jest.advanceTimersByTimeAsync(100);
  }],
];

describe('HomeScreen - launch camera (Google Maps principles, adapted for a venue)', () => {
  test('first install with a live fix follows the returning rule: resolves it, shows the grounds overview and marks the overview as seen', async () => {
    useAppStore.setState({ hasSeenMapOverview: false, hasLocationPermission: true, currentLocation: null });

    await renderAndMapReady();
    await flushLaunchMicrotasks();
    await flushProjectionTimers();

    expect(mockedResolveCurrentLocation).toHaveBeenCalledTimes(1);
    expect(cameraFitVenueBoundsSpy).toHaveBeenCalledTimes(1);
    expect(cameraAnimateToUserSpy).not.toHaveBeenCalled();
    expect(useAppStore.getState().currentLocation).toEqual(liveCoordinate);
    expect(useAppStore.getState().hasSeenMapOverview).toBe(true);
    expect(setIsMapReadySpy).toHaveBeenCalledTimes(1);
  });

  test('first install without location permission opens on Block 2 with the notice, never starts the resolver, and marks the overview as seen', async () => {
    useAppStore.setState({ hasSeenMapOverview: false, hasLocationPermission: false, currentLocation: null });

    await renderAndMapReady();
    await flushLaunchMicrotasks();
    await flushProjectionTimers();

    expect(mockedResolveCurrentLocation).not.toHaveBeenCalled();
    expect(cameraAnimateToUserSpy).toHaveBeenCalledWith(block2AnchorCoordinate);
    expect(cameraFitVenueBoundsSpy).not.toHaveBeenCalled();
    expect(screen.getByText("We can't find where you are. Showing the main area.")).toBeOnTheScreen();
    expect(useAppStore.getState().currentLocation).toBeNull();
    expect(useAppStore.getState().hasSeenMapOverview).toBe(true);
  });

  test('returning user with persisted lastKnownLocation only: asks for fresh GPS and does not auto-focus the remembered coordinate', async () => {
    useAppStore.setState({
      hasSeenMapOverview: true,
      hasLocationPermission: true,
      currentLocation: null,
      lastKnownLocation: staleRememberedCoordinate,
    });
    mockedResolveCurrentLocation.mockResolvedValue(locationResult('device_last_known', deviceLastKnownCoordinate));

    await renderAndMapReady();
    await flushLaunchMicrotasks();
    await flushProjectionTimers();

    expect(mockedResolveCurrentLocation).toHaveBeenCalledTimes(1);
    expect(mockedResolveCurrentLocation).toHaveBeenCalledWith(false);
    expect(cameraAnimateToUserSpy).not.toHaveBeenCalledWith(staleRememberedCoordinate);
    expect(cameraAnimateToUserSpy).toHaveBeenCalledWith(block2AnchorCoordinate);
    expect(cameraFitVenueBoundsSpy).not.toHaveBeenCalled();
    expect(useAppStore.getState().currentLocation).toBeNull();
  });

  test('returning user with fresh live GPS: commits canonical current location before animating to the exact same coordinate', async () => {
    useAppStore.setState({
      hasSeenMapOverview: true,
      hasLocationPermission: true,
      currentLocation: null,
      lastKnownLocation: staleRememberedCoordinate,
    });
    mockedResolveCurrentLocation.mockResolvedValue(locationResult('live', liveCoordinate));

    await renderAndMapReady();
    await flushLaunchMicrotasks();
    await flushProjectionTimers();

    expect(mockedResolveCurrentLocation).toHaveBeenCalledTimes(1);
    expect(useAppStore.getState().currentLocation).toEqual(liveCoordinate);
    expect(useAppStore.getState().currentLocationSource).toBe('live');
    expect(userDot()).toEqual([liveCoordinate.longitude, liveCoordinate.latitude]);
    // #222: a valid location inside the Ijtema shows the grounds overview, not a zoom onto the dot.
    expect(cameraFitVenueBoundsSpy).toHaveBeenCalledTimes(1);
    expect(cameraAnimateToUserSpy).not.toHaveBeenCalled();
  });

  test.each([
    ['device_last_known', locationResult('device_last_known', deviceLastKnownCoordinate)],
    ['remembered', locationResult('remembered', staleRememberedCoordinate)],
    ['services unavailable', locationResult(null, null, { ok: false, permissionState: { ...basePermissionState, servicesEnabled: false } })],
    ['resolver rejection', null],
    ['invalid live coordinate', locationResult('live', { latitude: Number.NaN, longitude: 67.0 } as any)],
  ])('returning fallback for %s: fits venue without writing current location', async (_label, result) => {
    useAppStore.setState({ hasSeenMapOverview: true, hasLocationPermission: true, currentLocation: null, lastKnownLocation: staleRememberedCoordinate });
    if (result) {
      mockedResolveCurrentLocation.mockResolvedValue(result);
    } else {
      mockedResolveCurrentLocation.mockRejectedValue(new Error('native resolver failed'));
    }

    await renderAndMapReady();
    await flushLaunchMicrotasks();
    await flushProjectionTimers();

    expect(cameraFitVenueBoundsSpy).not.toHaveBeenCalled();
    expect(cameraAnimateToUserSpy).toHaveBeenCalledTimes(1);
    expect(cameraAnimateToUserSpy).toHaveBeenCalledWith(block2AnchorCoordinate);
    expect(useAppStore.getState().currentLocation).toBeNull();
    expect(useAppStore.getState().currentLocationSource).toBeNull();
    expect(useAppStore.getState().hasSeenMapOverview).toBe(true);
  });

  test('returning user without permission: fits venue and never starts the fresh-location resolver', async () => {
    useAppStore.setState({ hasSeenMapOverview: true, hasLocationPermission: false, currentLocation: null, lastKnownLocation: staleRememberedCoordinate });

    await renderAndMapReady();
    await flushLaunchMicrotasks();
    await flushProjectionTimers();

    expect(mockedResolveCurrentLocation).not.toHaveBeenCalled();
    expect(cameraFitVenueBoundsSpy).not.toHaveBeenCalled();
    expect(cameraAnimateToUserSpy).toHaveBeenCalledTimes(1);
    expect(cameraAnimateToUserSpy).toHaveBeenCalledWith(block2AnchorCoordinate);
  });

  test('resolver timeout: fits venue, never writes first-overview state again, and ignores the later live result', async () => {
    const deferred = createDeferred<LocationResolveResult>();
    mockedResolveCurrentLocation.mockReturnValue(deferred.promise);
    useAppStore.setState({ hasSeenMapOverview: true, hasLocationPermission: true, currentLocation: null });

    await renderAndMapReady();
    await act(async () => {
      await jest.advanceTimersByTimeAsync(4000);
    });
    await flushProjectionTimers();

    expect(cameraFitVenueBoundsSpy).not.toHaveBeenCalled();
    expect(cameraAnimateToUserSpy).toHaveBeenCalledTimes(1);
    expect(cameraAnimateToUserSpy).toHaveBeenCalledWith(block2AnchorCoordinate);
    expect(useAppStore.getState().currentLocation).toBeNull();
    expect(useAppStore.getState().hasSeenMapOverview).toBe(true);

    await act(async () => {
      deferred.resolve(locationResult('live', liveCoordinate));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(cameraFitVenueBoundsSpy).not.toHaveBeenCalled();
    expect(cameraAnimateToUserSpy).toHaveBeenCalledTimes(1);
    expect(cameraAnimateToUserSpy).toHaveBeenCalledWith(block2AnchorCoordinate);
    expect(useAppStore.getState().currentLocation).toBeNull();
  });

  test('unmount before returning resolver settles: no state write, no marker update, no camera command', async () => {
    const deferred = createDeferred<LocationResolveResult>();
    mockedResolveCurrentLocation.mockReturnValue(deferred.promise);
    useAppStore.setState({ hasSeenMapOverview: true, hasLocationPermission: true, currentLocation: null });

    const rendered = await renderAndMapReady();
    await act(async () => {
      rendered.unmount();
      await jest.advanceTimersByTimeAsync(100);
    });
    await act(async () => {
      deferred.resolve(locationResult('live', liveCoordinate));
      await Promise.resolve();
      await Promise.resolve();
    });

    expectNoLaunchMutationOrCamera();
  });

  test.each(invalidatingInteractions)('%s before resolver settlement invalidates the pending returning-launch camera result', async (_label, interact) => {
    const deferred = createDeferred<LocationResolveResult>();
    mockedResolveCurrentLocation.mockReturnValue(deferred.promise);
    useAppStore.setState({ hasSeenMapOverview: true, hasLocationPermission: true, currentLocation: null });

    await renderAndMapReady();
    expect(setIsMapReadySpy).not.toHaveBeenCalled();

    await act(async () => {
      await interact();
    });

    await act(async () => {
      deferred.resolve(locationResult('live', liveCoordinate));
      await Promise.resolve();
      await Promise.resolve();
    });
    await flushProjectionTimers();

    expect(setIsMapReadySpy).toHaveBeenCalledTimes(1);
    expectNoLaunchMutationOrCamera();
  });

  test('route preview activation before resolver settlement invalidates launch ownership and fits only the route', async () => {
    const deferred = createDeferred<LocationResolveResult>();
    mockedResolveCurrentLocation.mockReturnValue(deferred.promise);
    useAppStore.setState({ hasSeenMapOverview: true, hasLocationPermission: true, currentLocation: null });

    await renderAndMapReady();
    await act(async () => {
      useAppStore.setState({
        routePlannerDest: searchResultPlace,
        activeRoute: {
          sourceVersion: 'v2',
          coordinates: [
            { latitude: 24.963, longitude: 67.006 },
            searchResultPlace.coordinate,
          ],
          startResolution: { mode: 'inside', coordinate: { latitude: 24.963, longitude: 67.006 } },
          destinationLabel: 'Gate 12',
          startLabel: 'Current location',
        } as any,
      });
    });

    await act(async () => {
      deferred.resolve(locationResult('live', liveCoordinate));
      await Promise.resolve();
      await Promise.resolve();
    });
    await flushProjectionTimers();

    expect(cameraFitRouteSpy).toHaveBeenCalledTimes(1);
    expect(cameraAnimateToUserSpy).not.toHaveBeenCalled();
    expect(useAppStore.getState().currentLocation).toBeNull();
  });

  test('restored route preview before mapReady already owns the camera and does not start the returning resolver', async () => {
    useAppStore.setState({
      hasSeenMapOverview: true,
      hasLocationPermission: true,
      currentLocation: null,
      routePlannerDest: searchResultPlace,
      activeRoute: {
        sourceVersion: 'v2',
        coordinates: [
          { latitude: 24.963, longitude: 67.006 },
          searchResultPlace.coordinate,
        ],
        startResolution: { mode: 'inside', coordinate: { latitude: 24.963, longitude: 67.006 } },
        destinationLabel: 'Gate 12',
        startLabel: 'Current location',
      } as any,
    });

    await renderAndMapReady();
    await flushProjectionTimers();

    expect(mockedResolveCurrentLocation).not.toHaveBeenCalled();
    expect(cameraFitRouteSpy).toHaveBeenCalled();
    expect(cameraAnimateToUserSpy).not.toHaveBeenCalled();
    expect(cameraFitVenueBoundsSpy).not.toHaveBeenCalled();
  });

  test('navigation mode before resolver settlement invalidates launch ownership', async () => {
    const deferred = createDeferred<LocationResolveResult>();
    mockedResolveCurrentLocation.mockReturnValue(deferred.promise);
    useAppStore.setState({ hasSeenMapOverview: true, hasLocationPermission: true, currentLocation: null });

    await renderAndMapReady();
    await act(async () => {
      useAppStore.getState().startNavigation(searchResultPlace, {
        id: 'route',
        routeId: 'route',
        sourceVersion: 'v2',
        coordinates: [
          { latitude: 24.963, longitude: 67.006 },
          searchResultPlace.coordinate,
        ],
        totalDistanceM: 120,
        totalDistance: 120,
        etaMinutes: 2,
        estimatedTimeMin: 2,
        segments: [],
        instructions: [],
        origin: {
          coordinate: { latitude: 24.963, longitude: 67.006 },
          label: 'Current location',
          type: 'inside_snap',
        },
        destination: {
          coordinate: searchResultPlace.coordinate,
          label: searchResultPlace.name,
          type: 'gate',
          gateId: searchResultPlace.id,
        },
        metadata: {
          startedOutside: false,
          usesOfficialGateEntry: false,
          graphVersion: 'test',
        },
      } as any);
    });

    await act(async () => {
      deferred.resolve(locationResult('live', liveCoordinate));
      await Promise.resolve();
      await Promise.resolve();
    });
    await flushProjectionTimers();

    expect(cameraAnimateToUserSpy).not.toHaveBeenCalled();
    expect(cameraFitVenueBoundsSpy).not.toHaveBeenCalled();
    expect(useAppStore.getState().currentLocation).toBeNull();
  });

  test('duplicate onMapReady starts one resolver and commits one startup-camera decision', async () => {
    useAppStore.setState({ hasSeenMapOverview: true, hasLocationPermission: true, currentLocation: null });

    await render(<HomeScreen />);
    const map = screen.getByTestId('home-map-view', { includeHiddenElements: true });
    await act(async () => {
      fireEvent(map, 'didFinishLoadingMap');
    });
    await act(async () => {
      fireEvent(map, 'didFinishLoadingMap');
    });
    await settleInitialRegion();
    await flushLaunchMicrotasks();
    await flushProjectionTimers();

    expect(mockedResolveCurrentLocation).toHaveBeenCalledTimes(1);
    expect(cameraFitVenueBoundsSpy).toHaveBeenCalledTimes(1);
    expect(cameraAnimateToUserSpy).not.toHaveBeenCalled();
  });

  test('continuous watcher is not released while the one-shot returning launch resolver is pending', async () => {
    const deferred = createDeferred<LocationResolveResult>();
    mockedResolveCurrentLocation.mockReturnValue(deferred.promise);
    useAppStore.setState({ hasSeenMapOverview: true, hasLocationPermission: true, currentLocation: null });

    await renderAndMapReady();

    expect(setIsMapReadySpy).not.toHaveBeenCalled();
    expect(cameraAnimateToUserSpy).not.toHaveBeenCalled();

    await act(async () => {
      deferred.resolve(locationResult('live', liveCoordinate));
      await Promise.resolve();
      await Promise.resolve();
    });
    await flushProjectionTimers();

    expect(setIsMapReadySpy).toHaveBeenCalledTimes(1);
    expect(cameraFitVenueBoundsSpy).toHaveBeenCalledTimes(1);
  });

  test('passive current-location update while resolver is pending does not issue a competing camera move', async () => {
    const deferred = createDeferred<LocationResolveResult>();
    const watcherCoordinate = { latitude: 24.9544, longitude: 67.0022, accuracy: 11 };
    mockedResolveCurrentLocation.mockReturnValue(deferred.promise);
    useAppStore.setState({ hasSeenMapOverview: true, hasLocationPermission: true, currentLocation: null });

    await renderAndMapReady();
    await act(async () => {
      useAppStore.getState().setCurrentLocation(watcherCoordinate, 'live');
      await Promise.resolve();
    });

    expect(cameraAnimateToUserSpy).not.toHaveBeenCalled();
    expect(useAppStore.getState().currentLocation).toEqual(watcherCoordinate);

    await act(async () => {
      deferred.resolve(locationResult('live', liveCoordinate));
      await Promise.resolve();
      await Promise.resolve();
    });
    await flushProjectionTimers();

    expect(cameraFitVenueBoundsSpy).toHaveBeenCalledTimes(1);
    expect(cameraAnimateToUserSpy).not.toHaveBeenCalled();
    expect(useAppStore.getState().currentLocation).toEqual(liveCoordinate);
  });

  test('store rerender while resolver is pending does not start another startup resolver', async () => {
    const deferred = createDeferred<LocationResolveResult>();
    mockedResolveCurrentLocation.mockReturnValue(deferred.promise);
    useAppStore.setState({ hasSeenMapOverview: true, hasLocationPermission: true, currentLocation: null });

    await renderAndMapReady();
    await act(async () => {
      useAppStore.setState({ showGraphNodes: true });
      await Promise.resolve();
    });

    expect(mockedResolveCurrentLocation).toHaveBeenCalledTimes(1);

    await act(async () => {
      deferred.resolve(locationResult('device_last_known', deviceLastKnownCoordinate));
      await Promise.resolve();
      await Promise.resolve();
    });
    await flushProjectionTimers();

    expect(mockedResolveCurrentLocation).toHaveBeenCalledTimes(1);
    expect(cameraFitVenueBoundsSpy).not.toHaveBeenCalled();
    expect(cameraAnimateToUserSpy).toHaveBeenCalledTimes(1);
    expect(cameraAnimateToUserSpy).toHaveBeenCalledWith(block2AnchorCoordinate);
  });

  test('explicit remembered-location state remains visibly remembered and is not relabelled as live by launch fallback', async () => {
    useAppStore.setState({
      hasSeenMapOverview: true,
      hasLocationPermission: true,
      currentLocation: staleRememberedCoordinate,
      currentLocationSource: 'remembered',
      lastKnownLocation: staleRememberedCoordinate,
    });
    mockedResolveCurrentLocation.mockResolvedValue(locationResult('device_last_known', deviceLastKnownCoordinate));

    await renderAndMapReady();
    await flushLaunchMicrotasks();
    await flushProjectionTimers();

    expect(cameraFitVenueBoundsSpy).not.toHaveBeenCalled();
    expect(cameraAnimateToUserSpy).toHaveBeenCalledTimes(1);
    expect(cameraAnimateToUserSpy).toHaveBeenCalledWith(block2AnchorCoordinate);
    expect(cameraAnimateToUserSpy).not.toHaveBeenCalledWith(staleRememberedCoordinate);
    expect(useAppStore.getState().currentLocationSource).toBe('remembered');
    expect(screen.getByText('earlier')).toBeOnTheScreen();
  });
});

describe('#222 Map entry camera rules', () => {
  const outsideCoordinate = { latitude: 24.8607, longitude: 67.0011, accuracy: 12 };

  test('no usable location: opens on Block 2 and says so, without presenting it as a detected location', async () => {
    useAppStore.setState({ hasSeenMapOverview: true, hasLocationPermission: false, currentLocation: null });

    await renderAndMapReady();
    await flushProjectionTimers();

    expect(cameraAnimateToUserSpy).toHaveBeenCalledWith(block2AnchorCoordinate);
    expect(screen.getByText("We can't find where you are. Showing the main area.")).toBeOnTheScreen();
    expect(useAppStore.getState().currentLocation).toBeNull();
    expect(useAppStore.getState().currentLocationSource).toBeNull();
  });

  test('a live location inside the Ijtema shows the grounds overview and no fallback notice', async () => {
    useAppStore.setState({ hasSeenMapOverview: true, hasLocationPermission: true, currentLocation: null });

    await renderAndMapReady();
    await flushLaunchMicrotasks();
    await flushProjectionTimers();

    expect(cameraFitVenueBoundsSpy).toHaveBeenCalledTimes(1);
    expect(cameraAnimateToUserSpy).not.toHaveBeenCalled();
    expect(useAppStore.getState().currentLocation).toEqual(liveCoordinate);
    expect(screen.queryByText("We can't find where you are. Showing the main area.")).toBeNull();
  });

  test('a live location outside the Ijtema shows the venue context and still records the location for the outside status', async () => {
    mockedResolveCurrentLocation.mockResolvedValue(locationResult('live', outsideCoordinate));
    useAppStore.setState({ hasSeenMapOverview: true, hasLocationPermission: true, currentLocation: null });

    await renderAndMapReady();
    await flushLaunchMicrotasks();
    await flushProjectionTimers();

    expect(cameraFitVenueBoundsSpy).toHaveBeenCalledTimes(1);
    expect(cameraAnimateToUserSpy).not.toHaveBeenCalled();
    expect(useAppStore.getState().currentLocation).toEqual(outsideCoordinate);
    expect(screen.queryByText("We can't find where you are. Showing the main area.")).toBeNull();
  });

  test('a destination already selected when the Map opens owns the camera: no overview and no Block 2 fallback', async () => {
    mockedUseHomeViewModel.mockImplementation(() => useFakeHomeViewModel({ selectedPlace: searchResultPlace }));
    useAppStore.setState({ hasSeenMapOverview: true, hasLocationPermission: false, currentLocation: null });

    await renderAndMapReady();
    await flushLaunchMicrotasks();
    await flushProjectionTimers();

    expect(cameraAnimateToUserSpy).not.toHaveBeenCalled();
    expect(cameraFitVenueBoundsSpy).not.toHaveBeenCalled();
    expect(screen.queryByText("We can't find where you are. Showing the main area.")).toBeNull();
  });
});

describe('Directory destination outranks the launch camera on the first painted frame', () => {
  const startState = () => screen.getByTestId('map-camera', { includeHiddenElements: true }).props.initialViewState as {
    center: [number, number];
    zoom: number;
  };

  test('a destination already handed off when the map mounts is where the map starts, not the venue overview', async () => {
    useAppStore.setState({ hasSeenMapOverview: true, hasLocationPermission: false, currentLocation: null, pendingDirectorySelection: null });
    await render(<HomeScreen />);
    const overview = startState();
    await screen.unmount();

    useAppStore.setState({ pendingDirectorySelection: searchResultPlace as any });
    await render(<HomeScreen />);
    const withDestination = startState();

    expect(withDestination.center[0]).toBeCloseTo(searchResultPlace.coordinate!.longitude, 4);
    expect(withDestination.center[1]).toBeCloseTo(searchResultPlace.coordinate!.latitude, 3);
    expect(withDestination.zoom).toBeGreaterThan(overview.zoom + 1);
  });
});

describe('#222 startup camera waits for the initial region', () => {
  // #140: MapLibre applies the initial camera synchronously, so nothing is held back for a first region-complete any more
  // (react-native-maps applied initialRegion after ready and dropped earlier commands).
  test('a camera move issued at map-ready runs at once and exactly once, without waiting for a region event', async () => {
    useAppStore.setState({ hasSeenMapOverview: true, hasLocationPermission: false, currentLocation: null });

    await render(<HomeScreen />);
    await act(async () => {
      fireEvent(screen.getByTestId('home-map-view', { includeHiddenElements: true }), 'didFinishLoadingMap');
    });
    await flushProjectionTimers();

    expect(cameraAnimateToUserSpy).toHaveBeenCalledTimes(1);
    expect(cameraAnimateToUserSpy).toHaveBeenCalledWith(block2AnchorCoordinate);

    await settleInitialRegion();
    await settleInitialRegion();

    expect(cameraAnimateToUserSpy).toHaveBeenCalledTimes(1);
  });

  test('with no region event at all the move has already run (nothing waits on a bound timer)', async () => {
    useAppStore.setState({ hasSeenMapOverview: true, hasLocationPermission: false, currentLocation: null });

    await render(<HomeScreen />);
    await act(async () => {
      fireEvent(screen.getByTestId('home-map-view', { includeHiddenElements: true }), 'didFinishLoadingMap');
    });
    await act(async () => {
      await jest.advanceTimersByTimeAsync(9000);
    });

    expect(cameraAnimateToUserSpy).toHaveBeenCalledTimes(1);
  });
});

describe('#222 an early camera move is re-run once the initial region is applied', () => {
  test('the manager hears map-ready and the settled signal together at ready', async () => {
    useAppStore.setState({ hasSeenMapOverview: true, hasLocationPermission: false, currentLocation: null });

    await render(<HomeScreen />);
    await act(async () => {
      fireEvent(screen.getByTestId('home-map-view', { includeHiddenElements: true }), 'didFinishLoadingMap');
    });
    await flushProjectionTimers();

    expect(cameraNotifyNativeMapReadySpy).toHaveBeenCalledTimes(1);
    expect(cameraNotifyInitialRegionSettledSpy).toHaveBeenCalledTimes(1);

    await settleInitialRegion();

    // A later region-complete is still passed on (the manager caps replays itself).
    expect(cameraNotifyInitialRegionSettledSpy).toHaveBeenCalledTimes(2);
  });

  test('with no region event at all the settled signal has already gone out (nothing waits on a bound timer)', async () => {
    useAppStore.setState({ hasSeenMapOverview: true, hasLocationPermission: false, currentLocation: null });

    await render(<HomeScreen />);
    await act(async () => {
      fireEvent(screen.getByTestId('home-map-view', { includeHiddenElements: true }), 'didFinishLoadingMap');
    });
    await act(async () => {
      await jest.advanceTimersByTimeAsync(3000);
    });

    expect(cameraNotifyInitialRegionSettledSpy).toHaveBeenCalledTimes(1);
  });

  test('a region-complete that arrives after the bound is passed on too, so the manager can re-run a dropped move', async () => {
    useAppStore.setState({ hasSeenMapOverview: true, hasLocationPermission: false, currentLocation: null });

    await render(<HomeScreen />);
    await act(async () => {
      fireEvent(screen.getByTestId('home-map-view', { includeHiddenElements: true }), 'didFinishLoadingMap');
    });
    await act(async () => {
      await jest.advanceTimersByTimeAsync(3000);
    });
    await settleInitialRegion();

    expect(cameraNotifyInitialRegionSettledSpy).toHaveBeenCalledTimes(2);
  });
});

describe('#222 Change place on the Block 2 notice', () => {
  const navigate = jest.fn();
  const openFallbackMap = async () => {
    useNavigation.mockReturnValue({ navigate, dispatch: jest.fn(), goBack: jest.fn() });
    useAppStore.setState({ hasSeenMapOverview: true, hasLocationPermission: false, currentLocation: null });
    await renderAndMapReady();
    await flushProjectionTimers();
  };

  beforeEach(() => navigate.mockClear());

  test('the notice offers one Change place action that opens the Directory in start-selection mode', async () => {
    await openFallbackMap();

    fireEvent.press(screen.getByRole('button', { name: 'Change place' }));

    expect(navigate).toHaveBeenCalledWith('LocationsDirectory');
    expect(useAppStore.getState().directoryPurpose).toBe('start');
  });

  test('opening the chooser does not turn the Block 2 fallback into a location', async () => {
    await openFallbackMap();

    fireEvent.press(screen.getByRole('button', { name: 'Change place' }));

    expect(useAppStore.getState().currentLocation).toBeNull();
    expect(useAppStore.getState().currentLocationSource).toBeNull();
  });

  test('a place picked in start mode with no destination open returns normally: the place is selected on the Map', async () => {
    await openFallbackMap();

    await act(async () => {
      useAppStore.setState({ directoryChoice: { purpose: 'start', place: searchResultPlace as any } });
    });

    expect(useAppStore.getState().pendingDirectorySelection).toEqual(searchResultPlace);
    expect(useAppStore.getState().directoryChoice).toBeNull();
    expect(useAppStore.getState().currentLocation).toBeNull();
  });

  test('the last-known quick option moves the camera only and does not become a location', async () => {
    await openFallbackMap();
    cameraAnimateToUserSpy.mockClear();

    await act(async () => {
      useAppStore.setState({ lastKnownLocation: staleRememberedCoordinate, directoryChoice: { purpose: 'start', quick: 'last_known' } });
    });

    expect(cameraAnimateToUserSpy).toHaveBeenCalledWith(staleRememberedCoordinate);
    expect(useAppStore.getState().currentLocation).toBeNull();
    expect(useAppStore.getState().directoryChoice).toBeNull();
  });

  test('the notice goes away once a place is selected', async () => {
    mockedUseHomeViewModel.mockImplementation(() => useFakeHomeViewModel({ selectedPlace: null }));
    await openFallbackMap();
    expect(screen.getByText("We can't find where you are. Showing the main area.")).toBeOnTheScreen();

    mockedUseHomeViewModel.mockImplementation(() => useFakeHomeViewModel({ selectedPlace: searchResultPlace }));
    await act(async () => {
      useAppStore.setState({ currentLocation: null });
    });
    expect(screen.queryByText("We can't find where you are. Showing the main area.")).toBeNull();

    // Closing the place sheet later must not bring back a notice that no longer describes the camera.
    mockedUseHomeViewModel.mockImplementation(() => useFakeHomeViewModel({ selectedPlace: null }));
    await act(async () => {
      useAppStore.setState({ currentLocation: null });
    });
    expect(screen.queryByText("We can't find where you are. Showing the main area.")).toBeNull();
  });
});

describe('#222 the first camera intent does not fight the user', () => {
  test('a user pan releases the manager replay of the early move', async () => {
    useAppStore.setState({ hasSeenMapOverview: true, hasLocationPermission: false, currentLocation: null });
    await renderAndMapReady();
    cameraCancelEarlyReplaySpy.mockClear();

    fireEvent(screen.getByTestId('home-map-view', { includeHiddenElements: true }), 'regionWillChange', userPanEvent);

    expect(cameraCancelEarlyReplaySpy).toHaveBeenCalledTimes(1);
  });

  test('the startup move runs once and then releases the replay, because the initial region was already applied', async () => {
    useAppStore.setState({ hasSeenMapOverview: true, hasLocationPermission: false, currentLocation: null });

    await renderAndMapReady();
    await flushProjectionTimers();
    await act(async () => {
      await jest.advanceTimersByTimeAsync(3000);
    });
    await settleInitialRegion();

    expect(cameraAnimateToUserSpy).toHaveBeenCalledTimes(1);
    expect(cameraCancelEarlyReplaySpy).toHaveBeenCalledTimes(1);
  });
});

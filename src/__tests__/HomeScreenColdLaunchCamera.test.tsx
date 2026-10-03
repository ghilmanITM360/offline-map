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
      notifyMapLayout: jest.fn(),
    },
    mapType: 'standard' as const,
    selectedPlace: null,
    snapPoints: ['15%', '50%', '92%'],
    initialRegion: { latitude: 24.9, longitude: 67.1, latitudeDelta: 0.01, longitudeDelta: 0.01 },
    isOffline: false,
    offlineData: { isDownloaded: false },
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

// The native map applies its initial region shortly after onMapReady and reports it as the first
// region-complete; startup camera moves wait for that event (or a short bound).
async function settleInitialRegion() {
  await act(async () => {
    fireEvent(screen.getByTestId('home-map-view', { includeHiddenElements: true }), 'regionChangeComplete', initialRegionEvent);
  });
}

async function renderAndMapReady() {
  const rendered = await render(<HomeScreen />);
  await act(async () => {
    fireEvent(screen.getByTestId('home-map-view', { includeHiddenElements: true }), 'mapReady');
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
  ['user pan', () => fireEvent(screen.getByTestId('home-map-view', { includeHiddenElements: true }), 'panDrag')],
  ['Recenter', async () => {
    fireEvent.press(screen.getByLabelText('Center map on my current location'));
    await jest.advanceTimersByTimeAsync(1300);
  }],
  ['facility selection', async () => {
    fireEvent.press(screen.getByTestId('facility_marker_LM_MASJID_MAIN'));
    await jest.advanceTimersByTimeAsync(100);
  }],
];

describe('HomeScreen - launch camera (Google Maps principles, adapted for a venue)', () => {
  test('first install: fits the venue overview and marks the overview as seen', async () => {
    useAppStore.setState({
      hasSeenMapOverview: false,
      hasLocationPermission: true,
      currentLocation: liveCoordinate,
    });

    await renderAndMapReady();
    await flushProjectionTimers();

    expect(mockedResolveCurrentLocation).not.toHaveBeenCalled();
    expect(cameraFitVenueBoundsSpy).toHaveBeenCalledTimes(1);
    expect(cameraAnimateToUserSpy).not.toHaveBeenCalled();
    expect(useAppStore.getState().hasSeenMapOverview).toBe(true);
  });

  test('first install with live resolver available: venue overview commits before the watcher is released', async () => {
    useAppStore.setState({
      hasSeenMapOverview: false,
      hasLocationPermission: true,
      currentLocation: liveCoordinate,
    });

    await renderAndMapReady();
    await flushProjectionTimers();

    expect(mockedResolveCurrentLocation).not.toHaveBeenCalled();
    expect(cameraFitVenueBoundsSpy).toHaveBeenCalledTimes(1);
    expect(cameraAnimateToUserSpy).not.toHaveBeenCalled();
    expect(setIsMapReadySpy).toHaveBeenCalledTimes(1);
  });

  test('Google mapLoaded before app mapReady does not start a startup resolver or camera decision', async () => {
    useAppStore.setState({ hasSeenMapOverview: true, hasLocationPermission: true, currentLocation: null });

    await render(<HomeScreen />);
    await act(async () => {
      fireEvent(screen.getByTestId('home-map-view', { includeHiddenElements: true }), 'mapLoaded');
    });
    await flushProjectionTimers();

    expect(mockedResolveCurrentLocation).not.toHaveBeenCalled();
    expect(cameraAnimateToUserSpy).not.toHaveBeenCalled();
    expect(cameraFitVenueBoundsSpy).not.toHaveBeenCalled();
    expect(setIsMapReadySpy).not.toHaveBeenCalled();
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
    expect(screen.getByTestId('browse-user-location-marker').props.coordinate).toEqual(liveCoordinate);
    // #222: a valid location inside the Ijtema shows the grounds overview, not a zoom onto the dot.
    expect(cameraFitVenueBoundsSpy).toHaveBeenCalledTimes(1);
    expect(cameraAnimateToUserSpy).not.toHaveBeenCalled();
  });

  test('Google mapLoaded after returning launch commit does not start a second resolver or camera decision', async () => {
    useAppStore.setState({ hasSeenMapOverview: true, hasLocationPermission: true, currentLocation: null });

    await renderAndMapReady();
    await flushLaunchMicrotasks();
    await act(async () => {
      fireEvent(screen.getByTestId('home-map-view', { includeHiddenElements: true }), 'mapLoaded');
    });
    await flushProjectionTimers();

    expect(mockedResolveCurrentLocation).toHaveBeenCalledTimes(1);
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
      fireEvent(map, 'mapReady');
    });
    await act(async () => {
      fireEvent(map, 'mapReady');
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
    expect(screen.getByText('last known')).toBeOnTheScreen();
  });
});

describe('#222 Map entry camera rules', () => {
  const outsideCoordinate = { latitude: 24.8607, longitude: 67.0011, accuracy: 12 };

  test('no usable location: opens on Block 2 and says so, without presenting it as a detected location', async () => {
    useAppStore.setState({ hasSeenMapOverview: true, hasLocationPermission: false, currentLocation: null });

    await renderAndMapReady();
    await flushProjectionTimers();

    expect(cameraAnimateToUserSpy).toHaveBeenCalledWith(block2AnchorCoordinate);
    expect(screen.getByText('Location unavailable. Showing Block 2.')).toBeOnTheScreen();
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
    expect(screen.queryByText('Location unavailable. Showing Block 2.')).toBeNull();
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
    expect(screen.queryByText('Location unavailable. Showing Block 2.')).toBeNull();
  });

  test('a destination already selected when the Map opens owns the camera: no overview and no Block 2 fallback', async () => {
    mockedUseHomeViewModel.mockImplementation(() => useFakeHomeViewModel({ selectedPlace: searchResultPlace }));
    useAppStore.setState({ hasSeenMapOverview: true, hasLocationPermission: false, currentLocation: null });

    await renderAndMapReady();
    await flushLaunchMicrotasks();
    await flushProjectionTimers();

    expect(cameraAnimateToUserSpy).not.toHaveBeenCalled();
    expect(cameraFitVenueBoundsSpy).not.toHaveBeenCalled();
    expect(screen.queryByText('Location unavailable. Showing Block 2.')).toBeNull();
  });
});

describe('#222 startup camera waits for the initial region', () => {
  test('a camera move issued at map-ready is held until the first region-complete, then runs once', async () => {
    useAppStore.setState({ hasSeenMapOverview: true, hasLocationPermission: false, currentLocation: null });

    await render(<HomeScreen />);
    await act(async () => {
      fireEvent(screen.getByTestId('home-map-view', { includeHiddenElements: true }), 'mapReady');
    });
    await flushProjectionTimers();

    expect(cameraAnimateToUserSpy).not.toHaveBeenCalled();

    await settleInitialRegion();
    await settleInitialRegion();

    expect(cameraAnimateToUserSpy).toHaveBeenCalledTimes(1);
    expect(cameraAnimateToUserSpy).toHaveBeenCalledWith(block2AnchorCoordinate);
  });

  test('if the region-complete never arrives the move still runs after the bound', async () => {
    useAppStore.setState({ hasSeenMapOverview: true, hasLocationPermission: false, currentLocation: null });

    await render(<HomeScreen />);
    await act(async () => {
      fireEvent(screen.getByTestId('home-map-view', { includeHiddenElements: true }), 'mapReady');
    });
    await act(async () => {
      await jest.advanceTimersByTimeAsync(9000);
    });

    expect(cameraAnimateToUserSpy).toHaveBeenCalledTimes(1);
  });

  test('a route preview that starts while the move is waiting wins: the held move never runs', async () => {
    useAppStore.setState({ hasSeenMapOverview: true, hasLocationPermission: false, currentLocation: null });

    await render(<HomeScreen />);
    await act(async () => {
      fireEvent(screen.getByTestId('home-map-view', { includeHiddenElements: true }), 'mapReady');
    });
    await act(async () => {
      useAppStore.setState({
        routePlannerDest: searchResultPlace,
        activeRoute: {
          sourceVersion: 'v2',
          coordinates: [{ latitude: 24.963, longitude: 67.006 }, searchResultPlace.coordinate],
          startResolution: { mode: 'inside', coordinate: { latitude: 24.963, longitude: 67.006 } },
          destinationLabel: 'Gate 12',
          startLabel: 'Current location',
        } as any,
      });
    });
    await settleInitialRegion();
    await flushProjectionTimers();

    expect(cameraAnimateToUserSpy).not.toHaveBeenCalled();
    expect(cameraFitVenueBoundsSpy).not.toHaveBeenCalled();
  });
});

describe('#222 camera commands wait for the initial region (any intent, not only the startup move)', () => {
  test('the camera manager is told the map is ready only after the initial region is applied', async () => {
    useAppStore.setState({ hasSeenMapOverview: true, hasLocationPermission: false, currentLocation: null });

    await render(<HomeScreen />);
    await act(async () => {
      fireEvent(screen.getByTestId('home-map-view', { includeHiddenElements: true }), 'mapReady');
    });
    await flushProjectionTimers();

    // A place chosen in the Directory queues its camera move in the manager; if the manager were ready now,
    // the native map would drop that move because it has not applied its initial region yet.
    expect(cameraNotifyNativeMapReadySpy).not.toHaveBeenCalled();

    await settleInitialRegion();
    await settleInitialRegion();

    expect(cameraNotifyNativeMapReadySpy).toHaveBeenCalledTimes(1);
  });

  test('if the initial region never reports, the manager is still told after the bound', async () => {
    useAppStore.setState({ hasSeenMapOverview: true, hasLocationPermission: false, currentLocation: null });

    await render(<HomeScreen />);
    await act(async () => {
      fireEvent(screen.getByTestId('home-map-view', { includeHiddenElements: true }), 'mapReady');
    });
    await act(async () => {
      await jest.advanceTimersByTimeAsync(9000);
    });

    expect(cameraNotifyNativeMapReadySpy).toHaveBeenCalledTimes(1);
  });
});

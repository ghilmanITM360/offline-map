import type { Place } from '../models/types';
import { LANDMARK_PLACES } from '../constants/data';
import { V2PlaceAdapter } from '../services/V2PlaceAdapter';
import { useAppStore } from '../store/useAppStore';
import { V2DirectionsService } from '../services/V2DirectionsService';
import { EntryGateRoutingService } from '../services/EntryGateRoutingService';
import { useDirectionsViewModel } from '../viewmodels/DirectionsViewModel';
import { act, renderHook, waitFor } from './test-utils';

const initialStoreState = useAppStore.getState();
const origin = { latitude: 24.9762, longitude: 67.011 };
const destination: Place = {
  id: 'B34',
  name: 'Block 34',
  category: 'Block',
  description: 'Block 34',
  coordinate: { latitude: 24.966, longitude: 67.004 },
  sourceVersion: 'v2',
};
const facilityDestination = LANDMARK_PLACES.find((place) => place.id === 'LM_MASJID_MAIN')!;

function outsideManualPlace(coordinate = origin, id = 'outside-manual'): Place {
  return {
    id,
    name: 'Outside start',
    category: 'CustomPoint',
    description: 'Selected outside coordinate',
    coordinate,
    sourceVersion: 'v1',
  };
}

beforeEach(() => {
  delete process.env.EXPO_PUBLIC_IJTEMA_ROUTING_PROXY_BASE_URL;
  process.env.EXPO_PUBLIC_USE_IJTEMA_V2_ROUTING = 'true';
  useAppStore.setState(initialStoreState, true);
  useAppStore.setState({
    currentLocation: origin,
    currentLocationSource: 'live',
    lastKnownLocation: origin,
  });
});

describe('DirectionsViewModel hybrid outside routing', () => {
  test.each([
    ['live', 'live_gps'],
    ['device_last_known', 'device_last_known'],
  ] as const)('routes canonical v1 Facility from %s outside provenance through V2', async (locationSource, expectedSource) => {
    useAppStore.setState({ currentLocation: origin, currentLocationSource: locationSource });

    const hook = await renderHook(() => useDirectionsViewModel(facilityDestination));

    await waitFor(() => expect(hook.result.current.loadState).toBe('ready'), { timeout: 5_000 });
    expect(hook.result.current.startSource).toBe(expectedSource);
    expect(hook.result.current.route).toMatchObject({
      sourceVersion: 'v2',
      destinationEntryNodeId: 'P6',
      destinationLabel: 'Main Masjid',
    });
    expect(hook.result.current.route?.outsideRoute?.provider).toBe('offline-osm');
    expect(useAppStore.getState().routePlannerDest).toBe(facilityDestination);
  });

  test('routes canonical v1 Facility from remembered and manual outside provenance through V2', async () => {
    const inside = { latitude: 24.966, longitude: 67.004 };
    useAppStore.setState({ currentLocation: inside, currentLocationSource: 'live', lastKnownLocation: origin });
    const hook = await renderHook(() => useDirectionsViewModel(facilityDestination));
    await waitFor(() => expect(hook.result.current.loadState).toBe('ready'), { timeout: 5_000 });

    await act(() => expect(hook.result.current.chooseRememberedLocation()).toBe(true));
    await waitFor(() => expect(hook.result.current.route?.outsideRoute?.provider).toBe('offline-osm'), { timeout: 5_000 });
    expect(hook.result.current.startSource).toBe('remembered_location');
    expect(hook.result.current.route?.destinationEntryNodeId).toBe('P6');

    await act(() => hook.result.current.setManualStartPlace(outsideManualPlace(origin, 'facility-manual-outside')));
    await waitFor(() => expect(hook.result.current.startSource).toBe('manual_place'));
    await waitFor(() => expect(hook.result.current.route?.outsideRoute?.provider).toBe('offline-osm'), { timeout: 5_000 });
    expect(hook.result.current.activeOriginCoordinate).toEqual(origin);
    expect(hook.result.current.route?.destinationEntryNodeId).toBe('P6');
  });

  test.each([
    ['live', 'live_gps', 'My current location', 'Using live GPS location now.', true],
    ['device_last_known', 'device_last_known', 'Device last known location', 'Using device last known location because live GPS is unavailable.', false],
  ] as const)(
    'preserves %s provenance in route-origin presentation',
    async (locationSource, expectedStartSource, primaryLabel, supportingCopy, currentOptionActive) => {
      useAppStore.setState({ currentLocation: origin, currentLocationSource: locationSource });

      const hook = await renderHook(() => useDirectionsViewModel(destination));

      await waitFor(() => expect(hook.result.current.loadState).toBe('ready'), { timeout: 5_000 });
      expect(hook.result.current.startSource).toBe(expectedStartSource);
      expect(hook.result.current.startSourceLabel).toBe(primaryLabel);
      expect(hook.result.current.startSourceSupportingCopy).toBe(supportingCopy);
      expect(hook.result.current.isCurrentLocationStartActive).toBe(currentOptionActive);
      expect(hook.result.current.activeOriginCoordinate).toEqual(origin);
    },
  );

  test('uses production provider flow and exposes all routable official gates', async () => {
    const hook = await renderHook(() => useDirectionsViewModel(destination));

    await waitFor(() => expect(hook.result.current.loadState).toBe('ready'), { timeout: 5_000 });
    expect(hook.result.current.route?.outsideRoute?.provider).toBe('offline-osm');
    expect(hook.result.current.manualGateOptions).toHaveLength(14);
    expect(hook.result.current.manualGateOptions).toContainEqual({ gateId: 'GATE_12', label: 'Gate 12' });
  });

  test('manual Gate 12 selection narrows core plan and cannot be overridden by provider costs', async () => {
    const hook = await renderHook(() => useDirectionsViewModel(destination));
    await waitFor(() => expect(hook.result.current.loadState).toBe('ready'), { timeout: 5_000 });

    await act(() => hook.result.current.selectManualGate('GATE_12'));
    await waitFor(() => expect(hook.result.current.route?.startResolution?.gate?.id).toBe('GATE_12'), { timeout: 5_000 });

    expect(hook.result.current.manualGateId).toBe('GATE_12');
    expect(hook.result.current.route?.outsideRoute?.gateId).toBe('GATE_12');
    expect(hook.result.current.route?.selectedOutsideCandidateId).toContain(':GATE_12:');
  });

  test('same outside coordinate uses same hybrid policy for GPS, manual search, and remembered starts', async () => {
    const hook = await renderHook(() => useDirectionsViewModel(destination));
    await waitFor(() => expect(hook.result.current.loadState).toBe('ready'), { timeout: 5_000 });

    const gpsRoute = hook.result.current.route;
    expect(gpsRoute?.outsideRoute).toMatchObject({
      provider: 'offline-osm',
      fallbackHistory: [],
    });
    const gpsCandidateId = gpsRoute?.selectedOutsideCandidateId;
    const gpsGateId = gpsRoute?.startResolution?.gate?.id;
    expect(gpsCandidateId).toBeDefined();
    expect(gpsGateId).toBeDefined();
    // Presentation must agree with the routing layer: GPS is genuinely outside the venue here.
    expect(hook.result.current.isOutsideStart).toBe(true);

    await act(() => hook.result.current.setManualStartPlace(outsideManualPlace()));
    await waitFor(() => expect(hook.result.current.route?.selectedOutsideCandidateId).not.toBe(gpsCandidateId), { timeout: 5_000 });

    const manualRoute = hook.result.current.route;
    expect(hook.result.current.startSource).toBe('manual_place');
    expect(manualRoute?.outsideRoute?.provider).toBe('offline-osm');
    expect(manualRoute?.startResolution?.gate?.id).toBe(gpsGateId);
    expect(manualRoute?.outsideRoute?.fallbackHistory).toEqual([]);
    // Regression: manual_place used to be hard-excluded from isOutsideStart regardless of its
    // actual coordinate, so the UI would claim "inside" while routing silently ran the
    // outside/gate flow above. Same outside coordinate as GPS must produce the same flag.
    expect(hook.result.current.isOutsideStart).toBe(true);

    const manualCandidateId = manualRoute?.selectedOutsideCandidateId;
    await act(() => expect(hook.result.current.chooseRememberedLocation()).toBe(true));
    await waitFor(() => expect(hook.result.current.route?.selectedOutsideCandidateId).not.toBe(manualCandidateId), { timeout: 5_000 });

    expect(hook.result.current.startSource).toBe('remembered_location');
    expect(hook.result.current.route?.outsideRoute?.provider).toBe('offline-osm');
    expect(hook.result.current.route?.startResolution?.gate?.id).toBe(gpsGateId);
    expect(hook.result.current.isOutsideStart).toBe(true);
  });

  test('manual inside place stays on internal pedestrian routing', async () => {
    const insideStart = V2PlaceAdapter.getPlaceById('B1');
    expect(insideStart).not.toBeNull();
    const hook = await renderHook(() => useDirectionsViewModel(destination));
    await waitFor(() => expect(hook.result.current.loadState).toBe('ready'), { timeout: 5_000 });

    await act(() => hook.result.current.setManualStartPlace(insideStart!));
    await waitFor(() => {
      expect(hook.result.current.loadState).toBe('ready');
      expect(hook.result.current.route?.outsideRoute).toBeUndefined();
      expect(hook.result.current.route?.nodes.length).toBeGreaterThan(1);
    }, { timeout: 5_000 });

    expect(hook.result.current.startSource).toBe('manual_place');
    expect(hook.result.current.route?.outsideLegCoordinateCount ?? 0).toBe(0);
    // A manual start that is genuinely inside the venue must present as inside — the fix only
    // removes the blanket manual_place exclusion, it does not force manual starts outside.
    expect(hook.result.current.isOutsideStart).toBe(false);
  });

  test('remembered origin keeps remembered label, age disclosure, inactive current option, and coordinate', async () => {
    useAppStore.setState({
      currentLocation: origin,
      currentLocationSource: 'live',
      lastKnownLocation: origin,
      lastKnownLocationUpdatedAt: new Date(Date.now() - 5 * 60_000).toISOString(),
    });
    const hook = await renderHook(() => useDirectionsViewModel(destination));

    await act(() => expect(hook.result.current.chooseRememberedLocation()).toBe(true));
    await waitFor(() => expect(hook.result.current.startSource).toBe('remembered_location'));

    expect(hook.result.current.startSourceLabel).toContain('Last known location');
    expect(hook.result.current.startSourceSupportingCopy).toContain('Using last known location');
    expect(hook.result.current.isCurrentLocationStartActive).toBe(false);
    expect(hook.result.current.activeOriginCoordinate).toEqual(origin);
  });

  test.each([
    ['manual outside', outsideManualPlace(origin, 'manual-outside')],
    ['searched outside', { ...outsideManualPlace(origin, 'searched-outside'), name: 'Searched outside start' }],
  ])('%s origin keeps its selected-place identity and coordinate', async (_caseName, place) => {
    const hook = await renderHook(() => useDirectionsViewModel(destination));

    await act(() => hook.result.current.setManualStartPlace(place));
    await waitFor(() => expect(hook.result.current.startSource).toBe('manual_place'));

    expect(hook.result.current.startSourceLabel).toBe(place.name);
    expect(hook.result.current.startSourceSupportingCopy).toBe(`Starting from ${place.name}.`);
    expect(hook.result.current.isCurrentLocationStartActive).toBe(false);
    expect(hook.result.current.activeOriginCoordinate).toEqual(place.coordinate);
  });

  test('manual outside start falls through OSM failure to labelled direct guide', async () => {
    const farOutside = { latitude: 24.9, longitude: 67.01 };
    const hook = await renderHook(() => useDirectionsViewModel(destination));
    await waitFor(() => expect(hook.result.current.loadState).toBe('ready'), { timeout: 5_000 });
    const previousCandidateId = hook.result.current.route?.selectedOutsideCandidateId;

    await act(() => hook.result.current.setManualStartPlace(outsideManualPlace(farOutside, 'far-outside-manual')));
    await waitFor(() => expect(hook.result.current.route?.selectedOutsideCandidateId).not.toBe(previousCandidateId), { timeout: 5_000 });

    expect(hook.result.current.route?.outsideRoute).toMatchObject({
      provider: 'direct-guide',
      roadFollowing: false,
      distanceKind: 'direct-distance',
      fallbackHistory: [
        { provider: 'offline-osm', code: 'outside-coverage', retryable: false },
      ],
    });
    // The direct-guide fallback message/status is presentation the UI shows specifically
    // because the start is outside — must not regress to "inside" for a manual start.
    expect(hook.result.current.isOutsideStart).toBe(true);
  });

  test('retains ready preview when replacement provider orchestration throws', async () => {
    const hook = await renderHook(() => useDirectionsViewModel(destination));
    await waitFor(() => expect(hook.result.current.loadState).toBe('ready'), { timeout: 5_000 });
    const routeBeforeRetry = hook.result.current.route;
    const previewSpy = jest.spyOn(V2DirectionsService, 'calculateHybridPreview').mockRejectedValueOnce(new Error('provider exploded'));

    await act(() => hook.result.current.retryOutsideRoute());

    expect(hook.result.current.route).toBe(routeBeforeRetry);
    expect(hook.result.current.loadState).toBe('ready');
    expect(hook.result.current.routeRefreshing).toBe(false);
    previewSpy.mockRestore();
  });
});

// Near-boundary regression coverage: isOutsideStart (and everything LocationSheet derives from
// it — loading copy, provider status text, gate-entry wording) must always agree with the
// coordinate calculateRoute actually uses (routeOriginLocation for live_gps, not the raw,
// not-yet-committed currentLocation GPS sample). isInsideIjtemaArea is mocked to an exact
// coordinate-identity check so these tests exercise the threshold/commit mechanism itself,
// independent of the real venue polygon.
describe('DirectionsViewModel — outside presentation matches the active routing origin (near-boundary)', () => {
  const insideCoord = { latitude: 24.966, longitude: 67.004 };
  // ~5.6m from insideCoord — outside, but below DIRECTIONS_RECALCULATE_ORIGIN_MOVEMENT_M (20m).
  const nearBoundaryOutsideCoord = { latitude: insideCoord.latitude + 0.00005, longitude: insideCoord.longitude };
  // ~55.7m from insideCoord — outside, and above the movement threshold.
  const committedOutsideCoord = { latitude: insideCoord.latitude + 0.0005, longitude: insideCoord.longitude };

  let isInsideSpy: jest.SpyInstance;

  beforeEach(() => {
    isInsideSpy = jest
      .spyOn(EntryGateRoutingService, 'isInsideIjtemaArea')
      .mockImplementation(
        (coord: { latitude: number; longitude: number }) =>
          coord.latitude === insideCoord.latitude && coord.longitude === insideCoord.longitude,
      );
  });

  afterEach(() => {
    isInsideSpy.mockRestore();
  });

  test('1. a newer GPS sample outside but below the movement threshold does not flip the UI away from the still-inside active route origin', async () => {
    useAppStore.setState({ currentLocation: insideCoord, currentLocationSource: 'live', lastKnownLocation: insideCoord });
    const hook = await renderHook(() => useDirectionsViewModel(destination));
    expect(hook.result.current.isOutsideStart).toBe(false);

    await act(() => {
      useAppStore.getState().setCurrentLocation(nearBoundaryOutsideCoord, 'live');
    });

    // routeOriginLocation must not have moved (below threshold) — presentation must still agree.
    expect(hook.result.current.isOutsideStart).toBe(false);
  });

  test('2. once the GPS sample moves past the recalculation threshold, the UI commits to outside together with the active route origin', async () => {
    useAppStore.setState({ currentLocation: insideCoord, currentLocationSource: 'live', lastKnownLocation: insideCoord });
    const hook = await renderHook(() => useDirectionsViewModel(destination));
    expect(hook.result.current.isOutsideStart).toBe(false);

    await act(() => {
      useAppStore.getState().setCurrentLocation(committedOutsideCoord, 'live');
    });

    expect(hook.result.current.isOutsideStart).toBe(true);
  });

  test('3. reverse: once the origin commits back inside past the threshold, the UI returns to inside too', async () => {
    useAppStore.setState({ currentLocation: committedOutsideCoord, currentLocationSource: 'live', lastKnownLocation: committedOutsideCoord });
    const hook = await renderHook(() => useDirectionsViewModel(destination));
    expect(hook.result.current.isOutsideStart).toBe(true);

    await act(() => {
      useAppStore.getState().setCurrentLocation(insideCoord, 'live');
    });

    expect(hook.result.current.isOutsideStart).toBe(false);
  });

  test('4. manual and remembered start sources are unaffected by the live_gps movement threshold — they read their own coordinate directly, consistent with the fix', async () => {
    useAppStore.setState({ currentLocation: insideCoord, currentLocationSource: 'live', lastKnownLocation: committedOutsideCoord });
    const hook = await renderHook(() => useDirectionsViewModel(destination));
    expect(hook.result.current.isOutsideStart).toBe(false); // live_gps, inside

    await act(() => expect(hook.result.current.chooseRememberedLocation()).toBe(true));
    expect(hook.result.current.startSource).toBe('remembered_location');
    expect(hook.result.current.isOutsideStart).toBe(true); // remembered location is the committedOutsideCoord
  });
});

// The near-boundary suite above only ever asserts on isOutsideStart — a presentation-layer
// boolean. It cannot by itself prove resolveActiveOriginCoordinate() is genuinely the *one*
// function both sides read from, only that they happen to agree in these scenarios. This suite
// instead captures the actual `currentLocation` field of the real V2DirectionsService.calculatePreview
// request (the thing calculateRoute truly sends for calculation) and checks it against
// isOutsideStart at each step — proving the request origin and the presentation classification
// move together because they share one source, not because two independent computations
// happened to match.
describe('DirectionsViewModel — active-origin route-request proof', () => {
  const insideCoord = { latitude: 24.966, longitude: 67.004 };
  const nearBoundaryOutsideCoord = { latitude: insideCoord.latitude + 0.00005, longitude: insideCoord.longitude };
  const committedOutsideCoord = { latitude: insideCoord.latitude + 0.0005, longitude: insideCoord.longitude };
  const manualOrigin = { latitude: 24.97, longitude: 67.02 };
  // ~5.6m from committedOutsideCoord — still outside, but below the 20m movement threshold,
  // so it must not move the committed origin away from committedOutsideCoord.
  const nearCommittedOutsideCoord = { latitude: committedOutsideCoord.latitude + 0.00005, longitude: committedOutsideCoord.longitude };

  let isInsideSpy: jest.SpyInstance;
  // calculateRoute routes an outside-classified origin through calculateHybridPreview (async,
  // via the outside-request coordinator) and an inside-classified origin through the plain sync
  // calculatePreview — both spied without mockImplementation so real behavior (and every other
  // assertion in this file) is unaffected; this only lets the test inspect what was sent.
  let previewSpy: jest.SpyInstance;
  let hybridSpy: jest.SpyInstance;

  beforeEach(() => {
    isInsideSpy = jest
      .spyOn(EntryGateRoutingService, 'isInsideIjtemaArea')
      .mockImplementation(
        (coord: { latitude: number; longitude: number }) =>
          coord.latitude === insideCoord.latitude && coord.longitude === insideCoord.longitude,
      );
    previewSpy = jest.spyOn(V2DirectionsService, 'calculatePreview');
    hybridSpy = jest.spyOn(V2DirectionsService, 'calculateHybridPreview');
  });

  afterEach(() => {
    isInsideSpy.mockRestore();
    previewSpy.mockRestore();
    hybridSpy.mockRestore();
  });

  // Merges both spies by jest's own global invocationCallOrder so "the last request" is
  // correct regardless of which of the two underlying methods actually carried it.
  function lastRequestOrigin() {
    const fromPreview = previewSpy.mock.calls.map((args, i) => ({
      order: previewSpy.mock.invocationCallOrder[i],
      origin: args[0]?.currentLocation,
    }));
    const fromHybrid = hybridSpy.mock.calls.map((args, i) => ({
      order: hybridSpy.mock.invocationCallOrder[i],
      origin: args[0]?.request?.currentLocation,
    }));
    const merged = [...fromPreview, ...fromHybrid].sort((a, b) => a.order - b.order);
    return merged.at(-1)?.origin;
  }

  // Same merge-by-call-order technique as lastRequestOrigin(), but reports which of the two
  // underlying methods actually carried the most recent request — proves the request didn't
  // just carry the right origin by coincidence, but went through the correct provider path
  // for that origin's inside/outside classification.
  function lastRequestSource(): 'preview' | 'hybrid' | undefined {
    const fromPreview = previewSpy.mock.invocationCallOrder.map((order) => ({ order, source: 'preview' as const }));
    const fromHybrid = hybridSpy.mock.invocationCallOrder.map((order) => ({ order, source: 'hybrid' as const }));
    const merged = [...fromPreview, ...fromHybrid].sort((a, b) => a.order - b.order);
    return merged.at(-1)?.source;
  }

  test('1. the route-preview request origin equals the committed live_gps origin, matching isOutsideStart at the same instant', async () => {
    useAppStore.setState({ currentLocation: insideCoord, currentLocationSource: 'live', lastKnownLocation: insideCoord });
    const hook = await renderHook(() => useDirectionsViewModel(destination));
    await waitFor(() => expect(hook.result.current.loadState).toBe('ready'));

    expect(lastRequestOrigin()).toEqual(insideCoord);
    expect(hook.result.current.isOutsideStart).toBe(false);
  });

  test('2. a raw currentLocation sample below the movement threshold cannot alter the request origin or the presentation classification', async () => {
    useAppStore.setState({ currentLocation: insideCoord, currentLocationSource: 'live', lastKnownLocation: insideCoord });
    const hook = await renderHook(() => useDirectionsViewModel(destination));
    await waitFor(() => expect(hook.result.current.loadState).toBe('ready'));

    await act(() => {
      useAppStore.getState().setCurrentLocation(nearBoundaryOutsideCoord, 'live');
    });

    // routeOriginLocation (calculateRoute's real dependency) never moved — below the movement
    // threshold — so even if the raw GPS sample changing triggers an unrelated redundant
    // recalculation (e.g. via lastKnownLocation also being in calculateRoute's deps), that
    // recalculation's own request must still carry the *committed* origin, never the raw one.
    await waitFor(() => expect(lastRequestOrigin()).toEqual(insideCoord));
    expect(hook.result.current.isOutsideStart).toBe(false);
  });

  test('3. once the committed origin changes, the next request origin and isOutsideStart update together to the same new coordinate', async () => {
    useAppStore.setState({ currentLocation: insideCoord, currentLocationSource: 'live', lastKnownLocation: insideCoord });
    const hook = await renderHook(() => useDirectionsViewModel(destination));
    await waitFor(() => expect(hook.result.current.loadState).toBe('ready'));

    await act(() => {
      useAppStore.getState().setCurrentLocation(committedOutsideCoord, 'live');
    });

    await waitFor(() => expect(lastRequestOrigin()).toEqual(committedOutsideCoord));
    expect(hook.result.current.isOutsideStart).toBe(true);
  });

  test('4. a manual start origin reaches the request unchanged by the live_gps threshold mechanism', async () => {
    useAppStore.setState({ currentLocation: insideCoord, currentLocationSource: 'live', lastKnownLocation: insideCoord });
    const hook = await renderHook(() => useDirectionsViewModel(destination));
    await waitFor(() => expect(hook.result.current.loadState).toBe('ready'));

    await act(() => hook.result.current.setManualStartPlace({
      id: 'manual-origin-proof',
      name: 'Manual origin',
      category: 'CustomPoint',
      description: 'Manual origin',
      coordinate: manualOrigin,
      sourceVersion: 'v1',
    }));

    await waitFor(() => expect(hook.result.current.startSource).toBe('manual_place'));
    await waitFor(() => expect(lastRequestOrigin()).toEqual(manualOrigin));
  });

  test('5. a remembered-location origin reaches the request unchanged by the live_gps threshold mechanism', async () => {
    useAppStore.setState({ currentLocation: insideCoord, currentLocationSource: 'live', lastKnownLocation: committedOutsideCoord });
    const hook = await renderHook(() => useDirectionsViewModel(destination));
    await waitFor(() => expect(hook.result.current.loadState).toBe('ready'));

    await act(() => expect(hook.result.current.chooseRememberedLocation()).toBe(true));

    await waitFor(() => expect(hook.result.current.startSource).toBe('remembered_location'));
    await waitFor(() => expect(lastRequestOrigin()).toEqual(committedOutsideCoord));
    expect(hook.result.current.isOutsideStart).toBe(true);
  });

  test('6. reverse: a committed outside origin routes through calculateHybridPreview; once it commits back inside past the threshold, the request switches to calculatePreview with the new origin', async () => {
    useAppStore.setState({ currentLocation: committedOutsideCoord, currentLocationSource: 'live', lastKnownLocation: committedOutsideCoord });
    const hook = await renderHook(() => useDirectionsViewModel(destination));
    await waitFor(() => expect(hook.result.current.loadState).toBe('ready'));

    expect(lastRequestOrigin()).toEqual(committedOutsideCoord);
    expect(lastRequestSource()).toBe('hybrid');
    expect(hook.result.current.isOutsideStart).toBe(true);

    // A below-threshold raw GPS sample must change neither presentation nor the request origin.
    await act(() => {
      useAppStore.getState().setCurrentLocation(nearCommittedOutsideCoord, 'live');
    });
    expect(lastRequestOrigin()).toEqual(committedOutsideCoord);
    expect(lastRequestSource()).toBe('hybrid');
    expect(hook.result.current.isOutsideStart).toBe(true);

    // Crossing back past the threshold commits the new (inside) origin.
    await act(() => {
      useAppStore.getState().setCurrentLocation(insideCoord, 'live');
    });

    await waitFor(() => expect(lastRequestOrigin()).toEqual(insideCoord));
    expect(lastRequestSource()).toBe('preview');
    expect(hook.result.current.isOutsideStart).toBe(false);
  });
});

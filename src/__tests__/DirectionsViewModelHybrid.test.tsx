import type { Place } from '../models/types';
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
      fallbackHistory: [{ provider: 'google', code: 'proxy-unconfigured', retryable: true }],
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
    expect(manualRoute?.outsideRoute?.fallbackHistory).toEqual([
      { provider: 'google', code: 'proxy-unconfigured', retryable: true },
    ]);
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
        { provider: 'google', code: 'proxy-unconfigured', retryable: true },
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

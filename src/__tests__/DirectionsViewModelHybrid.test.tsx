import type { Place } from '../models/types';
import { V2PlaceAdapter } from '../services/V2PlaceAdapter';
import { useAppStore } from '../store/useAppStore';
import { V2DirectionsService } from '../services/V2DirectionsService';
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

    await act(() => hook.result.current.setManualStartPlace(outsideManualPlace()));
    await waitFor(() => expect(hook.result.current.route?.selectedOutsideCandidateId).not.toBe(gpsCandidateId), { timeout: 5_000 });

    const manualRoute = hook.result.current.route;
    expect(hook.result.current.startSource).toBe('manual_place');
    expect(manualRoute?.outsideRoute?.provider).toBe('offline-osm');
    expect(manualRoute?.startResolution?.gate?.id).toBe(gpsGateId);
    expect(manualRoute?.outsideRoute?.fallbackHistory).toEqual([
      { provider: 'google', code: 'proxy-unconfigured', retryable: true },
    ]);

    const manualCandidateId = manualRoute?.selectedOutsideCandidateId;
    await act(() => expect(hook.result.current.chooseRememberedLocation()).toBe(true));
    await waitFor(() => expect(hook.result.current.route?.selectedOutsideCandidateId).not.toBe(manualCandidateId), { timeout: 5_000 });

    expect(hook.result.current.startSource).toBe('remembered_location');
    expect(hook.result.current.route?.outsideRoute?.provider).toBe('offline-osm');
    expect(hook.result.current.route?.startResolution?.gate?.id).toBe(gpsGateId);
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

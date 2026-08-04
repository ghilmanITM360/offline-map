import type { Place } from '../models/types';
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

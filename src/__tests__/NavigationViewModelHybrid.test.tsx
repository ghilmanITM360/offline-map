import type { Place } from '../models/types';
import { V2DirectionsService } from '../services/V2DirectionsService';
import { V2NavigationAdapter } from '../services/V2NavigationAdapter';
import { createProductionOutsideRouteSource } from '../services/outsideRouting/ProductionOutsideRouteSource';
import { useAppStore } from '../store/useAppStore';
import { useNavigationViewModelV2 } from '../viewmodels/NavigationViewModelV2';
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

beforeEach(async () => {
  delete process.env.EXPO_PUBLIC_IJTEMA_ROUTING_PROXY_BASE_URL;
  process.env.EXPO_PUBLIC_USE_IJTEMA_V2_ROUTING = 'true';
  useAppStore.setState(initialStoreState, true);
  const preview = await V2DirectionsService.calculateHybridPreview({
    request: { startPlace: null, destination, currentLocation: origin, forceOutside: true },
    token: { requestId: 'navigation-initial', requestVersion: 1 },
    signal: new AbortController().signal,
    outsideProvider: createProductionOutsideRouteSource({ googleProxyBaseUrl: undefined }),
  });
  if (preview.status !== 'ready' || !preview.route) throw new Error('Hybrid navigation fixture must resolve.');
  const activeRoute = V2NavigationAdapter.fromPreview({
    previewRoute: preview.route,
    destination,
    currentLocation: origin,
  });
  useAppStore.getState().startNavigation(destination, activeRoute, activeRoute.instructions);
  useAppStore.setState({ currentLocation: origin, currentLocationSource: 'live' });
});

describe('NavigationViewModelV2 hybrid rerouting', () => {
  test('explicit retry uses hybrid flow and keeps navigation active', async () => {
    const hook = await renderHook(() => useNavigationViewModelV2());

    await act(() => hook.result.current.retryOutsideRoute());
    await waitFor(() => expect(hook.result.current.reroutePending).toBe(false), { timeout: 5_000 });

    expect(hook.result.current.route?.outsideRoute?.provider).toBe('offline-osm');
    expect(useAppStore.getState().isNavigating).toBe(true);
  });

  test('manual Gate 12 reroute stays authoritative', async () => {
    const hook = await renderHook(() => useNavigationViewModelV2());

    await act(() => hook.result.current.selectOutsideGate('GATE_12'));
    await waitFor(() => expect(hook.result.current.route?.startResolution?.gate?.id).toBe('GATE_12'), { timeout: 5_000 });

    expect(hook.result.current.route?.outsideRoute?.gateId).toBe('GATE_12');
    expect(hook.result.current.manualGateId).toBe('GATE_12');
    expect(useAppStore.getState().isNavigating).toBe(true);
  });

  test('retains current active route when replacement routing is unavailable', async () => {
    const routeBeforeRetry = useAppStore.getState().activeRoute;
    const previewSpy = jest.spyOn(V2DirectionsService, 'calculateHybridPreview').mockResolvedValueOnce({
      status: 'unavailable',
      route: null,
      instructions: [],
      message: 'Road routing is unavailable for this request.',
    });
    const hook = await renderHook(() => useNavigationViewModelV2());

    await act(() => hook.result.current.retryOutsideRoute());

    expect(useAppStore.getState().activeRoute).toBe(routeBeforeRetry);
    expect(useAppStore.getState().isNavigating).toBe(true);
    expect(hook.result.current.rerouteStatusMessage).toBe('Could not find a better route. Continuing current route.');
    previewSpy.mockRestore();
  });

  test('retains current active route when provider orchestration throws unexpectedly', async () => {
    const routeBeforeRetry = useAppStore.getState().activeRoute;
    const previewSpy = jest.spyOn(V2DirectionsService, 'calculateHybridPreview').mockRejectedValueOnce(new Error('provider exploded'));
    const hook = await renderHook(() => useNavigationViewModelV2());

    await act(() => hook.result.current.retryOutsideRoute());

    expect(useAppStore.getState().activeRoute).toBe(routeBeforeRetry);
    expect(hook.result.current.reroutePending).toBe(false);
    expect(hook.result.current.rerouteStatusMessage).toBe('Could not find a better route. Continuing current route.');
    previewSpy.mockRestore();
  });
});

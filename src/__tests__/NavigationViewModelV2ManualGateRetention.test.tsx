import type { Place, V2ActiveRoute } from '../models/types';
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

let manualGateRoute: V2ActiveRoute;

beforeAll(async () => {
  delete process.env.EXPO_PUBLIC_IJTEMA_ROUTING_PROXY_BASE_URL;
  process.env.EXPO_PUBLIC_USE_IJTEMA_V2_ROUTING = 'true';
  const preview = await V2DirectionsService.calculateHybridPreview({
    request: {
      startPlace: null,
      destination,
      currentLocation: origin,
      forceOutside: true,
      manualGateId: 'GATE_12',
    },
    token: { requestId: 'manual-gate-initial', requestVersion: 1 },
    signal: new AbortController().signal,
    outsideProvider: createProductionOutsideRouteSource({ googleProxyBaseUrl: undefined }),
  });
  if (preview.status !== 'ready' || !preview.route) throw new Error('Manual Gate 12 fixture must resolve.');
  manualGateRoute = V2NavigationAdapter.fromPreview({ previewRoute: preview.route, destination, currentLocation: origin });
});

beforeEach(() => {
  useAppStore.setState(initialStoreState, true);
  useAppStore.getState().startNavigation(destination, manualGateRoute, manualGateRoute.instructions);
  useAppStore.setState({ currentLocation: origin, currentLocationSource: 'live' });
});

describe('NavigationViewModelV2 manual gate session intent', () => {
  test('seeds initial manual gate and forwards it through automatic reroute', async () => {
    expect(manualGateRoute.origin).toMatchObject({
      gateId: 'GATE_12',
      manuallySelectedGate: true,
    });

    const previewSpy = jest
      .spyOn(V2DirectionsService, 'calculateHybridPreview')
      .mockResolvedValue({ status: 'unavailable', route: null, instructions: [], message: 'No replacement.' });
    const hook = await renderHook(() => useNavigationViewModelV2());

    expect(hook.result.current.manualGateId).toBe('GATE_12');

    const metersPerDegreeLat = 111320;
    for (let index = 0; index < 18; index += 1) {
      const point = {
        latitude: 24.985 + (index * 2) / metersPerDegreeLat,
        longitude: 67.02,
        accuracy: 5,
      };
      await act(async () => useAppStore.setState({ currentLocation: point, currentLocationSource: 'live' }));
    }
    await waitFor(() => expect(useAppStore.getState().reroutePending).toBe(false));

    expect(previewSpy).toHaveBeenCalledTimes(1);
    expect(previewSpy).toHaveBeenCalledWith(expect.objectContaining({
      request: expect.objectContaining({ manualGateId: 'GATE_12' }),
    }));
    expect(hook.result.current.manualGateId).toBe('GATE_12');
    previewSpy.mockRestore();
  });

  test('does not mark automatically selected gate as manual intent', async () => {
    const preview = await V2DirectionsService.calculateHybridPreview({
      request: { startPlace: null, destination, currentLocation: origin, forceOutside: true },
      token: { requestId: 'automatic-gate-initial', requestVersion: 1 },
      signal: new AbortController().signal,
      outsideProvider: createProductionOutsideRouteSource({ googleProxyBaseUrl: undefined }),
    });
    if (preview.status !== 'ready' || !preview.route) throw new Error('Automatic gate fixture must resolve.');
    const automaticRoute = V2NavigationAdapter.fromPreview({ previewRoute: preview.route, destination, currentLocation: origin });

    expect(automaticRoute.origin.manuallySelectedGate).not.toBe(true);
  });

  test('clears prior manual gate when a new automatic-mode trip starts', async () => {
    const hook = await renderHook(() => useNavigationViewModelV2());
    expect(hook.result.current.manualGateId).toBe('GATE_12');

    const preview = await V2DirectionsService.calculateHybridPreview({
      request: { startPlace: null, destination, currentLocation: origin, forceOutside: true },
      token: { requestId: 'new-automatic-trip', requestVersion: 1 },
      signal: new AbortController().signal,
      outsideProvider: createProductionOutsideRouteSource({ googleProxyBaseUrl: undefined }),
    });
    if (preview.status !== 'ready' || !preview.route) throw new Error('Automatic gate fixture must resolve.');
    const automaticRoute = V2NavigationAdapter.fromPreview({ previewRoute: preview.route, destination, currentLocation: origin });

    await act(async () => {
      useAppStore.getState().stopNavigation();
      useAppStore.getState().startNavigation(destination, automaticRoute, automaticRoute.instructions);
      useAppStore.setState({ currentLocation: origin, currentLocationSource: 'live' });
    });

    expect(hook.result.current.manualGateId).toBeNull();
  });
});

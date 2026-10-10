import { seedRunningNavigation } from './navigationFixture';
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

let readyPreview: Awaited<ReturnType<typeof V2DirectionsService.calculateHybridPreview>>;
let activeRoute: V2ActiveRoute;

beforeAll(async () => {
  delete process.env.EXPO_PUBLIC_IJTEMA_ROUTING_PROXY_BASE_URL;
  process.env.EXPO_PUBLIC_USE_IJTEMA_V2_ROUTING = 'true';
  readyPreview = await V2DirectionsService.calculateHybridPreview({
    request: { startPlace: null, destination, currentLocation: origin, forceOutside: true },
    token: { requestId: 'reroute-exception-initial', requestVersion: 1 },
    signal: new AbortController().signal,
    outsideProvider: createProductionOutsideRouteSource({ googleProxyBaseUrl: undefined }),
  });
  if (readyPreview.status !== 'ready' || !readyPreview.route) throw new Error('Fixture route must resolve.');
  activeRoute = V2NavigationAdapter.fromPreview({ previewRoute: readyPreview.route, destination, currentLocation: origin });
});

beforeEach(() => {
  useAppStore.setState(initialStoreState, true);
  seedRunningNavigation(destination, activeRoute, activeRoute.instructions);
  useAppStore.setState({ currentLocation: { ...origin, accuracy: 5, observedAtMs: Date.now() }, currentLocationSource: 'live' });
});

describe('NavigationViewModelV2 reroute exception safety (#143)', () => {
  test('a throw while building the replacement route clears Rerouting…, keeps the route and surfaces a message', async () => {
    jest.spyOn(V2DirectionsService, 'calculateHybridPreview').mockResolvedValue(readyPreview);
    jest.spyOn(V2NavigationAdapter, 'fromPreview').mockImplementation(() => {
      throw new Error('forced reroute failure');
    });
    const hook = await renderHook(() => useNavigationViewModelV2());

    for (let index = 0; index < 18; index += 1) {
      const point = { latitude: 24.985 + (index * 2) / 111320, longitude: 67.02, accuracy: 5 };
      await act(async () => useAppStore.setState({ currentLocation: { ...point, observedAtMs: Date.now() }, currentLocationSource: 'live' }));
    }

    await waitFor(() => expect(V2NavigationAdapter.fromPreview).toHaveBeenCalled());
    await waitFor(() => expect(useAppStore.getState().reroutePending).toBe(false));
    expect(useAppStore.getState().activeRoute).toBe(activeRoute);
    expect(hook.result.current.rerouteStatusMessage).toBe('Keep following the current route.');
    jest.restoreAllMocks();
  });
});

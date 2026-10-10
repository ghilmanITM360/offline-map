import { seedRunningNavigation } from './navigationFixture';
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// #139 Option B: a journey that reaches its destination is finished, so the unfinished-journey
// marker must be gone as soon as arrival is detected - not only after the user taps Done.

import type { Place, V2ActiveRoute } from '../models/types';
import { V2DirectionsService } from '../services/V2DirectionsService';
import { V2NavigationAdapter } from '../services/V2NavigationAdapter';
import { createProductionOutsideRouteSource } from '../services/outsideRouting/ProductionOutsideRouteSource';
import { useAppStore } from '../store/useAppStore';
import { useNavigationViewModelV2 } from '../viewmodels/NavigationViewModelV2';
import { act, renderHook } from './test-utils';

const initialStoreState = useAppStore.getState();
const origin = { latitude: 24.9762, longitude: 67.011 };
const destinationPlace: Place = {
  id: 'B34',
  name: 'Block 34',
  category: 'Block',
  description: 'Block 34',
  coordinate: { latitude: 24.966, longitude: 67.004 },
  sourceVersion: 'v2',
};

jest.setTimeout(15_000);

let sharedActiveRoute: V2ActiveRoute;

beforeAll(async () => {
  delete process.env.EXPO_PUBLIC_IJTEMA_ROUTING_PROXY_BASE_URL;
  process.env.EXPO_PUBLIC_USE_IJTEMA_V2_ROUTING = 'true';
  const preview = await V2DirectionsService.calculateHybridPreview({
    request: { startPlace: null, destination: destinationPlace, currentLocation: origin, forceOutside: true },
    token: { requestId: 'navigation-arrival-marker', requestVersion: 1 },
    signal: new AbortController().signal,
    outsideProvider: createProductionOutsideRouteSource({ googleProxyBaseUrl: undefined }),
  });
  if (preview.status !== 'ready' || !preview.route) throw new Error('Hybrid navigation fixture must resolve.');
  sharedActiveRoute = V2NavigationAdapter.fromPreview({
    previewRoute: preview.route,
    destination: destinationPlace,
    currentLocation: origin,
  });
});

beforeEach(() => {
  process.env.EXPO_PUBLIC_USE_IJTEMA_V2_ROUTING = 'true';
  useAppStore.setState(initialStoreState, true);
  seedRunningNavigation(destinationPlace, sharedActiveRoute, sharedActiveRoute.instructions);
});

describe('#139 Option B: arrival clears the unfinished-journey marker (V2)', () => {
  test('marker is set while navigating and cleared when arrival is detected', async () => {
    await renderHook(() => useNavigationViewModelV2());
    expect(useAppStore.getState().unfinishedJourney).not.toBeNull();

    await act(async () => {
      useAppStore.setState({
        currentLocation: { ...sharedActiveRoute.destination.coordinate, accuracy: 8, observedAtMs: Date.now() },
        currentLocationSource: 'live',
      });
    });
    expect(useAppStore.getState().unfinishedJourney).toBeNull();
  });

  test('handleExit clears the marker', async () => {
    const hook = await renderHook(() => useNavigationViewModelV2());
    await act(async () => {
      hook.result.current.handleExit();
    });
    expect(useAppStore.getState().unfinishedJourney).toBeNull();
  });
});

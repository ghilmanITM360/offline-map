/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// #139: a stale activeRoute in the store with isNavigating false (e.g. a preview, or anything
// left behind by a restored blob) must not engage the live navigation runtime.

import type { Place, V2ActiveRoute } from '../models/types';
import { GPSManagerService } from '../services/GPSManagerService';
import { V2DirectionsService } from '../services/V2DirectionsService';
import { V2NavigationAdapter } from '../services/V2NavigationAdapter';
import { createProductionOutsideRouteSource } from '../services/outsideRouting/ProductionOutsideRouteSource';
import { useAppStore } from '../store/useAppStore';
import { useNavigationViewModelV2 } from '../viewmodels/NavigationViewModelV2';
import { renderHook } from './test-utils';

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

let activeRoute: V2ActiveRoute;

beforeAll(async () => {
  delete process.env.EXPO_PUBLIC_IJTEMA_ROUTING_PROXY_BASE_URL;
  process.env.EXPO_PUBLIC_USE_IJTEMA_V2_ROUTING = 'true';
  const preview = await V2DirectionsService.calculateHybridPreview({
    request: { startPlace: null, destination: destinationPlace, currentLocation: origin, forceOutside: true },
    token: { requestId: 'navigation-idle', requestVersion: 1 },
    signal: new AbortController().signal,
    outsideProvider: createProductionOutsideRouteSource({ googleProxyBaseUrl: undefined }),
  });
  if (preview.status !== 'ready' || !preview.route) throw new Error('Hybrid navigation fixture must resolve.');
  activeRoute = V2NavigationAdapter.fromPreview({
    previewRoute: preview.route,
    destination: destinationPlace,
    currentLocation: origin,
  });
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('NavigationViewModelV2 idle (#139)', () => {
  it('a stored activeRoute with isNavigating=false does not attach a navigation GPS listener', async () => {
    useAppStore.setState(initialStoreState, true);
    useAppStore.setState({ activeRoute, isNavigating: false });
    const addListener = jest.spyOn(GPSManagerService, 'addListener');
    const forceFix = jest.spyOn(GPSManagerService, 'forceFix');

    const hook = await renderHook(() => useNavigationViewModelV2());

    expect(hook.result.current.route).toBeNull();
    expect(addListener).not.toHaveBeenCalledWith(expect.anything(), 'navigation');
    expect(forceFix).not.toHaveBeenCalled();
  });
});

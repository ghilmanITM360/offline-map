import { seedRunningNavigation } from './navigationFixture';
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Place, V2ActiveRoute } from '../models/types';
import { V2DirectionsService } from '../services/V2DirectionsService';
import { V2NavigationAdapter } from '../services/V2NavigationAdapter';
import { createProductionOutsideRouteSource } from '../services/outsideRouting/ProductionOutsideRouteSource';
import { GPS_LOST_TIMEOUT_MS } from '../services/V2NavigationRuntimeService';
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
    token: { requestId: 'navigation-gps-freshness', requestVersion: 1 },
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
  delete process.env.EXPO_PUBLIC_IJTEMA_ROUTING_PROXY_BASE_URL;
  process.env.EXPO_PUBLIC_USE_IJTEMA_V2_ROUTING = 'true';
  useAppStore.setState(initialStoreState, true);
  seedRunningNavigation(destinationPlace, sharedActiveRoute, sharedActiveRoute.instructions);
});

afterEach(() => {
  jest.useRealTimers();
});

describe('NavigationViewModelV2 GPS freshness (AUD-05)', () => {
  test('GPS_LOST persists through an unrelated mute toggle and only clears on a genuinely new fix', async () => {
    jest.useFakeTimers();

    const hook = await renderHook(() => useNavigationViewModelV2());

    await act(async () => {
      useAppStore.setState({
        currentLocation: { ...origin, accuracy: 8, observedAtMs: Date.now() },
        currentLocationSource: 'live',
      });
    });
    expect(hook.result.current.gpsSignalState).not.toBe('GPS_LOST');

    // No further fixes arrive at all for longer than GPS_LOST_TIMEOUT_MS — the independent 1s
    // polling effect must declare the signal lost.
    await act(async () => {
      jest.advanceTimersByTime(GPS_LOST_TIMEOUT_MS + 1500);
    });
    expect(hook.result.current.gpsSignalState).toBe('GPS_LOST');

    // Muting is a wholly unrelated UI action with no new GPS data behind it. Because `isMuted`
    // sits in the location effect's own dependency array, this re-runs that effect against the
    // exact same (now stale) currentLocation — it must not be mistaken for a fresh fix.
    await act(async () => {
      useAppStore.getState().setIsMuted(true);
    });
    expect(hook.result.current.gpsSignalState).toBe('GPS_LOST');

    // A genuinely new observation (fresh observedAtMs) must still restore it.
    await act(async () => {
      useAppStore.setState({
        currentLocation: { ...origin, accuracy: 8, observedAtMs: Date.now() },
        currentLocationSource: 'live',
      });
    });
    expect(hook.result.current.gpsSignalState).not.toBe('GPS_LOST');
  });
});

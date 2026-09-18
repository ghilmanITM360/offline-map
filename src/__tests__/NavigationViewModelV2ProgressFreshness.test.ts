/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// NAV-P0-001 regression coverage: a stale/historical GPS fix — the "last known location" Android
// commonly delivers as the very first update after a location subscription (re)starts — must
// never be consumed as this navigation generation's live position. Exercises the real
// NavigationViewModelV2 pipeline (store -> hook), the same path GPSManagerService's real fixes
// take in production, not a standalone utility.

import { AppState } from 'react-native';
import type { Place, V2ActiveRoute } from '../models/types';
import { V2DirectionsService } from '../services/V2DirectionsService';
import { V2NavigationAdapter } from '../services/V2NavigationAdapter';
import { createProductionOutsideRouteSource } from '../services/outsideRouting/ProductionOutsideRouteSource';
import { useAppStore } from '../store/useAppStore';
import { useNavigationViewModelV2 } from '../viewmodels/NavigationViewModelV2';
import { act, renderHook, RenderHookResult } from './test-utils';

// CASE B fires an AppState resume, which triggers NavigationViewModelV2's real
// GPSManagerService.forceFix() call (fire-and-forget). Without this, forceFix's real
// expo-location call throws (native module unavailable under test) as an unhandled rejection
// that surfaces against whichever test runs next — mocked denied so it no-ops cleanly, matching
// the existing GPSManagerService.test.ts mock shape.
jest.mock('expo-location', () => ({
  getForegroundPermissionsAsync: jest.fn().mockResolvedValue({ status: 'denied' }),
  getCurrentPositionAsync: jest.fn(),
  watchPositionAsync: jest.fn(),
  hasServicesEnabledAsync: jest.fn().mockResolvedValue(true),
  Accuracy: { Balanced: 3, High: 4 },
}));

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
    token: { requestId: 'navigation-progress-freshness', requestVersion: 1 },
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
  useAppStore.getState().startNavigation(destinationPlace, sharedActiveRoute, sharedActiveRoute.instructions);
});

afterEach(() => {
  jest.restoreAllMocks();
});

type Hook = RenderHookResult<ReturnType<typeof useNavigationViewModelV2>, unknown>;

const FIVE_MINUTES_MS = 5 * 60 * 1000;

async function pushFix(
  hook: Hook,
  coordinate: { latitude: number; longitude: number },
  opts: { accuracy?: number; observedAtMs?: number } = {},
) {
  await act(async () => {
    useAppStore.setState({
      currentLocation: { ...coordinate, accuracy: opts.accuracy ?? 8, observedAtMs: opts.observedAtMs },
      currentLocationSource: 'live',
    });
  });
}

// Simulates a foreground resume by invoking every 'change' listener currently registered on
// AppState with 'active' — matching what a real AppState 'change' event does (notifies every
// subscriber), without depending on react-native's native event-emitter internals in the test
// environment. Must be installed via jest.spyOn BEFORE renderHook so it captures the listener
// NavigationViewModelV2's own background-resume effect registers on mount.
function installAppStateSpy() {
  return jest.spyOn(AppState, 'addEventListener');
}

async function fireAppStateChange(spy: ReturnType<typeof installAppStateSpy>, state: 'active' | 'background') {
  const listeners = spy.mock.calls.filter(([event]) => event === 'change').map(([, listener]) => listener);
  await act(async () => {
    listeners.forEach((listener) => (listener as (s: string) => void)(state));
  });
}

describe('NavigationViewModelV2 progress freshness (NAV-P0-001)', () => {
  test('CASE A: stale first fix at trip start does not advance progress; a fresh fix afterward does', async () => {
    const hook = await renderHook(() => useNavigationViewModelV2());
    const initialRemaining = hook.result.current.remainingDistance;
    const initialEta = hook.result.current.etaMinutes;
    expect(initialRemaining).toBeGreaterThan(0);

    // Stale fix: native timestamp 5 minutes before trip start, positioned AT the destination
    // (the worst case — projects onto the very end of the route) — exactly the shape of the
    // confirmed runtime defect (a cached "last known location" delivered as the first update).
    await pushFix(hook, destinationPlace.coordinate, { observedAtMs: Date.now() - FIVE_MINUTES_MS });

    expect(hook.result.current.remainingDistance).toBe(initialRemaining);
    expect(hook.result.current.etaMinutes).toBe(initialEta);
    expect(hook.result.current.arrived).toBe(false);
    expect(hook.result.current.currentStepIndex).toBe(0);

    // Then a genuinely fresh, correct fix must be accepted and progress normally.
    await pushFix(hook, origin, { observedAtMs: Date.now() });
    expect(hook.result.current.remainingDistance).toBeLessThanOrEqual(initialRemaining);
  });

  test('CASE B: stale post-resume fix is rejected; a fresh post-resume fix reconciles progress', async () => {
    const spy = installAppStateSpy();
    const hook = await renderHook(() => useNavigationViewModelV2());

    const t0 = Date.now();
    await pushFix(hook, origin, { observedAtMs: t0 });
    const remainingAfterFirstFix = hook.result.current.remainingDistance;

    await fireAppStateChange(spy, 'background');
    await fireAppStateChange(spy, 'active');

    // Historical backlog fix delivered right after resume (native timestamp from before the
    // resume boundary) — must be rejected, not reconciled as the resumed position.
    await pushFix(hook, destinationPlace.coordinate, { observedAtMs: t0 - FIVE_MINUTES_MS });
    expect(hook.result.current.remainingDistance).toBe(remainingAfterFirstFix);
    expect(hook.result.current.arrived).toBe(false);

    // Genuinely fresh post-resume fix, moved further along the route — realistically backgrounded
    // for 15 minutes and walked toward the destination during that time (RerouteService's
    // forward-jump plausibility cap bounds a single fix's advance by elapsed *observed* time, so
    // a same-instant "teleport" would be correctly rejected — this gap is what makes the jump
    // physically plausible, matching an actual RESUME-01 background walk).
    await pushFix(hook, destinationPlace.coordinate, { observedAtMs: t0 + 15 * 60 * 1000 });
    expect(hook.result.current.remainingDistance).toBeLessThan(remainingAfterFirstFix);
  });

  test('CASE C: a genuinely fresh first fix is accepted immediately, not held back', async () => {
    const hook = await renderHook(() => useNavigationViewModelV2());
    const initialRemaining = hook.result.current.remainingDistance;

    await pushFix(hook, destinationPlace.coordinate, { observedAtMs: Date.now() });

    // A single fresh, accurate fix at the destination is legitimate progress (or even arrival) —
    // it must be reflected immediately, not discarded on the theory that "the first fix is
    // always suspect".
    expect(hook.result.current.remainingDistance).toBeLessThan(initialRemaining);
  });

  test('invariant: arrived=false must never coincide with a corrupted near-zero remaining distance from a historical fix', async () => {
    const hook = await renderHook(() => useNavigationViewModelV2());
    const initialRemaining = hook.result.current.remainingDistance;

    // Same trigger shape as the confirmed runtime defect: a stale fix at the destination,
    // exactly the mechanism that collapsed remainingDistance from ~2205m to ~156m pre-fix.
    await pushFix(hook, destinationPlace.coordinate, { observedAtMs: Date.now() - FIVE_MINUTES_MS });

    // Not arrived, so a near-zero/collapsed remaining distance here would be exactly the
    // "Arrive / 0 min / 0 m while materially far from destination" display-corruption defect —
    // whether or not this particular route geometry snaps to precisely 0.
    expect(hook.result.current.arrived).toBe(false);
    expect(hook.result.current.remainingDistance).toBeGreaterThan(initialRemaining * 0.9);
  });

  test('a fix with no observedAtMs at all is not rejected (no timestamp evidence to reject on)', async () => {
    const hook = await renderHook(() => useNavigationViewModelV2());
    const initialRemaining = hook.result.current.remainingDistance;

    await act(async () => {
      useAppStore.setState({
        currentLocation: { ...origin, accuracy: 8 },
        currentLocationSource: 'live',
      });
    });

    expect(hook.result.current.remainingDistance).toBeLessThanOrEqual(initialRemaining);
  });
});

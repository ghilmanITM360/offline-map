/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Origin truthfulness: a route may start only from a LIVE fix (fresh, usable) or from a start the user chose for
// THIS journey (MANUAL). Anything else left over from an earlier trip, an earlier session or the camera must never
// become the start: the journey asks (needs_origin) instead.

import { V2PlaceAdapter } from '../services/V2PlaceAdapter';
import { useAppStore } from '../store/useAppStore';
import { useDirectionsViewModel } from '../viewmodels/DirectionsViewModel';
import type { Coordinate } from '../models/types';
import { act, renderHook, waitFor } from './test-utils';

const initialStoreState = useAppStore.getState();
const destination = V2PlaceAdapter.getPlaceById('B1')!;
const previousStart = V2PlaceAdapter.getPlaceById('B27')!;
const previousDestination = V2PlaceAdapter.getPlaceById('B14') ?? previousStart;

const insideFix = (over: Partial<Coordinate> = {}): Coordinate =>
  ({ latitude: 24.9636, longitude: 67.0063, accuracy: 8, observedAtMs: Date.now(), ...over });

beforeEach(() => {
  process.env.EXPO_PUBLIC_USE_IJTEMA_V2_ROUTING = 'true';
  useAppStore.setState(initialStoreState, true);
  useAppStore.setState({ currentLocation: null, currentLocationSource: null, hasLocationPermission: true, locationPermissionPrecision: 'fine' });
});

async function openJourney() {
  const hook = await renderHook(() => useDirectionsViewModel(destination));
  return hook;
}

async function expectNeedsStart(hook: Awaited<ReturnType<typeof openJourney>>) {
  await waitFor(() => expect(hook.result.current.loadState).toBe('needs_origin'));
  expect(hook.result.current.route).toBeNull();
  expect(hook.result.current.manualStart).toBeNull();
  expect(hook.result.current.activeOriginCoordinate).toBeNull();
  expect(hook.result.current.startSourceLabel).toBe('Choose where to start');
  expect(hook.result.current.startSource).toBe('manual_place');
}

describe('Origin truth: destination only, nothing chosen for this journey', () => {
  test('1: clean app + destination only asks where to start', async () => {
    await expectNeedsStart(await openJourney());
  });

  test('2: a previous manual journey (start left in the store) never starts the next one', async () => {
    useAppStore.setState({ routePlannerOrigin: previousStart, routePlannerDest: previousDestination });
    const hook = await openJourney();
    await expectNeedsStart(hook);
    expect(useAppStore.getState().routePlannerOrigin).toBeNull();
  });

  test('3: a previous Route Guide does not carry into a new destination', async () => {
    useAppStore.setState({ routeGuide: { steps: [{ text: 'Walk on', distanceM: 40 }], stepIndex: 0 } });
    const hook = await openJourney();
    await expectNeedsStart(hook);
    expect(useAppStore.getState().routeGuide).toBeNull();
  });

  test('4/12: after a cold relaunch only non-journey state exists (remembered location, recents, marker): ask', async () => {
    useAppStore.setState({
      lastKnownLocation: insideFix({ observedAtMs: undefined }),
      lastKnownLocationUpdatedAt: new Date(Date.now() - 5 * 60_000).toISOString(),
      recentSearches: [previousStart],
    });
    await expectNeedsStart(await openJourney());
  });

  test('5: the Block 2 camera fallback is not a start, even if it sits in the store as a manual position', async () => {
    const block2 = V2PlaceAdapter.getPlaceById('B2')!;
    useAppStore.setState({ currentLocation: block2.coordinate as Coordinate, currentLocationSource: 'manual' });
    await expectNeedsStart(await openJourney());
  });

  test('6: a remembered location in the store is not a start until the user picks it', async () => {
    useAppStore.setState({
      currentLocation: insideFix(),
      currentLocationSource: 'remembered',
      lastKnownLocation: insideFix(),
      lastKnownLocationUpdatedAt: new Date().toISOString(),
    });
    const hook = await openJourney();
    await expectNeedsStart(hook);
    expect(hook.result.current.rememberedLocationAvailable).toBe(true); // still offered as an explicit choice
  });

  test('6: a device last-known position is not a start', async () => {
    useAppStore.setState({ currentLocation: insideFix(), currentLocationSource: 'device_last_known' });
    await expectNeedsStart(await openJourney());
  });

  test('6: a live fix that has gone stale is not a start', async () => {
    useAppStore.setState({ currentLocation: insideFix({ observedAtMs: Date.now() - 10 * 60_000 }), currentLocationSource: 'live' });
    await expectNeedsStart(await openJourney());
  });

  test('6: a live fix too weak to place the user is not a start', async () => {
    useAppStore.setState({ currentLocation: insideFix({ accuracy: 500 }), currentLocationSource: 'live' });
    await expectNeedsStart(await openJourney());
  });

  test('9: a place left in pendingDirectorySelection by an earlier workflow is not a start', async () => {
    useAppStore.setState({ pendingDirectorySelection: previousStart });
    await expectNeedsStart(await openJourney());
  });

  test('10: a destination equal to the previous start still asks, it is not "same place"', async () => {
    useAppStore.setState({ routePlannerOrigin: destination, routePlannerDest: previousDestination });
    const hook = await openJourney();
    await expectNeedsStart(hook);
  });
});

describe('Origin truth: the two truthful origins still work', () => {
  test('7: a fresh usable live fix is the LIVE start', async () => {
    const fix = insideFix();
    useAppStore.setState({ currentLocation: fix, currentLocationSource: 'live' });
    const hook = await openJourney();
    await waitFor(() => expect(hook.result.current.loadState).toBe('ready'), { timeout: 8_000 });
    expect(hook.result.current.startSource).toBe('live_gps');
    expect(hook.result.current.activeOriginCoordinate).toMatchObject({ latitude: fix.latitude, longitude: fix.longitude });
  });

  test('8: a start the user chose for this journey is the MANUAL start', async () => {
    const hook = await openJourney();
    await act(async () => hook.result.current.setManualStartPlace(previousStart));
    await waitFor(() => expect(hook.result.current.loadState).toBe('ready'), { timeout: 8_000 });
    expect(hook.result.current.startSource).toBe('manual_place');
    expect(hook.result.current.manualStart?.id).toBe(previousStart.id);
  });

  test('11: a chosen start equal to the destination is the same place', async () => {
    const hook = await openJourney();
    await act(async () => hook.result.current.setManualStartPlace(destination));
    await waitFor(() => expect(hook.result.current.loadState).toBe('same_place'));
  });

  test('an explicitly chosen earlier location is a user choice for this journey and still works', async () => {
    useAppStore.setState({ lastKnownLocation: insideFix(), lastKnownLocationUpdatedAt: new Date().toISOString() });
    const hook = await openJourney();
    await expectNeedsStart(hook);
    await act(async () => { hook.result.current.chooseRememberedLocation(); });
    await waitFor(() => expect(hook.result.current.startSource).toBe('remembered_location'));
    await waitFor(() => expect(hook.result.current.loadState).toBe('ready'), { timeout: 8_000 });
  });
});

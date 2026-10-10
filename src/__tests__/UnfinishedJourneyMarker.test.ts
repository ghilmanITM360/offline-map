/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// #139 Option B: after Android process death during navigation, only a tiny coordinate-free
// "unfinished journey" marker survives. Nothing is resumed: no active route, progress, watcher,
// reroute state or arrival latch. These tests pin that contract.

import * as Location from 'expo-location';
import type { Place } from '../models/types';
import { GPSManagerService } from '../services/GPSManagerService';
import { useAppStore, waitForStoreHydration, selectUnfinishedJourney, selectHasUnfinishedJourney } from '../store/useAppStore';
import { UNFINISHED_JOURNEY_TTL_MS } from '../utils/unfinishedJourney';

jest.mock('expo-location', () => ({
  Accuracy: { High: 5, Balanced: 3 },
  watchPositionAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
  getForegroundPermissionsAsync: jest.fn(),
  hasServicesEnabledAsync: jest.fn(),
}));

const initialStoreState = useAppStore.getState();
const realPersistOptions = useAppStore.persist.getOptions();

const NOW = 1_790_000_000_000;
const place: Place = {
  id: 'B34',
  name: 'Block 34',
  category: 'Block',
  description: 'Block 34',
  coordinate: { latitude: 24.966, longitude: 67.004 },
  sourceVersion: 'v2',
};
const route = { sourceVersion: 'v2', id: 'marker-preview', nodes: [], segments: [], coordinates: [{ latitude: 24.9762, longitude: 67.011 }, place.coordinate], totalDistance: 1200, estimatedTimeMin: 15, startLabel: 'Live location', destinationLabel: place.name } as never;
const fix = { latitude: 24.9762, longitude: 67.011, accuracy: 5, observedAtMs: NOW };

function startAuthorizedMarkerNavigation(...args: Parameters<ReturnType<typeof useAppStore.getState>['startNavigation']>) {
  useAppStore.setState({ hasLocationPermission: true, locationPermissionPrecision: 'fine', locationServicesState: 'enabled', currentLocation: fix, currentLocationSource: 'live', routePlannerOrigin: null, routePlannerDest: args[0], activeRoute: route });
  const activated = useAppStore.getState().startNavigation(...args);
  expect(activated).toBe(true);
}


type Blob = { state: Record<string, unknown>; version: number };

function recordingStorage(stored: Blob | null = null) {
  const setItem = jest.fn(() => Promise.resolve());
  return {
    storage: { getItem: () => Promise.resolve(stored), setItem, removeItem: () => Promise.resolve() },
    lastWrite: () => (setItem.mock.calls.at(-1) as unknown as [string, Blob])[1],
  };
}

const marker = (over: Record<string, unknown> = {}) => ({
  version: 1, unfinishedNavigation: true, createdAt: NOW - 60_000, destinationId: 'B34', ...over,
});

// Simulates the next process: fresh JS defaults, hydrate from a stored blob.
async function relaunchWith(unfinishedJourney: unknown) {
  useAppStore.setState(initialStoreState, true);
  useAppStore.persist.setOptions({
    storage: recordingStorage({ state: { unfinishedJourney }, version: 2 }).storage,
  });
  await useAppStore.persist.rehydrate();
  await expect(waitForStoreHydration()).resolves.toEqual({ outcome: 'success' });
}

beforeEach(() => {
  jest.spyOn(Date, 'now').mockReturnValue(NOW);
  useAppStore.setState(initialStoreState, true);
});

afterEach(() => {
  jest.restoreAllMocks();
  useAppStore.persist.setOptions(realPersistOptions);
});

describe('#139 Option B: when the marker is written and cleared', () => {
  it('starts null', () => {
    expect(useAppStore.getState().unfinishedJourney).toBeNull();
  });

  it('active navigation creates the marker', () => {
    startAuthorizedMarkerNavigation(place, route, []);
    expect(useAppStore.getState().unfinishedJourney).toEqual(marker({ createdAt: NOW }));
  });

  it('route preview, directory selection and directions setup never create it', () => {
    const s = useAppStore.getState();
    s.setSelectedPlace(place);
    s.setPendingDirectorySelection(place);
    s.setRoutePlannerDest(place);
    s.setRoutePlannerOrigin(place);
    s.setActiveRoute(route);
    expect(useAppStore.getState().unfinishedJourney).toBeNull();
  });

  it('explicit Exit (stopNavigation) clears it', () => {
    startAuthorizedMarkerNavigation(place, route, []);
    useAppStore.getState().stopNavigation();
    expect(useAppStore.getState().unfinishedJourney).toBeNull();
  });

  it('clearUnfinishedJourney() clears it without touching the live session', () => {
    startAuthorizedMarkerNavigation(place, route, []);
    useAppStore.getState().clearUnfinishedJourney();
    const s = useAppStore.getState();
    expect(s.unfinishedJourney).toBeNull();
    expect(s.isNavigating).toBe(true);
    expect(s.destination).toEqual(place);
  });

  it('a destination without a usable id writes no marker', () => {
    startAuthorizedMarkerNavigation({ ...place, id: '' }, route, []);
    expect(useAppStore.getState().unfinishedJourney).toBeNull();
  });
});

describe('#139 Option B: privacy (#145) - the persisted payload holds no location data', () => {
  it('writes exactly four fields and no coordinate, route or movement data', () => {
    const rec = recordingStorage();
    useAppStore.persist.setOptions({ storage: rec.storage });
    startAuthorizedMarkerNavigation(place, route, [{ id: 'i1', text: 'Turn left' } as never]);
    useAppStore.getState().setCurrentLocation(fix, 'live');

    const written = rec.lastWrite().state.unfinishedJourney as Record<string, unknown>;
    expect(Object.keys(written).sort()).toEqual(['createdAt', 'destinationId', 'unfinishedNavigation', 'version']);
    const json = JSON.stringify(written);
    expect(json).not.toMatch(/lat|lon|coordinate|polyline|geometry|accuracy|heading|instruction|distance/i);
    expect(json).not.toContain(String(place.coordinate.latitude));
    expect(json).not.toContain(String(fix.latitude));
  });
});

describe('#139 Option B: hydration after process death', () => {
  it('the marker survives rehydration and is exposed', async () => {
    const rec = recordingStorage();
    useAppStore.persist.setOptions({ storage: rec.storage });
    startAuthorizedMarkerNavigation(place, route, []);
    const written = rec.lastWrite();

    useAppStore.setState(initialStoreState, true);
    useAppStore.persist.setOptions({ storage: recordingStorage(written).storage });
    await useAppStore.persist.rehydrate();

    expect(selectHasUnfinishedJourney(useAppStore.getState())).toBe(true);
    expect(selectUnfinishedJourney(useAppStore.getState())).toEqual(marker({ createdAt: NOW }));
  });

  it('a marker under 2 h old is exposed; exactly 2 h is still valid', async () => {
    await relaunchWith(marker({ createdAt: NOW - UNFINISHED_JOURNEY_TTL_MS }));
    expect(selectUnfinishedJourney(useAppStore.getState())).not.toBeNull();
  });

  it('a marker over 2 h old is cleared on hydration and never exposed', async () => {
    await relaunchWith(marker({ createdAt: NOW - UNFINISHED_JOURNEY_TTL_MS - 1 }));
    expect(useAppStore.getState().unfinishedJourney).toBeNull();
    expect(selectHasUnfinishedJourney(useAppStore.getState())).toBe(false);
  });

  it('expiry is also evaluated on read: a valid marker stops being exposed once it ages out', async () => {
    await relaunchWith(marker());
    expect(selectUnfinishedJourney(useAppStore.getState())).not.toBeNull();
    expect(selectUnfinishedJourney(useAppStore.getState(), NOW + UNFINISHED_JOURNEY_TTL_MS)).toBeNull();
  });

  it.each([
    ['unknown version', marker({ version: 2 })],
    ['missing version', marker({ version: undefined })],
    ['flag not true', marker({ unfinishedNavigation: false })],
    ['non-numeric createdAt', marker({ createdAt: 'yesterday' })],
    ['NaN createdAt', marker({ createdAt: Number.NaN })],
    ['future createdAt', marker({ createdAt: NOW + 1 })],
    ['empty destinationId', marker({ destinationId: '' })],
    ['non-string destinationId', marker({ destinationId: 34 })],
    ['smuggled coordinates', marker({ latitude: 24.9, longitude: 67.0 })],
    ['array', []],
    ['string', 'unfinished'],
    ['number', 7],
  ])('fails closed on %s', async (_label, bad) => {
    await relaunchWith(bad);
    expect(useAppStore.getState().unfinishedJourney).toBeNull();
    expect(selectHasUnfinishedJourney(useAppStore.getState())).toBe(false);
  });

  it('a stale blob rehydrated mid-journey cannot wipe the live journey marker', async () => {
    startAuthorizedMarkerNavigation(place, route, []);
    useAppStore.persist.setOptions({
      storage: recordingStorage({ state: { unfinishedJourney: null }, version: 2 }).storage,
    });
    await useAppStore.persist.rehydrate();
    expect(useAppStore.getState().isNavigating).toBe(true);
    expect(useAppStore.getState().unfinishedJourney).toEqual(marker({ createdAt: NOW }));
  });

  it('a blob with no marker field leaves it null', async () => {
    useAppStore.setState(initialStoreState, true);
    useAppStore.persist.setOptions({ storage: recordingStorage({ state: {}, version: 2 }).storage });
    await useAppStore.persist.rehydrate();
    expect(useAppStore.getState().unfinishedJourney).toBeNull();
  });

  it('hydration leaves the core idle: nothing active, no route, progress, reroute or session carried over', async () => {
    useAppStore.getState().setReroutePending(true);
    await relaunchWith(marker());
    const s = useAppStore.getState();
    expect(s.isNavigating).toBe(false);
    expect(s.activeRoute).toBeNull();
    expect(s.destination).toBeNull();
    expect(s.routeInstructions).toEqual([]);
    expect(s.reroutePending).toBe(false);
    expect(s.navigationSessionId).toBe(initialStoreState.navigationSessionId);
    expect(s.currentLocation).toBeNull();
    expect(s.snappedLocation).toBeNull();
  });

  it('hydration registers no GPS watcher', async () => {
    const watch = Location.watchPositionAsync as jest.Mock;
    watch.mockClear();
    const addListener = jest.spyOn(GPSManagerService, 'addListener');
    await relaunchWith(marker());
    expect(watch).not.toHaveBeenCalled();
    expect(addListener).not.toHaveBeenCalled();
  });
});

describe('#139 Option B: recovery builds a NEW journey through the normal flow', () => {
  it('beginRecovery hands the destination to the normal place-select flow and consumes the marker', async () => {
    await relaunchWith(marker());
    const recovered = useAppStore.getState().beginRecovery();

    const s = useAppStore.getState();
    expect(recovered?.id).toBe('B34');
    expect(s.pendingDirectorySelection?.id).toBe('B34');
    expect(s.unfinishedJourney).toBeNull();
    // Recovery never starts, resumes or marks anything.
    expect(s.isNavigating).toBe(false);
    expect(s.activeRoute).toBeNull();
    expect(s.navigationSessionId).toBe(initialStoreState.navigationSessionId);
  });

  it('a destination that no longer resolves is dropped silently', async () => {
    await relaunchWith(marker({ destinationId: 'no-such-place' }));
    expect(useAppStore.getState().beginRecovery()).toBeNull();
    expect(useAppStore.getState().pendingDirectorySelection).toBeNull();
    expect(useAppStore.getState().unfinishedJourney).toBeNull();
  });

  it('with no marker, or an expired one, beginRecovery does nothing', async () => {
    expect(useAppStore.getState().beginRecovery()).toBeNull();
    await relaunchWith(marker());
    jest.spyOn(Date, 'now').mockReturnValue(NOW + UNFINISHED_JOURNEY_TTL_MS + 1);
    expect(useAppStore.getState().beginRecovery()).toBeNull();
    expect(useAppStore.getState().pendingDirectorySelection).toBeNull();
  });

  it('beginRecovery during a live journey is a no-op and keeps that journey marked', () => {
    startAuthorizedMarkerNavigation(place, route, []);
    expect(useAppStore.getState().beginRecovery()).toBeNull();
    expect(useAppStore.getState().isNavigating).toBe(true);
    expect(useAppStore.getState().unfinishedJourney).not.toBeNull();
  });

  it('the next Start Navigation is a brand new session with a fresh marker; arrival and reroute state start clean', async () => {
    await relaunchWith(marker({ createdAt: NOW - 3_600_000 }));
    useAppStore.getState().beginRecovery();

    jest.spyOn(Date, 'now').mockReturnValue(NOW + 5_000);
    startAuthorizedMarkerNavigation(place, route, []);
    const s = useAppStore.getState();
    expect(s.navigationSessionId).toBe(initialStoreState.navigationSessionId + 1);
    expect(s.reroutePending).toBe(false);
    expect(s.unfinishedJourney).toEqual(marker({ createdAt: NOW + 5_000 }));
  });
});

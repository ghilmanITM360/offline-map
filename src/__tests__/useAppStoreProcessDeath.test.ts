import { activatePublishedFixture } from './navigationFixture';
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// #139: policy-agnostic characterization of Android process death. Active navigation lives only in
// memory today; these tests pin that fact (and the exact persisted allowlist) so any future
// restore-or-notify policy is a deliberate, reviewed change to this file - never an accident.

import type { Place } from '../models/types';
import { useAppStore, waitForStoreHydration } from '../store/useAppStore';

const initialStoreState = useAppStore.getState();
const realPersistOptions = useAppStore.persist.getOptions();

const place: Place = {
  id: 'B34',
  name: 'Block 34',
  category: 'Block',
  description: 'Block 34',
  coordinate: { latitude: 24.966, longitude: 67.004 },
  sourceVersion: 'v2',
};
const fix = { latitude: 24.9762, longitude: 67.011, accuracy: 5, observedAtMs: 1_790_000_000_000 };

// Keys that describe an in-flight journey or fresh GPS state; none may reach storage.
const RUNTIME_KEYS = [
  'isNavigating', 'navigationSessionId', 'destination', 'activeRoute', 'routeInstructions',
  'reroutePending', 'selectedPlace', 'routePlannerOrigin', 'routePlannerDest', 'routeAlternatives',
  'routeGuide', 'pendingJourney', 'pendingDirectorySelection', 'directoryPurpose', 'directoryChoice', 'currentLocation', 'currentLocationSource', 'snappedLocation',
];

// Any addition here forces an explicit privacy decision (#145) in the PR that makes it.
const PERSISTED_KEYS = [
  'developerModeEnabled', 'favorites', 'hasSeenLocationTutorial', 'hasSeenMapOverview',
  'lastKnownLocation', 'lastKnownLocationUpdatedAt',
  // #145: per-entry search stamps (30 day expiry); schema stays version 2, legacy blobs are stamped on read.
  'recentSearchTimes', 'recentSearches', 'settings', 'showBlockPolygons', 'showGatesLayer',
  'showGraphNodes', 'showRastaNames', 'showRastasLayer', 'showRouteDiagnostics', 'showSpecialRoutesLayer',
  // #139 Option B: coordinate-free unfinished-journey marker (see UnfinishedJourneyMarker.test.ts for the privacy guard).
  'unfinishedJourney',
];

type Blob = { state: Record<string, unknown>; version: number };

// Records every write; hydrates from `stored` when set.
function recordingStorage(stored: Blob | null = null) {
  const setItem = jest.fn(() => Promise.resolve());
  return {
    storage: { getItem: () => Promise.resolve(stored), setItem, removeItem: () => Promise.resolve() },
    lastWrite: () => setItem.mock.calls.at(-1) as unknown as [string, Blob],
  };
}

beforeEach(() => {
  useAppStore.setState(initialStoreState, true);
});

afterEach(() => {
  useAppStore.persist.setOptions(realPersistOptions);
});

describe('#139 process death: nothing about an in-flight journey is persisted', () => {
  it('writes none of the navigation/selection/GPS-runtime keys, but does keep lastKnownLocation', () => {
    const rec = recordingStorage();
    useAppStore.persist.setOptions({ storage: rec.storage });

    activatePublishedFixture(place, fix);
    useAppStore.getState().setReroutePending(true);
    useAppStore.getState().setSelectedPlace(place);
    useAppStore.getState().setRoutePlannerOrigin(place);
    useAppStore.getState().setCurrentLocation(fix, 'live');

    const [, written] = rec.lastWrite();
    for (const key of RUNTIME_KEYS) expect(written.state).not.toHaveProperty(key);
    expect(written.state.lastKnownLocation).toEqual(fix);
    expect(typeof written.state.lastKnownLocationUpdatedAt).toBe('string');
  });

  it('rehydrating that blob yields a clean, non-navigating store', async () => {
    const rec = recordingStorage();
    useAppStore.persist.setOptions({ storage: rec.storage });
    activatePublishedFixture(place, fix);
    useAppStore.getState().setSelectedPlace(place);
    useAppStore.getState().setCurrentLocation(fix, 'live');
    const [, written] = rec.lastWrite();

    // Fresh JS runtime: defaults, then hydrate from what was written.
    useAppStore.setState(initialStoreState, true);
    useAppStore.persist.setOptions({ storage: recordingStorage(written).storage });
    await useAppStore.persist.rehydrate();
    await expect(waitForStoreHydration()).resolves.toEqual({ outcome: 'success' });

    const s = useAppStore.getState();
    expect(s.isNavigating).toBe(false);
    expect(s.navigationSessionId).toBe(initialStoreState.navigationSessionId);
    expect(s.destination).toBeNull();
    expect(s.activeRoute).toBeNull();
    expect(s.routeInstructions).toEqual([]);
    expect(s.reroutePending).toBe(false);
    expect(s.selectedPlace).toBeNull();
    // The remembered position IS hydrated, but never as a live fix.
    expect(s.currentLocation).toBeNull();
    expect(s.currentLocationSource).toBeNull();
    expect(s.lastKnownLocation).toEqual(fix);
  });

  it('the persisted allowlist is exact and version 2', () => {
    const opts = useAppStore.persist.getOptions();
    const persisted = opts.partialize!(useAppStore.getState());

    expect(Object.keys(persisted).sort()).toEqual(PERSISTED_KEYS);
    expect(opts.version).toBe(2);
  });
});

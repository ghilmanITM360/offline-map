/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// #145: bounded on-device retention and targeted clearing. Policy: docs/DATA_RETENTION.md.

import type { Place } from '../models/types';
import { useAppStore, waitForStoreHydration } from '../store/useAppStore';
import { LAST_KNOWN_LOCATION_MAX_AGE_MS, RECENT_SEARCH_MAX_AGE_MS } from '../utils/dataRetention';

const initialStoreState = useAppStore.getState();
const realPersistOptions = useAppStore.persist.getOptions();

const NOW = 1_790_000_000_000;
const DAY = 24 * 60 * 60 * 1000;
const iso = (ms: number) => new Date(ms).toISOString();
const place = (id: string): Place => ({
  id, name: id, category: 'Block', description: id, coordinate: { latitude: 24.966, longitude: 67.004 }, sourceVersion: 'v2',
});
const fix = { latitude: 24.9762, longitude: 67.011 };

type Blob = { state: Record<string, unknown>; version: number };

function recordingStorage(stored: Blob | null = null) {
  const setItem = jest.fn(() => Promise.resolve());
  return {
    storage: { getItem: () => Promise.resolve(stored), setItem, removeItem: () => Promise.resolve() },
    lastWrite: () => (setItem.mock.calls.at(-1) as unknown as [string, Blob])[1],
  };
}

async function relaunchWith(state: Record<string, unknown>, version = 2) {
  useAppStore.setState(initialStoreState, true);
  useAppStore.persist.setOptions({ storage: recordingStorage({ state, version }).storage });
  await useAppStore.persist.rehydrate();
  await expect(waitForStoreHydration()).resolves.toEqual({ outcome: 'success' });
  return useAppStore.getState();
}

beforeEach(() => {
  jest.spyOn(Date, 'now').mockReturnValue(NOW);
  useAppStore.setState(initialStoreState, true);
});
afterEach(() => {
  jest.restoreAllMocks();
  useAppStore.persist.setOptions(realPersistOptions);
});

describe('#145 earlier location: one latest fix, 24 h cutoff', () => {
  it('rehydrates a fix younger than the cutoff', async () => {
    const s = await relaunchWith({ lastKnownLocation: fix, lastKnownLocationUpdatedAt: iso(NOW - LAST_KNOWN_LOCATION_MAX_AGE_MS + 1000) });
    expect(s.lastKnownLocation).toEqual(fix);
  });

  it.each([
    ['expired', iso(NOW - LAST_KNOWN_LOCATION_MAX_AGE_MS - 1000)],
    ['future-dated', iso(NOW + 60_000)],
    ['unparseable timestamp', 'yesterday'],
    ['missing timestamp', null],
  ])('drops a %s fix on rehydrate', async (_label, updatedAt) => {
    const s = await relaunchWith({ lastKnownLocation: fix, lastKnownLocationUpdatedAt: updatedAt });
    expect(s.lastKnownLocation).toBeNull();
    expect(s.lastKnownLocationUpdatedAt).toBeNull();
  });

  it('drops a malformed coordinate on rehydrate', async () => {
    const s = await relaunchWith({ lastKnownLocation: { latitude: NaN, longitude: 67 }, lastKnownLocationUpdatedAt: iso(NOW) });
    expect(s.lastKnownLocation).toBeNull();
  });

  it('never writes an expired fix back to storage', () => {
    const rec = recordingStorage();
    useAppStore.persist.setOptions({ storage: rec.storage });
    useAppStore.setState({ lastKnownLocation: fix, lastKnownLocationUpdatedAt: iso(NOW - 2 * DAY) });
    useAppStore.getState().updateSettings({ darkMode: true });
    const written = rec.lastWrite().state;
    expect(written.lastKnownLocation).toBeNull();
    expect(written.lastKnownLocationUpdatedAt).toBeNull();
  });

  it('keeps a single latest fix, never a history', () => {
    const rec = recordingStorage();
    useAppStore.persist.setOptions({ storage: rec.storage });
    useAppStore.getState().setCurrentLocation(fix, 'live');
    useAppStore.getState().setCurrentLocation({ latitude: 24.97, longitude: 67.012 }, 'live');
    const written = JSON.stringify(rec.lastWrite().state);
    expect(written).toContain('"latitude":24.97,');
    expect(written).not.toContain('24.9762');
  });
});

describe('#145 recent searches: bounded list, 30 day retention', () => {
  it('stamps a search when it is added and persists the stamp', () => {
    const rec = recordingStorage();
    useAppStore.persist.setOptions({ storage: rec.storage });
    useAppStore.getState().addRecentSearch(place('B1'));
    expect(rec.lastWrite().state.recentSearchTimes).toEqual({ B1: NOW });
  });

  it('drops only entries older than 30 days on rehydrate', async () => {
    const s = await relaunchWith({
      recentSearches: [place('NEW'), place('OLD')],
      recentSearchTimes: { NEW: NOW - 1000, OLD: NOW - RECENT_SEARCH_MAX_AGE_MS - 1000 },
    });
    expect(s.recentSearches.map((p) => p.id)).toEqual(['NEW']);
    expect(s.recentSearchTimes).toEqual({ NEW: NOW - 1000 });
  });

  it('clamps a future-dated stamp to now (clock moved back) instead of wiping the list', async () => {
    const s = await relaunchWith({ recentSearches: [place('F')], recentSearchTimes: { F: NOW + DAY } });
    expect(s.recentSearches.map((p) => p.id)).toEqual(['F']);
    expect(s.recentSearchTimes).toEqual({ F: NOW });
  });

  it('drops a non-numeric stamp', async () => {
    const s = await relaunchWith({ recentSearches: [place('X')], recentSearchTimes: { X: 'soon' } });
    expect(s.recentSearches).toEqual([]);
  });

  it('a partial blob cannot leak raw stamps into state', async () => {
    const s = await relaunchWith({ recentSearchTimes: 'x', lastKnownLocationUpdatedAt: 'x' });
    expect(s.recentSearchTimes).toEqual({});
    expect(s.lastKnownLocationUpdatedAt).toBeNull();
  });

  it('migrates a legacy blob without stamps: entries are kept and start their 30 day clock now', async () => {
    const s = await relaunchWith({ recentSearches: [place('A'), place('B')] });
    expect(s.recentSearches.map((p) => p.id)).toEqual(['A', 'B']);
    expect(s.recentSearchTimes).toEqual({ A: NOW, B: NOW });
  });

  it('stays bounded at 10 entries and prunes stamps of evicted entries', () => {
    for (let i = 0; i < 12; i++) useAppStore.getState().addRecentSearch(place(`P${i}`));
    const s = useAppStore.getState();
    expect(s.recentSearches).toHaveLength(10);
    expect(Object.keys(s.recentSearchTimes).sort()).toEqual(s.recentSearches.map((p) => p.id).sort());
  });
});

describe('#145 targeted clear actions', () => {
  const seed = () => {
    const s = useAppStore.getState();
    s.addRecentSearch(place('B1'));
    s.addFavorite({ placeId: 'B1' } as never);
    useAppStore.setState({
      lastKnownLocation: fix, lastKnownLocationUpdatedAt: iso(NOW),
      currentLocation: fix, currentLocationSource: 'remembered',
      unfinishedJourney: { version: 1, unfinishedNavigation: true, createdAt: NOW, destinationId: 'B1' },
    });
    s.updateSettings({ darkMode: true });
    useAppStore.setState({ hasSeenMapOverview: true });
  };

  it('clearRecentSearches removes list and stamps, nothing else', () => {
    seed();
    useAppStore.getState().clearRecentSearches();
    const s = useAppStore.getState();
    expect(s.recentSearches).toEqual([]);
    expect(s.recentSearchTimes).toEqual({});
    expect(s.lastKnownLocation).toEqual(fix);
    expect(s.settings.darkMode).toBe(true);
  });

  it('clearSavedLocation removes the saved fix and a remembered in-memory position only', () => {
    seed();
    useAppStore.getState().clearSavedLocation();
    const s = useAppStore.getState();
    expect(s.lastKnownLocation).toBeNull();
    expect(s.lastKnownLocationUpdatedAt).toBeNull();
    expect(s.currentLocation).toBeNull();
    expect(s.recentSearches.map((p) => p.id)).toEqual(['B1']);
  });

  it('a live fix after clearing saves a new single fix (documented behaviour)', () => {
    seed();
    useAppStore.getState().clearSavedLocation();
    useAppStore.getState().setCurrentLocation({ latitude: 24.98, longitude: 67.02 }, 'live');
    expect(useAppStore.getState().lastKnownLocation).toEqual({ latitude: 24.98, longitude: 67.02 });
  });

  it('clearSavedLocation keeps a live fix', () => {
    seed();
    useAppStore.setState({ currentLocationSource: 'live' });
    useAppStore.getState().clearSavedLocation();
    expect(useAppStore.getState().currentLocation).toEqual(fix);
  });

  it('clearing never touches favorites, settings, setup flags or offline data', () => {
    seed();
    const before = useAppStore.getState();
    expect(before.favorites).toHaveLength(1);
    before.clearRecentSearches();
    before.clearSavedLocation();
    before.clearUnfinishedJourney();
    const s = useAppStore.getState();
    expect(s.favorites).toEqual(before.favorites);
    expect(s.settings.darkMode).toBe(true);
    expect(s.hasSeenMapOverview).toBe(true);
    expect(s.unfinishedJourney).toBeNull();
  });

  it('a cleared store writes nothing back from the cleared categories', () => {
    seed();
    const rec = recordingStorage();
    useAppStore.persist.setOptions({ storage: rec.storage });
    useAppStore.getState().clearRecentSearches();
    useAppStore.getState().clearSavedLocation();
    const w = rec.lastWrite().state;
    expect(w.recentSearches).toEqual([]);
    expect(w.recentSearchTimes).toEqual({});
    expect(w.lastKnownLocation).toBeNull();
  });
});

describe('#145 persisted payload and schema safety', () => {
  it('persists no route, GPS trail or movement history', () => {
    const rec = recordingStorage();
    useAppStore.persist.setOptions({ storage: rec.storage });
    useAppStore.getState().setCurrentLocation(fix, 'live');
    useAppStore.getState().updateSettings({ darkMode: true });
    const keys = Object.keys(rec.lastWrite().state);
    for (const forbidden of ['activeRoute', 'routeInstructions', 'currentLocation', 'snappedLocation', 'locationHistory', 'trail', 'navigationProgress']) {
      expect(keys).not.toContain(forbidden);
    }
  });

  it('a future-version blob with unknown keys is whitelisted, not trusted', async () => {
    const s = await relaunchWith({ locationHistory: [fix, fix], currentLocation: fix, settings: 'garbage', recentSearches: 'nope' }, 99);
    expect((s as unknown as Record<string, unknown>).locationHistory).toBeUndefined();
    expect(s.currentLocation).toBeNull();
    expect(s.recentSearches).toEqual([]);
    expect(s.settings).toEqual(initialStoreState.settings);
  });

  it('expired recovery marker is dropped on rehydrate (2 h rule unchanged)', async () => {
    const s = await relaunchWith({ unfinishedJourney: { version: 1, unfinishedNavigation: true, createdAt: NOW - 3 * 60 * 60 * 1000, destinationId: 'B1' } });
    expect(s.unfinishedJourney).toBeNull();
  });
});

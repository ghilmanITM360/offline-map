/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { createJSONStorage } from 'zustand/middleware';
import { useAppStore, createDedupingStorage } from '../store/useAppStore';

// P1-C stabilization coverage: zustand's persist middleware calls storage.setItem() on every
// set() to the store, regardless of whether the persisted (partialize'd) fields actually
// changed. GPS ticks during navigation call setCurrentLocation() roughly once a second, which
// also updates the genuinely-persisted lastKnownLocation/lastKnownLocationUpdatedAt fields (see
// useAppStore's "remembered location" feature) — a plain identical-value dedupe can't catch
// that churn because the timestamp differs every tick. createDedupingStorage() both skips a
// truly-identical write and throttles genuinely-changing writes to at most one per window,
// always flushing the latest pending value on the trailing edge.

const THROTTLE_MS = 4000;

function rawStorageSpy() {
  const data = new Map<string, string>();
  return {
    getItem: jest.fn((name: string) => Promise.resolve(data.get(name) ?? null)),
    setItem: jest.fn((name: string, value: string) => {
      data.set(name, value);
      return Promise.resolve();
    }),
    removeItem: jest.fn((name: string) => {
      data.delete(name);
      return Promise.resolve();
    }),
  };
}

describe('createDedupingStorage', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('writes the first value immediately (cold start)', () => {
    const raw = rawStorageSpy();
    const storage = createDedupingStorage(raw, THROTTLE_MS);

    storage.setItem('k', 'v1');

    expect(raw.setItem).toHaveBeenCalledTimes(1);
    expect(raw.setItem).toHaveBeenCalledWith('k', 'v1');
  });

  it('skips a write whose serialized value is unchanged from the last one actually written', () => {
    const raw = rawStorageSpy();
    const storage = createDedupingStorage(raw, THROTTLE_MS);

    storage.setItem('k', 'same');
    jest.advanceTimersByTime(THROTTLE_MS);
    storage.setItem('k', 'same');
    storage.setItem('k', 'same');

    expect(raw.setItem).toHaveBeenCalledTimes(1);
  });

  it('coalesces rapid genuinely-changing writes within the throttle window into one trailing write', () => {
    const raw = rawStorageSpy();
    const storage = createDedupingStorage(raw, THROTTLE_MS);

    storage.setItem('k', 'v1'); // immediate — cold start
    storage.setItem('k', 'v2'); // within window — deferred
    storage.setItem('k', 'v3'); // within window — replaces the pending v2
    expect(raw.setItem).toHaveBeenCalledTimes(1);
    expect(raw.setItem).toHaveBeenCalledWith('k', 'v1');

    jest.advanceTimersByTime(THROTTLE_MS);

    expect(raw.setItem).toHaveBeenCalledTimes(2);
    expect(raw.setItem).toHaveBeenLastCalledWith('k', 'v3');
  });

  it('writes immediately again once the throttle window has fully elapsed', () => {
    const raw = rawStorageSpy();
    const storage = createDedupingStorage(raw, THROTTLE_MS);

    storage.setItem('k', 'v1');
    jest.advanceTimersByTime(THROTTLE_MS);
    storage.setItem('k', 'v2');

    expect(raw.setItem).toHaveBeenCalledTimes(2);
  });

  it('removeItem clears dedupe/throttle state and cancels any pending trailing write', () => {
    const raw = rawStorageSpy();
    const storage = createDedupingStorage(raw, THROTTLE_MS);

    storage.setItem('k', 'v1'); // immediate
    storage.setItem('k', 'v2'); // pending, cancelled below
    storage.removeItem('k');
    jest.advanceTimersByTime(THROTTLE_MS);

    expect(raw.setItem).toHaveBeenCalledTimes(1);
    expect(raw.removeItem).toHaveBeenCalledTimes(1);

    // Cache was reset by removeItem, so the same value writes again instead of being deduped.
    storage.setItem('k', 'v1');
    expect(raw.setItem).toHaveBeenCalledTimes(2);
  });

  it('delegates getItem to the underlying storage unchanged', async () => {
    const raw = rawStorageSpy();
    await raw.setItem('k', 'stored-value');
    const storage = createDedupingStorage(raw, THROTTLE_MS);

    await expect(storage.getItem('k')).resolves.toBe('stored-value');
  });
});

describe('useAppStore persisted-write frequency', () => {
  const initialStoreState = useAppStore.getState();
  const realPersistOptions = useAppStore.persist.getOptions();

  beforeEach(() => {
    jest.useFakeTimers();
    useAppStore.setState(initialStoreState, true);
  });

  afterEach(() => {
    useAppStore.persist.setOptions(realPersistOptions);
    jest.useRealTimers();
  });

  it('a burst of GPS location ticks during navigation collapses into one write per throttle window, not one per tick', () => {
    const raw = rawStorageSpy();
    useAppStore.persist.setOptions({ storage: createJSONStorage(() => createDedupingStorage(raw, THROTTLE_MS)) });
    raw.setItem.mockClear();

    // Simulates ~5 live GPS fixes arriving within one throttle window, as happens roughly every
    // second during active navigation. Each call also updates the persisted lastKnownLocation
    // fields, so without throttling this would be several raw writes, not one.
    for (let i = 0; i < 5; i++) {
      useAppStore.getState().setCurrentLocation({ latitude: 24.9 + i * 0.0001, longitude: 67.0 }, 'live');
    }

    expect(raw.setItem.mock.calls.length).toBeLessThanOrEqual(1);

    jest.advanceTimersByTime(THROTTLE_MS);

    // The trailing flush carries the latest tick's value, not a stale intermediate one.
    expect(raw.setItem.mock.calls.length).toBeLessThanOrEqual(2);
    const lastCall = raw.setItem.mock.calls[raw.setItem.mock.calls.length - 1];
    expect(JSON.parse(lastCall[1]).state.lastKnownLocation).toEqual({ latitude: 24.9 + 4 * 0.0001, longitude: 67.0 });
  });

  it('a genuine change to a persisted field (settings) still writes to storage', () => {
    const raw = rawStorageSpy();
    useAppStore.persist.setOptions({ storage: createJSONStorage(() => createDedupingStorage(raw, THROTTLE_MS)) });
    raw.setItem.mockClear();

    useAppStore.getState().updateSettings({ darkMode: true });

    expect(raw.setItem).toHaveBeenCalled();
    const [, serialized] = raw.setItem.mock.calls[raw.setItem.mock.calls.length - 1];
    expect(JSON.parse(serialized).state.settings.darkMode).toBe(true);
  });

  it('a persisted field (favorites) survives a write/read round trip through the deduping storage', async () => {
    const raw = rawStorageSpy();
    useAppStore.persist.setOptions({ storage: createJSONStorage(() => createDedupingStorage(raw, THROTTLE_MS)) });

    useAppStore.getState().addFavorite({ placeId: 'B1', name: 'Block 1', category: 'Block' } as never);

    const stored = await raw.getItem('ijtema-app-store');
    expect(stored).not.toBeNull();
    expect(JSON.parse(stored as string).state.favorites).toEqual(
      expect.arrayContaining([expect.objectContaining({ placeId: 'B1' })]),
    );
  });
});

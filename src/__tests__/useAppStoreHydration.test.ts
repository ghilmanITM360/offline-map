/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useAppStore, waitForStoreHydration } from '../store/useAppStore';

const initialStoreState = useAppStore.getState();

beforeEach(() => {
  useAppStore.setState(initialStoreState, true);
});

describe('waitForStoreHydration', () => {
  it('resolves immediately when the store has already hydrated', async () => {
    useAppStore.setState({ hasHydrated: true });
    await expect(waitForStoreHydration()).resolves.toBeUndefined();
  });

  it('waits for a delayed hydration flip before resolving', async () => {
    useAppStore.setState({ hasHydrated: false });
    let resolved = false;
    const promise = waitForStoreHydration(5000).then(() => {
      resolved = true;
    });

    // Give pending microtasks a chance to run — must NOT have resolved yet.
    await Promise.resolve();
    await Promise.resolve();
    expect(resolved).toBe(false);

    useAppStore.getState().setHasHydrated(true);
    await promise;
    expect(resolved).toBe(true);
  });

  it('falls back safely with a bounded timeout if hydration never completes (failure/hang case)', async () => {
    jest.useFakeTimers();
    try {
      useAppStore.setState({ hasHydrated: false });
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      let resolved = false;
      const promise = waitForStoreHydration(1000).then(() => {
        resolved = true;
      });

      jest.advanceTimersByTime(999);
      await Promise.resolve();
      expect(resolved).toBe(false);

      jest.advanceTimersByTime(2);
      await promise;
      expect(resolved).toBe(true);
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Hydration timed out'));
      warnSpy.mockRestore();
    } finally {
      jest.useRealTimers();
    }
  });

  it('does not persist hasHydrated itself — every cold start must start unhydrated', () => {
    // Guard against a future partialize edit accidentally starting hasHydrated=true from
    // AsyncStorage, which would defeat the whole point of waiting for a *real* rehydration.
    useAppStore.setState({ hasHydrated: true });
    const persistOptions = (useAppStore as unknown as { persist: { getOptions: () => { partialize: (s: unknown) => Record<string, unknown> } } }).persist;
    const persisted = persistOptions.getOptions().partialize(useAppStore.getState());
    expect(persisted).not.toHaveProperty('hasHydrated');
  });
});

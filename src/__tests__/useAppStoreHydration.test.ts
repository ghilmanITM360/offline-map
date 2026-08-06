/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useAppStore, waitForStoreHydration } from '../store/useAppStore';

const initialStoreState = useAppStore.getState();
const realPersistOptions = useAppStore.persist.getOptions();

function controllableStorage() {
  let resolveGetItem!: (value: unknown) => void;
  let rejectGetItem!: (error: unknown) => void;
  const getItemPromise = new Promise((resolve, reject) => {
    resolveGetItem = resolve;
    rejectGetItem = reject;
  });
  return {
    storage: {
      getItem: () => getItemPromise,
      setItem: () => Promise.resolve(),
      removeItem: () => Promise.resolve(),
    },
    resolve: (value: unknown) => resolveGetItem(value),
    reject: (error: unknown) => rejectGetItem(error),
  };
}

beforeEach(() => {
  useAppStore.setState(initialStoreState, true);
});

afterEach(() => {
  // Each test below points persist.setOptions at a scratch storage to control rehydration
  // timing precisely — restore the real one so later tests/files rehydrate normally.
  useAppStore.persist.setOptions(realPersistOptions);
});

describe('waitForStoreHydration', () => {
  it('resolves immediately once a real rehydration pass has already completed', async () => {
    await useAppStore.persist.rehydrate();
    expect(useAppStore.persist.hasHydrated()).toBe(true);
    await expect(waitForStoreHydration()).resolves.toBeUndefined();
  });

  it('waits for a delayed hydration pass before resolving', async () => {
    const controllable = controllableStorage();
    useAppStore.persist.setOptions({ storage: controllable.storage });
    const rehydratePromise = useAppStore.persist.rehydrate();

    let resolved = false;
    const waitPromise = waitForStoreHydration(5000).then(() => {
      resolved = true;
    });

    await Promise.resolve();
    await Promise.resolve();
    expect(resolved).toBe(false);
    expect(useAppStore.persist.hasHydrated()).toBe(false);

    controllable.resolve(null); // storage has nothing stored — a normal fresh-install read
    await rehydratePromise;
    await waitPromise;
    expect(resolved).toBe(true);
  });

  it('falls back safely with a bounded timeout if hydration never completes (a genuine AsyncStorage hang)', async () => {
    jest.useFakeTimers();
    try {
      const controllable = controllableStorage(); // getItem promise deliberately never settles
      useAppStore.persist.setOptions({ storage: controllable.storage });
      void useAppStore.persist.rehydrate();

      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      let resolved = false;
      const waitPromise = waitForStoreHydration(1000).then(() => {
        resolved = true;
      });

      jest.advanceTimersByTime(999);
      await Promise.resolve();
      expect(resolved).toBe(false);

      jest.advanceTimersByTime(2);
      await waitPromise;
      expect(resolved).toBe(true);
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Hydration timed out'));
      warnSpy.mockRestore();
    } finally {
      jest.useRealTimers();
    }
  });

  it('also falls back via the timeout when the read genuinely fails (onFinishHydration never fires on error)', async () => {
    jest.useFakeTimers();
    try {
      const controllable = controllableStorage();
      useAppStore.persist.setOptions({ storage: controllable.storage });
      const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

      const rehydratePromise = useAppStore.persist.rehydrate();
      const waitPromise = waitForStoreHydration(1000).then(() => 'done');

      controllable.reject(new Error('AsyncStorage read failed'));
      await rehydratePromise;
      await Promise.resolve();
      expect(useAppStore.persist.hasHydrated()).toBe(false);
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to rehydrate'), expect.any(Error));

      jest.advanceTimersByTime(1000);
      await expect(waitPromise).resolves.toBe('done');
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Hydration timed out'));

      errorSpy.mockRestore();
      warnSpy.mockRestore();
    } finally {
      jest.useRealTimers();
    }
  });
});

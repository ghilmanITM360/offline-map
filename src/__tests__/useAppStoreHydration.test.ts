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
  const setItem = jest.fn(() => Promise.resolve());
  return {
    storage: {
      getItem: () => getItemPromise,
      setItem,
      removeItem: () => Promise.resolve(),
    },
    setItem,
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
  it('1. resolves immediately once a real rehydration pass has already completed', async () => {
    await useAppStore.persist.rehydrate();
    expect(useAppStore.persist.hasHydrated()).toBe(true);
    await expect(waitForStoreHydration()).resolves.toEqual({ outcome: 'success' });
  });

  it('2. waits for a delayed successful hydration pass before resolving', async () => {
    const controllable = controllableStorage();
    useAppStore.persist.setOptions({ storage: controllable.storage });
    const rehydratePromise = useAppStore.persist.rehydrate();

    let result: unknown;
    const waitPromise = waitForStoreHydration(5000).then((r) => {
      result = r;
    });

    await Promise.resolve();
    await Promise.resolve();
    expect(result).toBeUndefined();
    expect(useAppStore.persist.hasHydrated()).toBe(false);

    controllable.resolve(null); // storage has nothing stored — a normal fresh-install read
    await rehydratePromise;
    await waitPromise;
    expect(result).toEqual({ outcome: 'success' });
  });

  it('3. a known hydration failure resolves well before the five-second timeout', async () => {
    jest.useFakeTimers();
    try {
      const controllable = controllableStorage();
      useAppStore.persist.setOptions({ storage: controllable.storage });
      const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

      const rehydratePromise = useAppStore.persist.rehydrate();
      let result: unknown;
      const waitPromise = waitForStoreHydration(5000).then((r) => {
        result = r;
      });

      controllable.reject(new Error('AsyncStorage read failed'));
      await rehydratePromise.catch(() => {});
      // Let the rejection propagate through the internal promise chain without advancing the
      // 5s timer at all — a fix that still relied on onFinishHydration/timeout would leave
      // `result` unset here.
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await waitPromise;

      expect(result).toEqual({ outcome: 'failure' });
      expect(useAppStore.persist.hasHydrated()).toBe(false);
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to rehydrate'), expect.any(Error));
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Hydration failed'), expect.any(Error));
      expect(warnSpy).not.toHaveBeenCalledWith(expect.stringContaining('Hydration timed out'));
      expect(jest.getTimerCount()).toBe(0); // the 5s timeout was cleared, not left pending

      errorSpy.mockRestore();
      warnSpy.mockRestore();
    } finally {
      jest.useRealTimers();
    }
  });

  it('4. falls back to the bounded timeout only for a genuine hang (no callback at all)', async () => {
    jest.useFakeTimers();
    try {
      const controllable = controllableStorage(); // getItem promise deliberately never settles
      useAppStore.persist.setOptions({ storage: controllable.storage });
      void useAppStore.persist.rehydrate();

      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      let result: unknown;
      const waitPromise = waitForStoreHydration(1000).then((r) => {
        result = r;
      });

      jest.advanceTimersByTime(999);
      await Promise.resolve();
      expect(result).toBeUndefined();

      jest.advanceTimersByTime(2);
      await waitPromise;
      expect(result).toEqual({ outcome: 'timeout' });
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Hydration timed out'));
      expect(jest.getTimerCount()).toBe(0);
      warnSpy.mockRestore();
    } finally {
      jest.useRealTimers();
    }
  });

  it('5. two simultaneous waiters both resolve and clean up independently', async () => {
    const controllable = controllableStorage();
    useAppStore.persist.setOptions({ storage: controllable.storage });
    const rehydratePromise = useAppStore.persist.rehydrate();

    const first = waitForStoreHydration(5000);
    const second = waitForStoreHydration(5000);

    controllable.resolve(null);
    await rehydratePromise;

    await expect(first).resolves.toEqual({ outcome: 'success' });
    await expect(second).resolves.toEqual({ outcome: 'success' });
  });

  it('6. every outcome (success, failure, timeout) tears its own timer down — none linger', async () => {
    jest.useFakeTimers();
    try {
      jest.spyOn(console, 'warn').mockImplementation(() => {});
      jest.spyOn(console, 'error').mockImplementation(() => {});

      // Success path.
      const successStorage = controllableStorage();
      useAppStore.persist.setOptions({ storage: successStorage.storage });
      const successRehydrate = useAppStore.persist.rehydrate();
      const successWait = waitForStoreHydration(5000);
      successStorage.resolve(null);
      await successRehydrate;
      await successWait;
      expect(jest.getTimerCount()).toBe(0);

      // Failure path.
      const failureStorage = controllableStorage();
      useAppStore.persist.setOptions({ storage: failureStorage.storage });
      const failureRehydrate = useAppStore.persist.rehydrate();
      const failureWait = waitForStoreHydration(5000);
      failureStorage.reject(new Error('boom'));
      await failureRehydrate.catch(() => {});
      await Promise.resolve();
      await Promise.resolve();
      await failureWait;
      expect(jest.getTimerCount()).toBe(0);

      // Timeout path.
      const hangStorage = controllableStorage();
      useAppStore.persist.setOptions({ storage: hangStorage.storage });
      void useAppStore.persist.rehydrate();
      const timeoutWait = waitForStoreHydration(1000);
      jest.advanceTimersByTime(1000);
      await timeoutWait;
      expect(jest.getTimerCount()).toBe(0);

      jest.restoreAllMocks();
    } finally {
      jest.useRealTimers();
    }
  });

  it('7. a settle that arrives after this waiter already timed out does not re-resolve or throw', async () => {
    jest.useFakeTimers();
    try {
      const controllable = controllableStorage();
      useAppStore.persist.setOptions({ storage: controllable.storage });
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      void useAppStore.persist.rehydrate();

      let result: unknown;
      const waitPromise = waitForStoreHydration(1000).then((r) => {
        result = r;
      });

      jest.advanceTimersByTime(1000);
      await waitPromise;
      expect(result).toEqual({ outcome: 'timeout' });

      // The real read finally comes back well after this waiter gave up — must be a silent
      // no-op for this already-settled waiter (no second resolution, no thrown error).
      controllable.resolve(null);
      await Promise.resolve();
      await Promise.resolve();
      expect(result).toEqual({ outcome: 'timeout' });

      warnSpy.mockRestore();
    } finally {
      jest.useRealTimers();
    }
  });

  it('8. resolves deterministically to the same outcome shape on failure as on timeout, so callers can share one fallback path', async () => {
    jest.useFakeTimers();
    try {
      jest.spyOn(console, 'warn').mockImplementation(() => {});
      jest.spyOn(console, 'error').mockImplementation(() => {});

      const failureStorage = controllableStorage();
      useAppStore.persist.setOptions({ storage: failureStorage.storage });
      const failureRehydrate = useAppStore.persist.rehydrate();
      const failureWait = waitForStoreHydration(1000);
      failureStorage.reject(new Error('boom'));
      await failureRehydrate.catch(() => {});
      await Promise.resolve();
      await Promise.resolve();
      const failureResult = await failureWait;

      const hangStorage = controllableStorage();
      useAppStore.persist.setOptions({ storage: hangStorage.storage });
      void useAppStore.persist.rehydrate();
      const timeoutWait = waitForStoreHydration(1000);
      jest.advanceTimersByTime(1000);
      const timeoutResult = await timeoutWait;

      expect(Object.keys(failureResult)).toEqual(Object.keys(timeoutResult));
      expect(failureResult.outcome).toBe('failure');
      expect(timeoutResult.outcome).toBe('timeout');
      // Both leave the store on its in-memory defaults — neither path partially applies state.
      expect(useAppStore.persist.hasHydrated()).toBe(false);
      expect(useAppStore.getState().hasSeenMapOverview).toBe(false);

      jest.restoreAllMocks();
    } finally {
      jest.useRealTimers();
    }
  });

  it('9. a rehydration failure never writes hasSeenMapOverview (or anything else) back to storage', async () => {
    const controllable = controllableStorage();
    useAppStore.persist.setOptions({ storage: controllable.storage });
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    const rehydratePromise = useAppStore.persist.rehydrate();
    const waitPromise = waitForStoreHydration(5000);
    controllable.reject(new Error('AsyncStorage read failed'));
    await rehydratePromise.catch(() => {});
    await waitPromise;

    expect(controllable.setItem).not.toHaveBeenCalled();
    expect(useAppStore.getState().hasSeenMapOverview).toBe(false);

    errorSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it('10. a rejected storage read never becomes an unhandled promise rejection, and does not loop', async () => {
    const controllable = controllableStorage();
    useAppStore.persist.setOptions({ storage: controllable.storage });
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    const rehydratePromise = useAppStore.persist.rehydrate();
    const first = waitForStoreHydration(5000);
    const second = waitForStoreHydration(5000);
    controllable.reject(new Error('AsyncStorage read failed'));

    // rehydratePromise itself never rejects — zustand's hydrate() swallows the error into its
    // own .catch() and only surfaces it via onRehydrateStorage's callback (see settleHydrationAttempt).
    await expect(rehydratePromise).resolves.toBeUndefined();
    await expect(first).resolves.toEqual({ outcome: 'failure' });
    await expect(second).resolves.toEqual({ outcome: 'failure' });
    expect(controllable.setItem).not.toHaveBeenCalled();

    errorSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it('11. an aborted waiter (e.g. the caller unmounted) resolves immediately and stops listening', async () => {
    jest.useFakeTimers();
    try {
      const controllable = controllableStorage();
      useAppStore.persist.setOptions({ storage: controllable.storage });
      void useAppStore.persist.rehydrate();

      const controller = new AbortController();
      const waitPromise = waitForStoreHydration(5000, controller.signal);
      controller.abort();

      await expect(waitPromise).resolves.toEqual({ outcome: 'aborted' });
      expect(jest.getTimerCount()).toBe(0);

      // A late real settle after the abort must not throw or resolve anything further.
      controllable.resolve(null);
      await Promise.resolve();
    } finally {
      jest.useRealTimers();
    }
  });
});

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { getEventListeners } from 'node:events';
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

  it('12. a hydration failure settled before the waiter existed resolves safely with no TDZ throw', async () => {
    jest.useFakeTimers();
    try {
      const controllable = controllableStorage();
      useAppStore.persist.setOptions({ storage: controllable.storage });
      const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

      // Let the rehydration fail and fully settle *before* any waiter is created, so
      // subscribeHydrationOutcome's synchronous replay branch — not the async listener
      // branch every other test above exercises — is what waitForStoreHydration hits.
      const rehydratePromise = useAppStore.persist.rehydrate();
      controllable.reject(new Error('AsyncStorage read failed'));
      await rehydratePromise.catch(() => {});
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      expect(useAppStore.persist.hasHydrated()).toBe(false);

      let caught: unknown;
      let result: { outcome: string } | undefined;
      await waitForStoreHydration(5000)
        .then((r) => {
          result = r;
        })
        .catch((e) => {
          caught = e;
        });

      expect(caught).toBeUndefined();
      expect(result).toEqual({ outcome: 'failure' });
      expect(jest.getTimerCount()).toBe(0);

      errorSpy.mockRestore();
      warnSpy.mockRestore();
    } finally {
      jest.useRealTimers();
    }
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

describe('waitForStoreHydration — exact hydration-generation isolation', () => {
  // Scenario "two waiters, same generation" is covered by test 5 above
  // ("two simultaneous waiters both resolve and clean up independently").

  it('an older-generation waiter is not resolved by a newer generation succeeding first', async () => {
    const first = controllableStorage();
    useAppStore.persist.setOptions({ storage: first.storage });
    const firstRehydrate = useAppStore.persist.rehydrate(); // generation N
    const olderWaiter = waitForStoreHydration(5000); // bound to generation N

    const second = controllableStorage();
    useAppStore.persist.setOptions({ storage: second.storage });
    const secondRehydrate = useAppStore.persist.rehydrate(); // generation N+1, supersedes

    let olderSettled = false;
    olderWaiter.then(() => {
      olderSettled = true;
    });

    second.resolve(null);
    await secondRehydrate;
    await Promise.resolve();
    await Promise.resolve();

    // Generation N+1 already succeeded, but the waiter bound to generation N must still be
    // pending — under the old `>=` matching it would have incorrectly resolved here.
    expect(olderSettled).toBe(false);

    first.resolve(null);
    await firstRehydrate;
    await expect(olderWaiter).resolves.toEqual({ outcome: 'success' });
  });

  it('a newer-generation waiter is not resolved by a late older-generation failure', async () => {
    const first = controllableStorage(); // deliberately left hanging, then failed late
    useAppStore.persist.setOptions({ storage: first.storage });
    const firstRehydrate = useAppStore.persist.rehydrate(); // generation N

    const second = controllableStorage();
    useAppStore.persist.setOptions({ storage: second.storage });
    const secondRehydrate = useAppStore.persist.rehydrate(); // generation N+1
    const newerWaiter = waitForStoreHydration(5000); // bound to generation N+1

    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    first.reject(new Error('stale read failed')); // late failure for the OLDER generation
    await firstRehydrate.catch(() => {});
    await Promise.resolve();
    await Promise.resolve();

    let newerSettled = false;
    newerWaiter.then(() => {
      newerSettled = true;
    });
    await Promise.resolve();
    expect(newerSettled).toBe(false); // must not resolve from the older generation's failure

    second.resolve(null);
    await secondRehydrate;
    await expect(newerWaiter).resolves.toEqual({ outcome: 'success' });

    errorSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it('a late older-generation settle cannot overwrite the newer generation\'s recorded outcome', async () => {
    const first = controllableStorage(); // will fail, but late
    useAppStore.persist.setOptions({ storage: first.storage });
    const firstRehydrate = useAppStore.persist.rehydrate(); // generation N

    const second = controllableStorage();
    useAppStore.persist.setOptions({ storage: second.storage });
    const secondRehydrate = useAppStore.persist.rehydrate(); // generation N+1
    second.resolve(null);
    await secondRehydrate; // generation N+1 settles success FIRST

    // A brand-new waiter created now must see generation N+1's success via the synchronous
    // replay path in subscribeHydrationOutcome.
    await expect(waitForStoreHydration(5000)).resolves.toEqual({ outcome: 'success' });

    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    // The older generation N's read finally comes back — as a failure, late.
    first.reject(new Error('stale read failed'));
    await firstRehydrate.catch(() => {});
    await Promise.resolve();
    await Promise.resolve();

    // The globally recorded "last settled" outcome must still be generation N+1's success —
    // a fresh waiter now must not see the older generation's stale failure.
    await expect(waitForStoreHydration(5000)).resolves.toEqual({ outcome: 'success' });

    errorSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it('a timeout on one generation does not affect a sibling generation succeeding', async () => {
    jest.useFakeTimers();
    try {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

      const hang = controllableStorage();
      useAppStore.persist.setOptions({ storage: hang.storage });
      void useAppStore.persist.rehydrate(); // generation N — deliberately hangs
      const timeoutWaiter = waitForStoreHydration(1000); // bound to generation N

      const second = controllableStorage();
      useAppStore.persist.setOptions({ storage: second.storage });
      const secondRehydrate = useAppStore.persist.rehydrate(); // generation N+1
      const successWaiter = waitForStoreHydration(1000); // bound to generation N+1
      second.resolve(null);
      await secondRehydrate;
      await expect(successWaiter).resolves.toEqual({ outcome: 'success' });

      jest.advanceTimersByTime(1000);
      await expect(timeoutWaiter).resolves.toEqual({ outcome: 'timeout' });

      warnSpy.mockRestore();
    } finally {
      jest.useRealTimers();
    }
  });

  it('aborting one waiter does not affect a same-generation sibling waiter', async () => {
    const controllable = controllableStorage();
    useAppStore.persist.setOptions({ storage: controllable.storage });
    const rehydratePromise = useAppStore.persist.rehydrate(); // generation N

    const controller = new AbortController();
    const abortedWaiter = waitForStoreHydration(5000, controller.signal);
    const siblingWaiter = waitForStoreHydration(5000); // same generation N, no abort signal

    controller.abort();
    await expect(abortedWaiter).resolves.toEqual({ outcome: 'aborted' });

    controllable.resolve(null);
    await rehydratePromise;
    await expect(siblingWaiter).resolves.toEqual({ outcome: 'success' });
  });

  it('a freshly recreated store module (e.g. Fast Refresh) owns a clean generation, unaffected by the previous instance', async () => {
    // Drive the *current* module instance's generation forward first, so if a fresh module
    // instance somehow shared or leaked the counter/listener set, this would catch it.
    const priorStorage = controllableStorage();
    useAppStore.persist.setOptions({ storage: priorStorage.storage });
    const priorRehydrate = useAppStore.persist.rehydrate();
    priorStorage.resolve(null);
    await priorRehydrate;

    let freshModule: typeof import('../store/useAppStore') | undefined;
    jest.isolateModules(() => {
      freshModule = require('../store/useAppStore');
    });
    const freshStore = freshModule!.useAppStore;
    const freshWait = freshModule!.waitForStoreHydration;

    expect(freshStore).not.toBe(useAppStore);

    const freshStorage = controllableStorage();
    freshStore.persist.setOptions({ storage: freshStorage.storage });
    const freshRehydrate = freshStore.persist.rehydrate();
    const freshWaiter = freshWait(5000);
    freshStorage.resolve(null);
    await freshRehydrate;
    await expect(freshWaiter).resolves.toEqual({ outcome: 'success' });
  });
});

describe('waitForStoreHydration — AbortSignal listener cleanup (all outcomes)', () => {
  it('already-settled success (synchronous replay) leaves no abort listener attached', async () => {
    const controllable = controllableStorage();
    useAppStore.persist.setOptions({ storage: controllable.storage });
    const rehydratePromise = useAppStore.persist.rehydrate();
    controllable.resolve(null);
    await rehydratePromise;
    await Promise.resolve();

    const controller = new AbortController();
    const result = await waitForStoreHydration(5000, controller.signal);

    expect(result).toEqual({ outcome: 'success' });
    expect(getEventListeners(controller.signal, 'abort')).toHaveLength(0);
  });

  it('already-settled failure (synchronous replay) leaves no abort listener attached — rejected: false', async () => {
    const controllable = controllableStorage();
    useAppStore.persist.setOptions({ storage: controllable.storage });
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const rehydratePromise = useAppStore.persist.rehydrate();
    controllable.reject(new Error('AsyncStorage read failed'));
    await rehydratePromise.catch(() => {});
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    const controller = new AbortController();
    let rejected = false;
    const result = await waitForStoreHydration(5000, controller.signal).catch((error) => {
      rejected = true;
      throw error;
    });

    expect(rejected).toBe(false);
    expect(result).toEqual({ outcome: 'failure' });
    expect(getEventListeners(controller.signal, 'abort')).toHaveLength(0);

    errorSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it('async success (not yet settled at call time) leaves no abort listener attached once resolved', async () => {
    const controllable = controllableStorage();
    useAppStore.persist.setOptions({ storage: controllable.storage });
    const rehydratePromise = useAppStore.persist.rehydrate();
    const controller = new AbortController();
    const waitPromise = waitForStoreHydration(5000, controller.signal);
    expect(getEventListeners(controller.signal, 'abort')).toHaveLength(1);

    controllable.resolve(null);
    await rehydratePromise;
    await expect(waitPromise).resolves.toEqual({ outcome: 'success' });
    expect(getEventListeners(controller.signal, 'abort')).toHaveLength(0);
  });

  it('async failure (not yet settled at call time) leaves no abort listener attached once resolved', async () => {
    const controllable = controllableStorage();
    useAppStore.persist.setOptions({ storage: controllable.storage });
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const rehydratePromise = useAppStore.persist.rehydrate();
    const controller = new AbortController();
    const waitPromise = waitForStoreHydration(5000, controller.signal);

    controllable.reject(new Error('boom'));
    await rehydratePromise.catch(() => {});
    await expect(waitPromise).resolves.toEqual({ outcome: 'failure' });
    expect(getEventListeners(controller.signal, 'abort')).toHaveLength(0);

    errorSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it('timeout leaves no abort listener attached once resolved', async () => {
    jest.useFakeTimers();
    try {
      const controllable = controllableStorage(); // getItem deliberately never settles
      useAppStore.persist.setOptions({ storage: controllable.storage });
      void useAppStore.persist.rehydrate();
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const controller = new AbortController();

      const waitPromise = waitForStoreHydration(1000, controller.signal);
      expect(getEventListeners(controller.signal, 'abort')).toHaveLength(1);

      jest.advanceTimersByTime(1000);
      await expect(waitPromise).resolves.toEqual({ outcome: 'timeout' });
      expect(getEventListeners(controller.signal, 'abort')).toHaveLength(0);

      warnSpy.mockRestore();
    } finally {
      jest.useRealTimers();
    }
  });

  it('abort leaves no abort listener attached once resolved', async () => {
    const controllable = controllableStorage(); // never settles on its own
    useAppStore.persist.setOptions({ storage: controllable.storage });
    void useAppStore.persist.rehydrate();
    const controller = new AbortController();

    const waitPromise = waitForStoreHydration(5000, controller.signal);
    expect(getEventListeners(controller.signal, 'abort')).toHaveLength(1);

    controller.abort();
    await expect(waitPromise).resolves.toEqual({ outcome: 'aborted' });
    expect(getEventListeners(controller.signal, 'abort')).toHaveLength(0);
  });

  it('a late settlement after this waiter already timed out leaves no lingering listener and does not throw', async () => {
    jest.useFakeTimers();
    try {
      const controllable = controllableStorage();
      useAppStore.persist.setOptions({ storage: controllable.storage });
      void useAppStore.persist.rehydrate();
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const controller = new AbortController();

      const waitPromise = waitForStoreHydration(1000, controller.signal);
      jest.advanceTimersByTime(1000);
      await expect(waitPromise).resolves.toEqual({ outcome: 'timeout' });
      expect(getEventListeners(controller.signal, 'abort')).toHaveLength(0);

      controllable.resolve(null); // late real settle
      await Promise.resolve();
      await Promise.resolve();
      expect(getEventListeners(controller.signal, 'abort')).toHaveLength(0);

      warnSpy.mockRestore();
    } finally {
      jest.useRealTimers();
    }
  });

  it('a late real settlement after abort does not throw and leaves no lingering listener', async () => {
    const controllable = controllableStorage();
    useAppStore.persist.setOptions({ storage: controllable.storage });
    void useAppStore.persist.rehydrate();
    const controller = new AbortController();

    const waitPromise = waitForStoreHydration(5000, controller.signal);
    controller.abort();
    await expect(waitPromise).resolves.toEqual({ outcome: 'aborted' });
    expect(getEventListeners(controller.signal, 'abort')).toHaveLength(0);

    controllable.resolve(null);
    await Promise.resolve();
    await Promise.resolve();
    expect(getEventListeners(controller.signal, 'abort')).toHaveLength(0);
  });

  it('an already-aborted signal at call time resolves aborted immediately with no listener ever attached', async () => {
    const controllable = controllableStorage(); // never settles
    useAppStore.persist.setOptions({ storage: controllable.storage });
    void useAppStore.persist.rehydrate();
    const controller = new AbortController();
    controller.abort();

    const result = await waitForStoreHydration(5000, controller.signal);

    expect(result).toEqual({ outcome: 'aborted' });
    expect(getEventListeners(controller.signal, 'abort')).toHaveLength(0);
  });

  it('multiple waiters sharing one signal all resolve aborted and leave no listeners behind', async () => {
    const controllable = controllableStorage(); // never settles
    useAppStore.persist.setOptions({ storage: controllable.storage });
    void useAppStore.persist.rehydrate();
    const controller = new AbortController();

    const first = waitForStoreHydration(5000, controller.signal);
    const second = waitForStoreHydration(5000, controller.signal);
    const third = waitForStoreHydration(5000, controller.signal);
    expect(getEventListeners(controller.signal, 'abort')).toHaveLength(3);

    controller.abort();

    await expect(first).resolves.toEqual({ outcome: 'aborted' });
    await expect(second).resolves.toEqual({ outcome: 'aborted' });
    await expect(third).resolves.toEqual({ outcome: 'aborted' });
    expect(getEventListeners(controller.signal, 'abort')).toHaveLength(0);
  });
});

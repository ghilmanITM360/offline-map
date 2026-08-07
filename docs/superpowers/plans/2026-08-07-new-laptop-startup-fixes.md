# New Laptop Startup Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix four remaining startup/state-management defects on the `agent/new-laptop-startup-fixes` branch: an AbortSignal listener leak in `waitForStoreHydration`'s synchronous-replay path, SplashScreen's broad catch that bypasses `StartupManager` as sole route authority, missing distinguishable hydration-outcome logging, and a missing reverse (outside→inside) route-request behavioral proof in `DirectionsViewModel`.

**Architecture:** Each fix is small and localized: one guard clause in `useAppStore.ts`, a restructuring of `SplashScreen.tsx`'s `checkStatus()` to normalize each startup dependency independently instead of relying on one try/catch, and two new test suites (plus one plain-Node/tsx script) proving the fixes. No new abstractions, no touched files outside the explicit scope below.

**Tech Stack:** TypeScript, Zustand (persist middleware), React Native + Expo, Jest (`jest-expo/android` preset) for component tests, `tsx`/plain Node for the standalone script suite.

## Global Constraints

- Working tree: `/Users/ghilmanislam360/GhilmanProjects/offline-map-new-laptop-startup-fixes` on branch `agent/new-laptop-startup-fixes`, based on `31679eef17ad7da767ee4e0070eeb5f873bb7f1f`.
- Do NOT modify: HomeScreen fresh-GPS production wiring, sheets, search behavior, marker ownership, labels, navigation Exit behavior, `BaseMapModeResolver`, `RoutingServiceV2`, provider order, gate data, dependencies, `package.json`.
- Do NOT push, merge, build APK, or touch `agent/benchmark-fixes-integration`.
- No new npm scripts — the plain-Node repro script is run directly via `node --import tsx scripts/<file>.ts`, never registered in `package.json`.
- Every new/changed behavior needs a real, runnable test — no placeholder assertions.
- Create focused commits, one per logical fix (see per-task commit steps).

---

## Background (already established by inline investigation — do not re-derive)

**Bug 1 — `src/store/useAppStore.ts`, `waitForStoreHydration()` (around line 565):**

```ts
    if (signal) {
      if (signal.aborted) finish({ outcome: 'aborted' });
      else signal.addEventListener('abort', onAbort, { once: true });
    }
```

When `subscribeHydrationOutcome(generation, listener)` (the line just above this block) hits its **synchronous replay** branch — i.e. this exact `generation` already settled before this waiter was created — it invokes `listener` synchronously, which calls `finish()` and resolves the promise, **before** this `if (signal)` block runs. Because the block never checks whether `finish()` already ran, it unconditionally calls `signal.addEventListener('abort', onAbort, { once: true })` on an already-settled promise, leaking a listener that is never removed (unless the signal happens to fire abort later). Fix: gate the whole block on `!settled`.

**Bug 2 — `src/views/screens/SplashScreen.tsx`, `checkStatus()`:** the entire `Promise.all([...])` + processing + `StartupManager.resolve()` + `navigation.replace()` sequence is wrapped in one `try { ... } catch { ...; navigation.replace('Main'); }`. Any rejection from `OnboardingStatusService.hasSeenWelcome()`, `Location.getForegroundPermissionsAsync()`, `OfflineMapStatusService.validateAtStartup()` (its `readManifest()` calls `AsyncStorage.getItem` with no internal catch), `OfflineMapStatusService.isGraphOnlyModeEnabled()` / `isSkippedOnlineModeEnabled()`, or `OnboardingStatusService.hasSkippedLocationPermission()` forces a hardcoded `Main` navigation, completely bypassing `StartupManager.resolve()` — so a corrupt-map or first-install user could be dumped straight into `Main`. `OfflineMapService.getMapStatus()` and `ConnectivityService.isConnected()` already internally catch and return safe defaults (verified by reading both files), so they don't strictly need extra wrapping, but wrapping them too is harmless defense-in-depth and keeps the dependency list uniform. `waitForStoreHydration()` never rejects by design (already correct).

Fix: give each of the 7 non-self-guarded dependencies (`hasSeenWelcome`, permission-granted boolean, `skippedLocationPermission`, `validateAtStartup`, `isConnected`, `isGraphOnlyModeEnabled`, `isSkippedOnlineModeEnabled`) its own `.catch()` with a conservative fallback + a specific `console.error` diagnostic, so `Promise.all` itself never rejects, then delete the broad `try/catch` — `StartupManager.resolve()` runs exactly once, unconditionally, with whatever values (real or conservative-fallback) came out of `Promise.all`.

Conservative fallbacks (all verified against `StartupManager.resolve()`'s branch order in `src/services/StartupManager.ts`):
| Dependency | Fallback | Why conservative |
|---|---|---|
| `hasSeenWelcome` | `false` | Routes to `Welcome`, never assumes onboarding done |
| permission granted | `false` | Routes toward `Permission`, never assumes granted |
| `skippedLocationPermission` | `false` | Does not bypass the mandatory `Permission` screen |
| `offlineMapStatus` (from `validateAtStartup`) | `{ status: 'not_downloaded', manifest: null, reason: '<diagnostic>' }` | Never claims a healthy downloaded map |
| `isConnected` | `false` | Matches `ConnectivityService`'s own existing internal fallback |
| `graphOnlyModeEnabled` | `false` | Doesn't silently unlock graph-only Main |
| `skippedOnlineModeEnabled` | `false` | Doesn't silently unlock online-skip Main |

**Bug 3 — hydration logging:** `useAppStore.ts` already logs distinct `console.error`/`console.warn` lines for hydration failure vs. timeout, and `SplashScreen.tsx` already adds its own `outcome="..."` warn for both. The **abort/unmount** case has no distinguishing log anywhere — `SplashScreen`'s cleanup calls `hydrationAbortControllerRef.current?.abort()` silently. Fix: track whether the hydration wait had already settled (via a ref set right after `Promise.all` resolves) and log a distinct, specific warning in the cleanup function only when unmounting genuinely aborts an in-flight wait (not on every ordinary unmount after a completed startup).

**Task 4 — reverse route-request proof:** `src/__tests__/DirectionsViewModelHybrid.test.tsx`'s `'DirectionsViewModel — active-origin route-request proof'` describe block (test 3) already proves **inside→outside**: committed origin starts inside, crosses the 20m `DIRECTIONS_RECALCULATE_ORIGIN_MOVEMENT_M` threshold outward, and the request switches to `calculateHybridPreview`. There is no test proving the **reverse** — starting committed **outside** (verifying the request went through `calculateHybridPreview`), then crossing back **inside** past the threshold (verifying the request switches to `calculatePreview`), plus a below-threshold sample in between changing neither presentation nor the request origin. Fix: add one new test to that describe block using the existing `previewSpy`/`hybridSpy`/`lastRequestOrigin()` fixtures already defined there, plus a new `lastRequestSource()` helper to assert *which* function fired.

---

## Task 1: Fix the AbortSignal listener leak in `waitForStoreHydration`

**Files:**
- Modify: `src/store/useAppStore.ts:565-568`
- Test: `src/__tests__/useAppStoreHydration.test.ts`

**Interfaces:**
- Consumes: existing `waitForStoreHydration(timeoutMs?, signal?)` export, existing `controllableStorage()` test helper already defined at the top of the test file.
- Produces: no new exports. Test file gains one new top-level import (`getEventListeners` from `node:events`) and one new `describe` block.

- [ ] **Step 1: Write the failing tests**

Add this new `describe` block to the end of `src/__tests__/useAppStoreHydration.test.ts` (after the existing `'waitForStoreHydration — exact hydration-generation isolation'` block, still inside the file, before its closing). Add the import at the top of the file alongside the existing `useAppStore` import:

```ts
import { getEventListeners } from 'node:events';
```

New block:

```ts
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
```

- [ ] **Step 2: Run the new tests to verify they fail on the current (buggy) code**

Run: `npx jest src/__tests__/useAppStoreHydration.test.ts -t "AbortSignal listener cleanup"`
Expected: the two "already-settled" tests FAIL with `getEventListeners(...)` returning length 1, not 0 (the other tests in this new block may pass even on unfixed code, since they don't hit the synchronous-replay path — that's fine, they're regression guards for the fix, not new failures).

- [ ] **Step 3: Apply the fix**

In `src/store/useAppStore.ts`, change:

```ts
    if (signal) {
      if (signal.aborted) finish({ outcome: 'aborted' });
      else signal.addEventListener('abort', onAbort, { once: true });
    }
```

to:

```ts
    if (signal && !settled) {
      if (signal.aborted) finish({ outcome: 'aborted' });
      else signal.addEventListener('abort', onAbort, { once: true });
    }
```

- [ ] **Step 4: Run the full hydration test file to verify everything passes**

Run: `npx jest src/__tests__/useAppStoreHydration.test.ts`
Expected: PASS, all tests (existing 15 + new 10).

- [ ] **Step 5: Commit**

```bash
git add src/store/useAppStore.ts src/__tests__/useAppStoreHydration.test.ts
git commit -m "fix(hydration): never attach an AbortSignal listener after synchronous replay settles waitForStoreHydration"
```

---

## Task 2: Plain-Node/tsx reproduction script

**Files:**
- Create: `scripts/repro-hydration-abort-listener-leak.ts`

**Interfaces:**
- Consumes: `useAppStore`, `waitForStoreHydration` from `../src/store/useAppStore` (production import, no mocks).
- Produces: a standalone script (not wired into `package.json`), run via `node --import tsx scripts/repro-hydration-abort-listener-leak.ts`.

- [ ] **Step 1: Write the script**

```ts
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Plain-Node/tsx reproduction (no Jest, no mocks) for the AbortSignal listener leak that used
 * to exist in waitForStoreHydration's synchronous-replay path. Run directly:
 *   node --import tsx scripts/repro-hydration-abort-listener-leak.ts
 * Not wired into package.json — a standalone diagnostic, not part of any test suite. The
 * covered regression suite lives in src/__tests__/useAppStoreHydration.test.ts.
 */
import { strict as assert } from 'node:assert';
import { getEventListeners } from 'node:events';
import { useAppStore, waitForStoreHydration } from '../src/store/useAppStore';

async function main() {
  // Importing the production store above triggers zustand persist's automatic initial
  // hydrate() attempt. The real @react-native-async-storage/async-storage package throws
  // synchronously in this plain-Node environment (no `window` global), so that attempt
  // settles as a failure almost immediately — no test mocks involved anywhere in this file.
  const warmup = await waitForStoreHydration();
  assert.equal(
    warmup.outcome,
    'failure',
    'expected the automatic initial hydrate() to fail in a plain-Node environment (no window)',
  );
  assert.equal(useAppStore.persist.hasHydrated(), false);

  // The distinguishing scenario: a NEW waiter, with its OWN AbortController, created AFTER
  // the failure has already settled. subscribeHydrationOutcome's synchronous-replay branch
  // fires the listener (and therefore finish()) synchronously, inside the
  // `unsubscribe = subscribeHydrationOutcome(...)` call in waitForStoreHydration — before the
  // formerly-buggy code reached the `if (signal) {...}` block below it and attached an abort
  // listener to an already-settled promise.
  const controller = new AbortController();
  let rejected = false;
  const result = await waitForStoreHydration(5000, controller.signal).catch((error) => {
    rejected = true;
    throw error;
  });

  const remainingAbortListeners = getEventListeners(controller.signal, 'abort').length;

  console.log(`outcome: ${result.outcome}`);
  console.log(`rejected: ${rejected}`);
  console.log(`remaining abort listeners: ${remainingAbortListeners}`);

  assert.equal(result.outcome, 'failure', 'expected the already-settled hydration attempt to replay as a failure');
  assert.equal(rejected, false, 'waitForStoreHydration must never reject');
  assert.equal(remainingAbortListeners, 0, 'the synchronous-replay path must never leave an AbortSignal listener attached');

  console.log('OK: no AbortSignal listener leak on synchronous replay.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
```

- [ ] **Step 2: Run it against the fixed code and capture the exact output**

Run: `node --import tsx scripts/repro-hydration-abort-listener-leak.ts`
Expected: exits 0, prints exactly:
```
outcome: failure
rejected: false
remaining abort listeners: 0
OK: no AbortSignal listener leak on synchronous replay.
```

- [ ] **Step 3: Commit**

```bash
git add scripts/repro-hydration-abort-listener-leak.ts
git commit -m "test(hydration): add plain-Node reproduction for the AbortSignal listener leak fix"
```

---

## Task 3: SplashScreen — remove the broad catch→Main fallback, normalize each dependency

**Files:**
- Modify: `src/views/screens/SplashScreen.tsx`

**Interfaces:**
- Consumes: `OnboardingStatusService.hasSeenWelcome()/hasSkippedLocationPermission()/clearSkippedLocationPermissionOnGrant()`, `Location.getForegroundPermissionsAsync()`, `OfflineMapStatusService.validateAtStartup()/isGraphOnlyModeEnabled()/isSkippedOnlineModeEnabled()`, `ConnectivityService.isConnected()`, `OfflineMapService.getMapStatus()`, `waitForStoreHydration()`, `StartupManager.resolve()` — all unchanged signatures.
- Produces: no new exports; `checkStatus()`'s internal structure changes as described below. This task and Task 4 (logging) touch the same function — apply both together before running SplashScreen tests, since Task 4's log line lives in the same `useEffect`'s cleanup.

- [ ] **Step 1: Rewrite `checkStatus()` in `src/views/screens/SplashScreen.tsx`**

Replace the whole `checkStatus` function body (lines 36-139 in the original file) with:

```ts
    const checkStatus = async () => {
      const hydrationAbortController = new AbortController();
      hydrationAbortControllerRef.current = hydrationAbortController;

      // Minimum visible time so the logo is seen
      const minVisibleMs = new Promise<void>((resolve) => {
        minVisibleTimeoutRef.current = setTimeout(resolve, 1500); // fixed: keep a handle so the delay can be cancelled on unmount
      });

      // Each of these normalizes its own failure independently — a rejection from any single
      // startup dependency must never take down the whole Promise.all below and force a
      // hardcoded route. StartupManager.resolve() is the only place that decides the route;
      // these fallbacks only decide what StartupManager sees when a read genuinely failed.
      const hasSeenWelcomePromise = OnboardingStatusService.hasSeenWelcome().catch((error) => {
        console.error('[SplashScreen] Failed to read welcome status — assuming onboarding is not complete.', error);
        return false;
      });

      const permissionGrantedPromise = Location.getForegroundPermissionsAsync()
        .then((result) => result.status === 'granted')
        .catch((error) => {
          console.error('[SplashScreen] Failed to read location permission status — assuming not granted.', error);
          return false;
        });

      const skippedLocationPermissionPromise = OnboardingStatusService.hasSkippedLocationPermission().catch((error) => {
        console.error('[SplashScreen] Failed to read the skipped-location-permission preference — assuming not skipped.', error);
        return false;
      });

      const startupStatusPromise = OfflineMapStatusService.validateAtStartup().catch((error) => {
        console.error('[SplashScreen] Failed to validate offline map status — assuming the map is not downloaded.', error);
        return { status: 'not_downloaded' as const, manifest: null, reason: 'Map status check failed' };
      });

      const isConnectedPromise = ConnectivityService.isConnected().catch((error) => {
        console.error('[SplashScreen] Failed to read connectivity status — assuming offline.', error);
        return false;
      });

      const graphOnlyModeEnabledPromise = OfflineMapStatusService.isGraphOnlyModeEnabled().catch((error) => {
        console.error('[SplashScreen] Failed to read the graph-only-mode preference — assuming disabled.', error);
        return false;
      });

      const skippedOnlineModeEnabledPromise = OfflineMapStatusService.isSkippedOnlineModeEnabled().catch((error) => {
        console.error('[SplashScreen] Failed to read the skipped-online-mode preference — assuming disabled.', error);
        return false;
      });

      // Run all checks in parallel
      const [mapStatus, startupStatus, permissionGranted, isConnected, graphOnlyModeEnabled, skippedOnlineModeEnabled, hasSeenWelcome, skippedLocationPermission, , hydrationResult] = await Promise.all([
        OfflineMapService.getMapStatus(),
        startupStatusPromise,
        permissionGrantedPromise,
        isConnectedPromise,
        graphOnlyModeEnabledPromise,
        skippedOnlineModeEnabledPromise,
        hasSeenWelcomePromise,
        skippedLocationPermissionPromise,
        minVisibleMs,
        // Persisted-store hydration gate (pre-APK correction) — StartupManager/
        // MapStartupController must never see default (unhydrated) persisted values.
        // HomeScreen only mounts after this Promise.all resolves and navigation.replace()
        // below runs, so this transitively guards every persisted read (hasSeenMapOverview,
        // lastKnownLocation, settings, ...) downstream of Splash too. A known rehydration
        // failure resolves this immediately (see waitForStoreHydration); only a genuine hang
        // rides out the full timeout. Either way startup proceeds with whatever the store
        // currently holds — in-memory defaults on failure/timeout, persisted values on success
        // (persisted values can still reach startup after a bounded timeout too, if the read
        // simply hadn't finished yet — 'timeout' does not imply the data is unavailable, only
        // that this particular wait gave up on it).
        waitForStoreHydration(undefined, hydrationAbortController.signal),
      ]);
      hydrationOutcomeRef.current = hydrationResult.outcome;

      if (!isMountedRef.current) {
        return; // fixed: stop after async work if the splash screen already unmounted
      }

      // Explicit, Splash-scoped acknowledgement of the degraded-startup outcome (in addition
      // to the generation-scoped failure/timeout logs already emitted from inside
      // waitForStoreHydration itself) — startup below proceeds identically for every outcome
      // ('success' | 'failure' | 'timeout'; 'aborted' cannot reach here, see the isMountedRef
      // check above), but this line makes that a deliberate, observable decision rather than
      // a silently-discarded Promise.all slot.
      if (hydrationResult.outcome !== 'success') {
        console.warn(`[SplashScreen] Continuing startup with outcome="${hydrationResult.outcome}" persisted-state hydration — using in-memory defaults for any key not yet confirmed from storage.`);
      }

      const { downloadState, setDownloadState } = useAppStore.getState(); // fixed: reconcile persisted download progress with actual disk state on cold start
      if (downloadState.phase === 'downloading' || downloadState.phase === 'connecting') {
        setDownloadState({ phase: 'idle' }); // fixed: clear stale in-memory downloading state after cold start
      }

      // Sync real map status into persisted Zustand state
      if (mapStatus.isDownloaded) {
        updateOfflineData({
          isDownloaded: true,
          downloadDate: mapStatus.downloadDate ?? undefined,
          sizeMB: mapStatus.sizeMB,
        });
      }
      setOfflineMapStatus(startupStatus.status, startupStatus.reason ?? null);

      setHasLocationPermission(permissionGranted);

      // Real permission is confirmed granted — supersede any earlier "Continue Without
      // Location" choice so a later revocation is treated as fresh, not a still-standing
      // skip. Uses the same canonical helper as every other permission-entry surface
      // (Permission screen, Settings, Home/Recenter, Directions). `effectiveSkippedLocationPermission`
      // is already computed above and does not depend on this write landing, and this call
      // is wrapped in its own try/catch (on top of the helper's own internal one) so a
      // cleanup failure can never fall through and override StartupManager's route
      // resolution — see the "permission-skip cleanup is isolated from route resolution"
      // tests in SplashScreen.test.tsx.
      const effectiveSkippedLocationPermission = permissionGranted ? false : skippedLocationPermission;
      if (permissionGranted && skippedLocationPermission) {
        try {
          await OnboardingStatusService.clearSkippedLocationPermissionOnGrant(true);
        } catch (cleanupError) {
          console.error('[SplashScreen] Failed to clear the skipped-location-permission preference — continuing startup with the in-memory decision.', cleanupError);
        }
      }

      const { route } = StartupManager.resolve({
        hasSeenWelcome,
        permissionGranted,
        skippedLocationPermission: effectiveSkippedLocationPermission,
        offlineMapStatus: startupStatus.status,
        graphOnlyModeEnabled,
        skippedOnlineModeEnabled,
        isConnected,
      });
      navigation.replace(route);
    };
```

Note `hydrationOutcomeRef` is introduced in Task 4 below — add both this task and Task 4's ref declaration together before testing, since this step already references it.

- [ ] **Step 2: Remove the now-dead import if any linting flags it**

No imports become unused by this change (`OfflineMapStatus` type import isn't present; `startupStatus.status` fallback uses `'not_downloaded' as const`, matching the existing `OfflineMapStatus` union without needing a new type import). Run `npm run lint` after Task 4 is also applied (Step order below runs lint once at the end of both tasks).

- [ ] **Step 3: Commit (after Task 4's ref is also in place — see Task 4 Step 1)**

Deferred — see Task 4 Step 4 for the combined commit, since Task 4 Step 1 adds the ref this task's code already references.

---

## Task 4: Deliberate, distinguishable hydration logging for abort/unmount

**Files:**
- Modify: `src/views/screens/SplashScreen.tsx` (same file as Task 3 — apply together)
- Test: `src/__tests__/SplashScreen.test.tsx`

**Interfaces:**
- Consumes: `HydrationWaitOutcome` type already exported from `src/store/useAppStore.ts`.
- Produces: no new exports.

- [ ] **Step 1: Add the outcome-tracking ref and distinguishing cleanup log**

In `src/views/screens/SplashScreen.tsx`, add the import and ref near the top of the component (alongside the existing refs):

```ts
import { useAppStore, waitForStoreHydration, type HydrationWaitOutcome } from '../../store/useAppStore';
```

(This replaces the existing `import { useAppStore, waitForStoreHydration } from '../../store/useAppStore';` line — add the type import alongside it.)

```ts
  const hydrationAbortControllerRef = useRef<AbortController | null>(null);
  const hydrationOutcomeRef = useRef<HydrationWaitOutcome | null>(null); // null until Promise.all resolves — lets cleanup distinguish "still waiting" from "already settled"
```

Then replace the effect's cleanup function:

```ts
    return () => {
      isMountedRef.current = false; // fixed: mark splash work as cancelled on unmount
      if (minVisibleTimeoutRef.current) {
        clearTimeout(minVisibleTimeoutRef.current); // fixed: cancel the pending splash timeout
      }
      if (hydrationOutcomeRef.current === null) {
        // Distinguishable from the failure/timeout logs in useAppStore.ts and the
        // outcome="..." log above — this is the only place an 'aborted' hydration outcome
        // can originate, since SplashScreen unmounting before Promise.all resolves is the
        // only thing that ever calls .abort() on this controller. Deliberately logs only the
        // outcome, never any persisted state.
        console.warn('[SplashScreen] Unmounted before persisted-store hydration settled — aborting the wait (outcome: aborted).');
      }
      hydrationAbortControllerRef.current?.abort(); // let waitForStoreHydration drop its listeners immediately instead of idling out the timeout
    };
```

- [ ] **Step 2: Write the failing test**

Add to `src/__tests__/SplashScreen.test.tsx`, inside the existing `describe('SplashScreen — hydration degradation is route-safe', ...)` block (after the last `it(...)`, before its closing `});`):

```ts
  it('unmounting before hydration settles logs a distinguishable abort diagnostic, separate from failure/timeout', async () => {
    const controllable = controllableStorage();
    useAppStore.persist.setOptions({ storage: controllable.storage });
    const rehydratePromise = useAppStore.persist.rehydrate();
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    let unmount!: () => Promise<void>;
    await act(async () => {
      const result = await render(<SplashScreen />);
      unmount = result.unmount;
    });
    await flush();
    expect(mockReplaceSpy).not.toHaveBeenCalled();

    await act(async () => {
      await unmount();
    });

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('[SplashScreen]'));
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('outcome: aborted'));
    expect(warnSpy).not.toHaveBeenCalledWith(expect.stringContaining('Hydration failed'));
    expect(warnSpy).not.toHaveBeenCalledWith(expect.stringContaining('Hydration timed out'));

    await act(async () => {
      controllable.resolve(null); // late settle, after unmount
      await rehydratePromise;
    });
    await flush();
    expect(mockReplaceSpy).not.toHaveBeenCalled();

    warnSpy.mockRestore();
  });

  it('does not log the abort diagnostic when unmounting after startup already completed', async () => {
    const controllable = controllableStorage();
    useAppStore.persist.setOptions({ storage: controllable.storage });
    const rehydratePromise = useAppStore.persist.rehydrate();
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    let unmount!: () => Promise<void>;
    await act(async () => {
      const result = await render(<SplashScreen />);
      unmount = result.unmount;
    });
    await act(async () => {
      controllable.resolve(null);
      await rehydratePromise;
    });
    await flush();
    expect(mockReplaceSpy).toHaveBeenCalledTimes(1);
    warnSpy.mockClear();

    await act(async () => {
      await unmount();
    });

    expect(warnSpy).not.toHaveBeenCalledWith(expect.stringContaining('outcome: aborted'));

    warnSpy.mockRestore();
  });
```

- [ ] **Step 3: Run the tests to verify the new ones pass and nothing else regresses**

Run: `npx jest src/__tests__/SplashScreen.test.tsx`
Expected: PASS, all tests (existing + 2 new from this task).

- [ ] **Step 4: Combined commit for Task 3 + Task 4**

```bash
git add src/views/screens/SplashScreen.tsx
git commit -m "fix(splash): normalize each startup dependency independently and remove the broad catch->Main fallback"
```

(Keep this as one commit since Task 3's rewritten `checkStatus()` and Task 4's ref/log are inseparable edits to the same function — splitting them would leave an intermediate commit referencing `hydrationOutcomeRef` before it exists.)

---

## Task 5: SplashScreen dependency-failure matrix tests (proves Task 3's fix)

**Files:**
- Test: `src/__tests__/SplashScreen.test.tsx`

**Interfaces:**
- Consumes: existing jest mocks already declared at the top of the file (`Location`, `OfflineMapService`, `OfflineMapStatusService`, `ConnectivityService`, `OnboardingStatusService`), existing `controllableStorage()`/`flush()`/`renderAndResolveHydration`-style helpers.

- [ ] **Step 1: Write the new describe block**

Add a new top-level describe block to `src/__tests__/SplashScreen.test.tsx` (after the existing `'SplashScreen — hydration degradation is route-safe'` block):

```ts
describe('SplashScreen — unrelated dependency failures cannot bypass StartupManager', () => {
  async function renderAndSettleHydration() {
    const controllable = controllableStorage();
    useAppStore.persist.setOptions({ storage: controllable.storage });
    const rehydratePromise = useAppStore.persist.rehydrate();

    await act(async () => {
      render(<SplashScreen />);
    });
    await act(async () => {
      controllable.resolve(null);
      await rehydratePromise;
    });
    await flush();
  }

  it('a welcome-status read failure does not assume onboarding complete — still routes to Welcome', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    (OnboardingStatusService.hasSeenWelcome as jest.Mock).mockRejectedValue(new Error('disk full'));

    await renderAndSettleHydration();

    expect(mockReplaceSpy).toHaveBeenCalledTimes(1);
    expect(mockReplaceSpy).toHaveBeenCalledWith('Welcome');
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to read welcome status'), expect.any(Error));
    errorSpy.mockRestore();
  });

  it('a permission read failure does not assume granted — still routes to Permission', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    (Location.getForegroundPermissionsAsync as jest.Mock).mockRejectedValue(new Error('native module crashed'));

    await renderAndSettleHydration();

    expect(mockReplaceSpy).toHaveBeenCalledTimes(1);
    expect(mockReplaceSpy).toHaveBeenCalledWith('Permission');
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to read location permission status'), expect.any(Error));
    errorSpy.mockRestore();
  });

  it('a skipped-permission read failure does not assume skipped — still routes to Permission when not granted', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    (Location.getForegroundPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'denied', canAskAgain: true });
    (OnboardingStatusService.hasSkippedLocationPermission as jest.Mock).mockRejectedValue(new Error('disk full'));

    await renderAndSettleHydration();

    expect(mockReplaceSpy).toHaveBeenCalledTimes(1);
    expect(mockReplaceSpy).toHaveBeenCalledWith('Permission');
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to read the skipped-location-permission preference'), expect.any(Error));
    errorSpy.mockRestore();
  });

  it('a map-status read failure does not assume a healthy downloaded map — still routes to DownloadMap when connected', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    (OfflineMapStatusService.validateAtStartup as jest.Mock).mockRejectedValue(new Error('AsyncStorage read failed'));

    await renderAndSettleHydration();

    expect(mockReplaceSpy).toHaveBeenCalledTimes(1);
    expect(mockReplaceSpy).toHaveBeenCalledWith('DownloadMap');
    expect(useAppStore.getState().offlineMapStatus).toBe('not_downloaded');
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to validate offline map status'), expect.any(Error));
    errorSpy.mockRestore();
  });

  it('a map-status read failure combined with offline still lands on graph-only Main, never a hardcoded fallback', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    (OfflineMapStatusService.validateAtStartup as jest.Mock).mockRejectedValue(new Error('AsyncStorage read failed'));
    (ConnectivityService.isConnected as jest.Mock).mockResolvedValue(false);

    await renderAndSettleHydration();

    expect(mockReplaceSpy).toHaveBeenCalledTimes(1);
    expect(mockReplaceSpy).toHaveBeenCalledWith('Main');
    // Proves this reached Main via StartupManager's graph-only/offline branch, not the
    // deleted catch-all — that branch always set this exact message.
    expect(useAppStore.getState().offlineMapStatusMessage).not.toEqual(expect.stringContaining('Startup checks failed'));
    errorSpy.mockRestore();
  });

  it('a connectivity read failure preserves the existing conservative (offline) behavior', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    (ConnectivityService.isConnected as jest.Mock).mockRejectedValue(new Error('network module crashed'));
    (OfflineMapStatusService.validateAtStartup as jest.Mock).mockResolvedValue({ status: 'not_downloaded', manifest: null });

    await renderAndSettleHydration();

    expect(mockReplaceSpy).toHaveBeenCalledTimes(1);
    expect(mockReplaceSpy).toHaveBeenCalledWith('Main'); // no internet + no map -> graph-only Main, same as a real disconnected read
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to read connectivity status'), expect.any(Error));
    errorSpy.mockRestore();
  });

  it('a corrupt map status still routes to DownloadMap even when an unrelated welcome-status read also fails', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    (OfflineMapStatusService.validateAtStartup as jest.Mock).mockResolvedValue({ status: 'corrupt', reason: 'checksum mismatch' });
    (OnboardingStatusService.hasSkippedLocationPermission as jest.Mock).mockRejectedValue(new Error('disk full'));

    await renderAndSettleHydration();

    expect(mockReplaceSpy).toHaveBeenCalledTimes(1);
    expect(mockReplaceSpy).toHaveBeenCalledWith('DownloadMap');
    errorSpy.mockRestore();
  });

  it('a needs_update map status still routes to DownloadMap even when connectivity read fails', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    (OfflineMapStatusService.validateAtStartup as jest.Mock).mockResolvedValue({ status: 'needs_update', reason: 'newer version available' });
    (ConnectivityService.isConnected as jest.Mock).mockRejectedValue(new Error('network module crashed'));

    await renderAndSettleHydration();

    expect(mockReplaceSpy).toHaveBeenCalledTimes(1);
    expect(mockReplaceSpy).toHaveBeenCalledWith('DownloadMap');
    errorSpy.mockRestore();
  });

  it('graph-only mode still resolves to Main when an unrelated permission-skip read fails', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    (OfflineMapStatusService.validateAtStartup as jest.Mock).mockResolvedValue({ status: 'not_downloaded', manifest: null });
    (OfflineMapStatusService.isGraphOnlyModeEnabled as jest.Mock).mockResolvedValue(true);
    (OnboardingStatusService.hasSkippedLocationPermission as jest.Mock).mockRejectedValue(new Error('disk full'));

    await renderAndSettleHydration();

    expect(mockReplaceSpy).toHaveBeenCalledTimes(1);
    expect(mockReplaceSpy).toHaveBeenCalledWith('Main');
    errorSpy.mockRestore();
  });

  it('every dependency failing at once still resolves exactly one route via StartupManager (Welcome wins precedence), never a hardcoded fallback', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    (OnboardingStatusService.hasSeenWelcome as jest.Mock).mockRejectedValue(new Error('a'));
    (Location.getForegroundPermissionsAsync as jest.Mock).mockRejectedValue(new Error('b'));
    (OnboardingStatusService.hasSkippedLocationPermission as jest.Mock).mockRejectedValue(new Error('c'));
    (OfflineMapStatusService.validateAtStartup as jest.Mock).mockRejectedValue(new Error('d'));
    (ConnectivityService.isConnected as jest.Mock).mockRejectedValue(new Error('e'));
    (OfflineMapStatusService.isGraphOnlyModeEnabled as jest.Mock).mockRejectedValue(new Error('f'));
    (OfflineMapStatusService.isSkippedOnlineModeEnabled as jest.Mock).mockRejectedValue(new Error('g'));

    await renderAndSettleHydration();

    expect(mockReplaceSpy).toHaveBeenCalledTimes(1);
    expect(mockReplaceSpy).toHaveBeenCalledWith('Welcome'); // hasSeenWelcome falls back to false, which StartupManager prioritizes above everything else
    errorSpy.mockRestore();
  });

  it('unmounting during a dependency failure produces no navigation, and a late resolution produces no second navigation', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    let rejectWelcome!: (error: unknown) => void;
    (OnboardingStatusService.hasSeenWelcome as jest.Mock).mockReturnValue(
      new Promise((_, reject) => {
        rejectWelcome = reject;
      }),
    );
    const controllable = controllableStorage();
    useAppStore.persist.setOptions({ storage: controllable.storage });
    const rehydratePromise = useAppStore.persist.rehydrate();

    let unmount!: () => Promise<void>;
    await act(async () => {
      const result = await render(<SplashScreen />);
      unmount = result.unmount;
    });
    await act(async () => {
      controllable.resolve(null);
      await rehydratePromise;
    });
    await flush();
    expect(mockReplaceSpy).not.toHaveBeenCalled();

    await act(async () => {
      await unmount();
    });

    await act(async () => {
      rejectWelcome(new Error('late failure after unmount'));
      await Promise.resolve().catch(() => {});
    });
    await flush();

    expect(mockReplaceSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
```

- [ ] **Step 2: Run the tests**

Run: `npx jest src/__tests__/SplashScreen.test.tsx`
Expected: PASS, all tests including the 11 new ones in this block.

- [ ] **Step 3: Commit**

```bash
git add src/__tests__/SplashScreen.test.tsx
git commit -m "test(splash): prove unrelated startup-dependency failures cannot bypass StartupManager"
```

---

## Task 6: DirectionsViewModel — reverse (outside→inside) route-request proof

**Files:**
- Test: `src/__tests__/DirectionsViewModelHybrid.test.tsx`

**Interfaces:**
- Consumes: `previewSpy`, `hybridSpy`, `lastRequestOrigin()`, `isInsideSpy`, `insideCoord`, `committedOutsideCoord` already defined in the existing `'DirectionsViewModel — active-origin route-request proof'` describe block.
- Produces: one new helper (`lastRequestSource()`) and one new coordinate constant, both scoped to that describe block; one new test.

- [ ] **Step 1: Add `lastRequestSource()` helper and a below-threshold-from-outside coordinate**

Inside the `describe('DirectionsViewModel — active-origin route-request proof', ...)` block in `src/__tests__/DirectionsViewModelHybrid.test.tsx`, immediately after the existing `manualOrigin` constant declaration, add:

```ts
  // ~5.6m from committedOutsideCoord — still outside, but below the 20m movement threshold,
  // so it must not move the committed origin away from committedOutsideCoord.
  const nearCommittedOutsideCoord = { latitude: committedOutsideCoord.latitude + 0.00005, longitude: committedOutsideCoord.longitude };
```

Immediately after the existing `lastRequestOrigin()` function (which already merges `previewSpy`/`hybridSpy` calls by invocation order), add:

```ts
  // Same merge-by-call-order technique as lastRequestOrigin(), but reports which of the two
  // underlying methods actually carried the most recent request — proves the request didn't
  // just carry the right origin by coincidence, but went through the correct provider path
  // for that origin's inside/outside classification.
  function lastRequestSource(): 'preview' | 'hybrid' | undefined {
    const fromPreview = previewSpy.mock.invocationCallOrder.map((order) => ({ order, source: 'preview' as const }));
    const fromHybrid = hybridSpy.mock.invocationCallOrder.map((order) => ({ order, source: 'hybrid' as const }));
    const merged = [...fromPreview, ...fromHybrid].sort((a, b) => a.order - b.order);
    return merged.at(-1)?.source;
  }
```

- [ ] **Step 2: Write the new test**

Add as test 6 in that same describe block (after test 5, before the block's closing `});`):

```ts
  test('6. reverse: a committed outside origin routes through calculateHybridPreview; once it commits back inside past the threshold, the request switches to calculatePreview with the new origin', async () => {
    useAppStore.setState({ currentLocation: committedOutsideCoord, currentLocationSource: 'live', lastKnownLocation: committedOutsideCoord });
    const hook = await renderHook(() => useDirectionsViewModel(destination));
    await waitFor(() => expect(hook.result.current.loadState).toBe('ready'));

    expect(lastRequestOrigin()).toEqual(committedOutsideCoord);
    expect(lastRequestSource()).toBe('hybrid');
    expect(hook.result.current.isOutsideStart).toBe(true);

    // A below-threshold raw GPS sample must change neither presentation nor the request origin.
    await act(() => {
      useAppStore.getState().setCurrentLocation(nearCommittedOutsideCoord, 'live');
    });
    expect(lastRequestOrigin()).toEqual(committedOutsideCoord);
    expect(lastRequestSource()).toBe('hybrid');
    expect(hook.result.current.isOutsideStart).toBe(true);

    // Crossing back past the threshold commits the new (inside) origin.
    await act(() => {
      useAppStore.getState().setCurrentLocation(insideCoord, 'live');
    });

    await waitFor(() => expect(lastRequestOrigin()).toEqual(insideCoord));
    expect(lastRequestSource()).toBe('preview');
    expect(hook.result.current.isOutsideStart).toBe(false);
  });
```

- [ ] **Step 3: Run the test**

Run: `npx jest src/__tests__/DirectionsViewModelHybrid.test.tsx`
Expected: PASS, all tests including the new test 6.

- [ ] **Step 4: Commit**

```bash
git add src/__tests__/DirectionsViewModelHybrid.test.tsx
git commit -m "test(directions): prove the reverse outside-to-inside route-request switch from calculateHybridPreview to calculatePreview"
```

---

## Task 7: Full verification sweep

**Files:** none (verification only).

- [ ] **Step 1: Type check, lint, and full test suites**

Run in order, fixing anything that surfaces before moving to the next:
```bash
npm run typecheck
npm run lint
npm test
npm run test:components -- --runInBand
npm run test:all-gates-v2
npm run test:outside-street-gate-selection-cost-v2
npm run test:core-provider-routing-contract-v2
npm run test:reroute-v2
git diff --check
```
Expected: all exit 0, `git diff --check` prints nothing (no trailing whitespace/conflict markers).

- [ ] **Step 2: Run the plain-Node repro once more standalone for the final report**

Run: `node --import tsx scripts/repro-hydration-abort-listener-leak.ts`
Capture exact stdout for the final report's "plain-Node listener reproduction" section.

- [ ] **Step 3: Run the four focused suites five consecutive times each**

```bash
for i in 1 2 3 4 5; do npx jest src/__tests__/useAppStoreHydration.test.ts --silent; done
for i in 1 2 3 4 5; do npx jest src/__tests__/SplashScreen.test.tsx --silent; done
for i in 1 2 3 4 5; do npx jest src/__tests__/StartupManager.test.ts --silent; done
for i in 1 2 3 4 5; do npx jest src/__tests__/DirectionsViewModelHybrid.test.tsx --silent; done
```
Expected: 5/5 pass for each, identical test counts every run (no flakiness). Record exact counts for the final report.

- [ ] **Step 4: Confirm final git status**

Run: `git status --porcelain` (expect empty — everything committed) and `git log --oneline 31679eef17ad7da767ee4e0070eeb5f873bb7f1f..HEAD` (expect the 5 commits from Tasks 1-6, noting Task 3+4 share one commit).

No commit needed for this task — verification only.

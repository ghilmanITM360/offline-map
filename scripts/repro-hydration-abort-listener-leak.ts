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

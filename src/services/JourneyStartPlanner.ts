/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { LocationCapability } from './LocationCapability';

// What a destination tap in the Directory should do (#307). The Directory is the one place chooser, so a tap
// means "take me here": it either starts the journey from where the user is, or asks where they start. It never
// bounces the user to Settings and never fakes a position. A start is only ever LIVE (a fresh fix) or one the user
// chooses for this journey: a start left over from an earlier trip is never reused, so there is no "known start" input.
export type DestinationTapPlan = { kind: 'live' } | { kind: 'ask_start' };

// Blockers that only mean "no usable fix yet": permission and precision are fine, so trying to find the
// location is worthwhile. Anything else (denied, approximate, services off) cannot be fixed by waiting.
const FIX_PENDING_BLOCKERS = new Set(['acquiring', 'no_fix', 'stale_fix', 'weak_fix']);

export function planDestinationTap(input: { capability: LocationCapability }): DestinationTapPlan {
  const { liveBlocker } = input.capability;
  if (liveBlocker === null || FIX_PENDING_BLOCKERS.has(liveBlocker)) return { kind: 'live' };
  return { kind: 'ask_start' };
}

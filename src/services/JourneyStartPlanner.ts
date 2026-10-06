/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Place } from '../models/types';
import type { LocationCapability } from './LocationCapability';

// What a destination tap in the Directory should do (#307). The Directory is the one place chooser, so a tap
// means "take me here": it either starts the journey from where the user is, or asks where they start. It never
// bounces the user to Settings and never fakes a position.
export type DestinationTapPlan =
  | { kind: 'live' }
  | { kind: 'guide'; start: Place }
  | { kind: 'ask_start' };

// Blockers that only mean "no usable fix yet": permission and precision are fine, so trying to find the
// location is worthwhile. Anything else (denied, approximate, services off) cannot be fixed by waiting.
const FIX_PENDING_BLOCKERS = new Set(['acquiring', 'no_fix', 'stale_fix', 'weak_fix']);

export function planDestinationTap(input: { capability: LocationCapability; knownStart: Place | null }): DestinationTapPlan {
  const { liveBlocker } = input.capability;
  if (liveBlocker === null || FIX_PENDING_BLOCKERS.has(liveBlocker)) return { kind: 'live' };
  if (input.knownStart) return { kind: 'guide', start: input.knownStart };
  return { kind: 'ask_start' };
}

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// #139 Option B: the only thing that survives Android process death during navigation.
// "Navigation was active and did not finish cleanly" plus the destination id, nothing else:
// no coordinates, route, progress or movement data (#145). The clock is always passed in so
// expiry is deterministic and never needs a timer.

export const UNFINISHED_JOURNEY_VERSION = 1;
export const UNFINISHED_JOURNEY_TTL_MS = 2 * 60 * 60 * 1000;

export interface UnfinishedJourney {
  version: typeof UNFINISHED_JOURNEY_VERSION;
  unfinishedNavigation: true;
  /** Epoch ms when navigation became active. */
  createdAt: number;
  destinationId: string;
}

const KEYS = ['version', 'unfinishedNavigation', 'createdAt', 'destinationId'];

export function createUnfinishedJourney(destinationId: unknown, nowMs: number): UnfinishedJourney | null {
  if (typeof destinationId !== 'string' || destinationId.length === 0) return null;
  return { version: UNFINISHED_JOURNEY_VERSION, unfinishedNavigation: true, createdAt: nowMs, destinationId };
}

/**
 * Fails closed: anything that is not exactly a current-version marker, still within the TTL
 * and not dated in the future, is treated as "no unfinished journey". Extra keys are rejected
 * so a payload carrying location data can never be exposed.
 */
export function parseUnfinishedJourney(raw: unknown, nowMs: number): UnfinishedJourney | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const keys = Object.keys(r);
  if (keys.length !== KEYS.length || !KEYS.every((k) => keys.includes(k))) return null;
  if (r.version !== UNFINISHED_JOURNEY_VERSION || r.unfinishedNavigation !== true) return null;
  if (typeof r.createdAt !== 'number' || !Number.isFinite(r.createdAt)) return null;
  const age = nowMs - r.createdAt;
  if (age < 0 || age > UNFINISHED_JOURNEY_TTL_MS) return null;
  return createUnfinishedJourney(r.destinationId, r.createdAt);
}

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// #145 retention policy (docs/DATA_RETENTION.md). Pure functions: the clock is always passed in.

export const LAST_KNOWN_LOCATION_MAX_AGE_MS = 24 * 60 * 60 * 1000;
export const RECENT_SEARCH_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

interface Located { latitude: number; longitude: number }
const MAX_RECENT_SEARCHES = 10;

const isUsableCoordinate = (c: unknown): c is Located => {
  if (!c || typeof c !== 'object' || Array.isArray(c)) return false;
  const { latitude, longitude } = c as Record<string, unknown>;
  return typeof latitude === 'number' && typeof longitude === 'number'
    && Number.isFinite(latitude) && Number.isFinite(longitude)
    && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180;
};

/** Fails closed: unusable coordinate, missing/unparseable/future timestamp or age over 24 h -> nothing. */
export function freshLastKnownLocation<C>(location: C | null, updatedAt: unknown, nowMs: number):
  { lastKnownLocation: C | null; lastKnownLocationUpdatedAt: string | null } {
  const stamp = typeof updatedAt === 'string' ? Date.parse(updatedAt) : NaN;
  const age = nowMs - stamp;
  if (!isUsableCoordinate(location) || !Number.isFinite(age) || age < 0 || age > LAST_KNOWN_LOCATION_MAX_AGE_MS) {
    return { lastKnownLocation: null, lastKnownLocationUpdatedAt: null };
  }
  return { lastKnownLocation: location, lastKnownLocationUpdatedAt: updatedAt as string };
}

/**
 * Keeps entries searched within 30 days (max 10), newest first as given. `times` maps place id -> epoch ms.
 * An entry with no stamp (blob written before #145) starts its clock now; a non-numeric stamp drops it, a future stamp is clamped to now.
 */
export function pruneRecentSearches<P extends { id: string }>(places: P[], times: unknown, nowMs: number):
  { recentSearches: P[]; recentSearchTimes: Record<string, number> } {
  const stamps = times && typeof times === 'object' && !Array.isArray(times) ? (times as Record<string, unknown>) : {};
  const recentSearches: P[] = [];
  const recentSearchTimes: Record<string, number> = {};
  for (const place of places) {
    if (recentSearches.length >= MAX_RECENT_SEARCHES) break;
    const stamp = Object.prototype.hasOwnProperty.call(stamps, place.id) ? stamps[place.id] : nowMs;
    if (typeof stamp !== 'number' || !Number.isFinite(stamp)) continue;
    // A stamp from the future means the device clock moved back: keep the entry and restart its clock
    // rather than wiping the list (unlike a saved location, a search is not sensitive enough to fail closed on).
    const kept = Math.min(stamp, nowMs);
    if (nowMs - kept > RECENT_SEARCH_MAX_AGE_MS) continue;
    recentSearches.push(place);
    recentSearchTimes[place.id] = kept;
  }
  return { recentSearches, recentSearchTimes };
}

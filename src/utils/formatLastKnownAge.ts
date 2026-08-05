/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export function formatLastKnownAge(timestamp: string | null): string {
  if (!timestamp) return 'from an earlier session';
  const ageMs = Date.now() - new Date(timestamp).getTime();
  if (!Number.isFinite(ageMs) || ageMs < 0) return 'from an earlier session';
  const minutes = Math.max(1, Math.round(ageMs / 60_000));
  if (minutes < 60) return `from ${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.round(minutes / 60);
  return `from ${hours} hour${hours === 1 ? '' : 's'} ago`;
}

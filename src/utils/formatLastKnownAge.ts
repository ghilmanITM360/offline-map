/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { t, tn } from '../services/serviceI18n';

/**
 * How old a remembered location is, as a phrase that completes a sentence ("Using your location from 2 minutes
 * ago."). The catalog owns the wording and the plural form in each language.
 */
export function formatLastKnownAge(timestamp: string | null): string {
  if (!timestamp) return t('navigation.ageEarlierSession');
  const ageMs = Date.now() - new Date(timestamp).getTime();
  if (!Number.isFinite(ageMs) || ageMs < 0) return t('navigation.ageEarlierSession');
  const minutes = Math.max(1, Math.round(ageMs / 60_000));
  if (minutes < 60) return tn('navigation.ageMinutes', minutes);
  const hours = Math.round(minutes / 60);
  return tn('navigation.ageHours', hours);
}

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { t } from '../i18n/translate';

export function formatLastKnownAge(timestamp: string | null): string {
  if (!timestamp) return t('places.earlierSession');
  const ageMs = Date.now() - new Date(timestamp).getTime();
  if (!Number.isFinite(ageMs) || ageMs < 0) return t('places.earlierSession');
  const minutes = Math.max(1, Math.round(ageMs / 60_000));
  if (minutes < 60) return t(minutes === 1 ? 'places.minute_one' : 'places.minute_other', { count: minutes });
  const hours = Math.round(minutes / 60);
  return t(hours === 1 ? 'places.hour_one' : 'places.hour_other', { count: hours });
}

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { t } from '../i18n';
import { tIn } from '../services/serviceI18n';

/** English reference wording; what is shown follows the chosen language (see announce). */
export const ROUTE_UPDATED_MESSAGE = tIn('en', 'navigation.routeUpdated');
export const ROUTE_UPDATED_VISIBLE_MS = 4000;

/**
 * Says "Route updated" for a few seconds after a reroute is accepted, through the navigation chrome's existing
 * live-region status slot. A long route's new geometry can land outside the navigation camera, so the user
 * otherwise has no sign that anything changed. Clears only its own message, so a newer status is never erased.
 */
export function useRouteUpdatedNotice(setMessage: (update: (previous: string | null) => string | null) => void) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancel = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);
  useEffect(() => cancel, [cancel]);
  const announce = useCallback(() => {
    cancel();
    const message = t('navigation.routeUpdated');
    setMessage(() => message);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      setMessage((previous) => (previous === message ? null : previous));
    }, ROUTE_UPDATED_VISIBLE_MS);
  }, [cancel, setMessage]);
  // Stable identity: callers list it in hook dependencies and must not be re-created on every render.
  return useMemo(() => ({ announce, cancel }), [announce, cancel]);
}

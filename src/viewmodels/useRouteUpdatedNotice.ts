/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { MessageKey } from '../i18n/messages';
import { t, translate } from '../i18n/translate';
import type { TParams } from '../i18n/translate';
import type { Locale } from '../i18n/types';

/** Generated status retains meaning; provider prose retains its original text. */
export type NavigationStatusCopy = string | { key: MessageKey; params?: TParams } | null;

export function resolveNavigationStatus(copy: NavigationStatusCopy, locale: Locale): string | null {
  return typeof copy === 'object' && copy !== null ? translate(locale, copy.key, copy.params) : copy;
}

export const ROUTE_UPDATED_MESSAGE = () => t('journeyCopy.updated');
export const ROUTE_UPDATED_VISIBLE_MS = 4000;

/** Locale changes only project copy. The original announcement identity and deadline stay intact. */
export function useRouteUpdatedNotice(setMessage: Dispatch<SetStateAction<NavigationStatusCopy>>) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancel = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);
  useEffect(() => cancel, [cancel]);
  const announce = useCallback(() => {
    cancel();
    const notice = { key: 'journeyCopy.updated' } as const;
    setMessage(notice);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      setMessage(previous => previous === notice ? null : previous);
    }, ROUTE_UPDATED_VISIBLE_MS);
  }, [cancel, setMessage]);
  return useMemo(() => ({ announce, cancel }), [announce, cancel]);
}

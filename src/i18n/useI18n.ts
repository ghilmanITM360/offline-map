/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useMemo } from 'react';
import { useLocaleStore } from './localeStore';
import type { MessageKey } from './messages';
import { pluralKey, translate, TParams } from './translate';
import { LOCALES } from './types';

/** Components read copy and direction through this hook so they re-render the moment the language changes. */
export function useI18n() {
  const locale = useLocaleStore((s) => s.locale);
  const setLocale = useLocaleStore((s) => s.setLocale);
  const t = useCallback((key: MessageKey, params?: TParams) => translate(locale, key, params), [locale]);
  const tn = useCallback(
    (key: string, count: number, params?: TParams) => translate(locale, pluralKey(key, count), { count, ...params }),
    [locale],
  );
  const dir = LOCALES[locale].dir;
  return useMemo(() => ({ t, tn, locale, setLocale, dir, isRTL: dir === 'rtl' }), [t, tn, locale, setLocale, dir]);
}

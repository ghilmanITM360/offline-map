/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { getLocale } from './localeStore';
import { messages, MessageKey } from './messages';
import { LOCALES, Locale } from './types';

export type TParams = Record<string, string | number>;

/** First-strong isolate: keeps Latin names, numbers and distances readable inside Urdu-script sentences. */
const FSI = '⁨';
const PDI = '⁩';

function fill(template: string, params: TParams | undefined, rtl: boolean): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (whole, name: string) => {
    if (!(name in params)) return whole;
    const value = String(params[name]);
    return rtl ? `${FSI}${value}${PDI}` : value;
  });
}

/** Counts take one of two forms in all three languages. */
export function pluralKey(key: string, count: number): string {
  return `${key}_${count === 1 ? 'one' : 'other'}`;
}

/** Translate for a given locale. Falls back to English only if a key is somehow absent (the completeness test forbids it). */
export function translate(locale: Locale, key: string, params?: TParams): string {
  const table = messages[locale] as Record<string, string>;
  const template = table[key] ?? (messages.en as Record<string, string>)[key] ?? key;
  return fill(template, params, LOCALES[locale].dir === 'rtl');
}

/** Translate in the current language. Use useI18n() inside components so they re-render when the language changes. */
export function t(key: MessageKey, params?: TParams): string {
  return translate(getLocale(), key, params);
}

/** Translate a counted message: tn('x.items', 3, { extra }) reads x.items_other with {count} = 3. */
export function tn(key: string, count: number, params?: TParams): string {
  return translate(getLocale(), pluralKey(key, count), { count, ...params });
}

export const isRtl = (locale: Locale = getLocale()): boolean => LOCALES[locale].dir === 'rtl';

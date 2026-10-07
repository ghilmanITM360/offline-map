/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/** The three app languages. Roman Urdu is Urdu written in Latin script (LTR); Urdu is Urdu script (RTL). */
export type Locale = 'en' | 'ur-Latn' | 'ur';

export const LOCALE_CODES: readonly Locale[] = ['en', 'ur-Latn', 'ur'];

export interface LocaleMeta {
  /** Name of the language in its own script. Autonyms are never translated, so a person can always find theirs. */
  autonym: string;
  dir: 'ltr' | 'rtl';
}

export const LOCALES: Record<Locale, LocaleMeta> = {
  en: { autonym: 'English', dir: 'ltr' },
  'ur-Latn': { autonym: 'Roman Urdu', dir: 'ltr' },
  ur: { autonym: 'اردو', dir: 'rtl' },
};

/** One area's copy in every language. TypeScript rejects a locale that lacks a key another locale has. */
export type MessageSet<K extends string> = Record<Locale, Record<K, string>>;

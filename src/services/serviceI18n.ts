/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { messages } from '../i18n/messages';
import type { MessageKey } from '../i18n/messages';
import { LOCALES } from '../i18n/types';
import type { Locale } from '../i18n/types';

/**
 * Copy for services and view models that also run in the plain-Node routing scripts (npm run test:*-v2).
 * Those scripts cannot load React Native, and the locale store (and the venue-name seam, which reads it) imports it.
 * So the store is read lazily: in the app and in Jest it is the real chosen language, in a script it is English.
 * Wording, placeholders and plurals are exactly those of src/i18n/translate.ts.
 */
type Params = Record<string, string | number>;

let readLocale: () => Locale = () => 'en';
let localizeName: (name: string, locale: Locale) => string = (name) => name;
try {
  readLocale = require('../i18n/localeStore').getLocale;
} catch {
  /* plain Node: English */
}
try {
  localizeName = require('../i18n/venueNames').localizeVenueName;
} catch {
  /* plain Node: names stay as the dataset spells them */
}

export const getLocale = (): Locale => readLocale();

// First-strong isolates keep Latin names and numbers readable inside Urdu-script sentences (see translate.ts).
const FSI = '⁨';
const PDI = '⁩';

/** translate() with typo-checked keys, for a locale chosen by the caller (instructions also keep an Urdu copy). */
export function tIn(locale: Locale, key: MessageKey | string, params?: Params): string {
  const table = messages[locale] as Record<string, string>;
  const template = table[key] ?? (messages.en as Record<string, string>)[key] ?? key;
  if (!params) return template;
  const rtl = LOCALES[locale].dir === 'rtl';
  return template.replace(/\{(\w+)\}/g, (whole, name: string) => {
    if (!(name in params)) return whole;
    const value = String(params[name]);
    return rtl ? `${FSI}${value}${PDI}` : value;
  });
}

export const t = (key: MessageKey, params?: Params): string => tIn(getLocale(), key, params);

/** Counted message: reads `<key>_one` / `<key>_other` with {count} filled in. */
export const tn = (key: string, count: number, params?: Params): string =>
  tIn(getLocale(), `${key}_${count === 1 ? 'one' : 'other'}`, { count, ...params });

/**
 * A venue name in `locale`. While the places catalog has no entry, Urdu and Roman Urdu fall back to the dataset's
 * own spellings, so Urdu text never prints a Latin gate or block label.
 */
export function venueName(
  name: { en: string; ur?: string; romanUrdu?: string } | string,
  locale: Locale = getLocale(),
): string {
  const en = typeof name === 'string' ? name : name.en;
  const localized = localizeName(en, locale);
  if (typeof name === 'string' || localized !== en) return localized;
  if (locale === 'ur') return name.ur ?? localized;
  if (locale === 'ur-Latn') return name.romanUrdu ?? localized;
  return localized;
}

/** One instruction sentence in the current language (`text`) and in Urdu (`urduText`). */
export const bothLocales = (build: (locale: Locale) => string): { text: string; urduText: string } => ({
  text: build(getLocale()),
  urduText: build('ur'),
});

/** The text-to-speech language that matches the written language. Roman Urdu is read by the English voice. */
export const speechLanguage = (): 'en' | 'ur' => (getLocale() === 'ur' ? 'ur' : 'en');

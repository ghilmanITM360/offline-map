/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { LOCALE_CODES, LOCALES } from '../i18n/types';
import { MESSAGE_AREAS, messages } from '../i18n/messages';
import { pluralKey, translate } from '../i18n/translate';
import { useLocaleStore } from '../i18n';

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
const enKeys = Object.keys(messages.en);

describe('localization completeness (en, ur-Latn, ur)', () => {
  test('exactly three languages: English and Roman Urdu are LTR, Urdu is RTL', () => {
    expect(LOCALE_CODES).toEqual(['en', 'ur-Latn', 'ur']);
    expect(LOCALES.en.dir).toBe('ltr');
    expect(LOCALES['ur-Latn'].dir).toBe('ltr');
    expect(LOCALES.ur.dir).toBe('rtl');
  });

  test('no key is defined in two areas', () => {
    const seen = new Map<string, string>();
    const dupes: string[] = [];
    for (const [area, set] of Object.entries(MESSAGE_AREAS)) {
      for (const key of Object.keys(set.en)) {
        if (seen.has(key)) dupes.push(`${key} (${seen.get(key)} and ${area})`);
        seen.set(key, area);
      }
    }
    expect(dupes).toEqual([]);
  });

  test.each(LOCALE_CODES)('%s has every key, no extras, and no empty text', (locale) => {
    const keys = Object.keys(messages[locale]);
    expect(enKeys.filter((k) => !keys.includes(k))).toEqual([]);
    expect(keys.filter((k) => !enKeys.includes(k))).toEqual([]);
    expect(keys.filter((k) => !messages[locale][k as keyof typeof messages.en].trim())).toEqual([]);
  });

  test.each(LOCALE_CODES)('%s uses the same {placeholders} as English in every message', (locale) => {
    const bad = enKeys.filter((k) => {
      const key = k as keyof typeof messages.en;
      return placeholders(messages[locale][key]).join() !== placeholders(messages.en[key]).join();
    });
    expect(bad).toEqual([]);
  });

  test('every counted message has both forms in every language', () => {
    for (const locale of LOCALE_CODES) {
      const keys = Object.keys(messages[locale]);
      for (const k of keys.filter((x) => x.endsWith('_one'))) expect(keys).toContain(k.replace(/_one$/, '_other'));
      for (const k of keys.filter((x) => x.endsWith('_other'))) expect(keys).toContain(k.replace(/_other$/, '_one'));
    }
  });

  test('Roman Urdu is Latin script and Urdu is Arabic script', () => {
    const arabic = /[؀-ۿ]/;
    for (const k of enKeys) {
      const key = k as keyof typeof messages.en;
      expect(arabic.test(messages['ur-Latn'][key])).toBe(false);
      // Urdu text may only keep Latin for placeholders, digits and proper names; it must contain Urdu script.
      expect(arabic.test(messages.ur[key])).toBe(true);
    }
  });
});

describe('translate()', () => {
  test('fills placeholders, and isolates them in Urdu so Latin names and numbers stay readable', () => {
    const table = messages as unknown as Record<string, Record<string, string>>;
    table.en['test.hello'] = 'Hello {name}';
    table.ur['test.hello'] = 'سلام {name}';
    expect(translate('en', 'test.hello', { name: 'Gate 14' })).toBe('Hello Gate 14');
    expect(translate('ur', 'test.hello', { name: 'Gate 14' })).toBe('سلام ⁨Gate 14⁩');
    delete table.en['test.hello'];
    delete table.ur['test.hello'];
  });

  test('plural keys and locale switching', () => {
    expect(pluralKey('x.items', 1)).toBe('x.items_one');
    expect(pluralKey('x.items', 0)).toBe('x.items_other');
    useLocaleStore.setState({ locale: 'ur' });
    expect(useLocaleStore.getState().locale).toBe('ur');
    useLocaleStore.getState().setLocale('bogus' as never);
    expect(useLocaleStore.getState().locale).toBe('en');
  });
});

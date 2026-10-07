/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { LOCALE_CODES, Locale } from './types';

// ponytail: react-native and AsyncStorage are required lazily so the plain-Node script suites (tsx, no React Native
// runtime) can import services that use t(). In Node there is no storage and the phone locale is unknown: English.
function lazyStorage() {
  return {
    getItem: (key: string) => {
      try { const m = require('@react-native-async-storage/async-storage'); return (m.default ?? m).getItem(key); } catch { return null; }
    },
    setItem: (key: string, value: string) => {
      try { const m = require('@react-native-async-storage/async-storage'); return (m.default ?? m).setItem(key, value); } catch { return undefined; }
    },
    removeItem: (key: string) => {
      try { const m = require('@react-native-async-storage/async-storage'); return (m.default ?? m).removeItem(key); } catch { return undefined; }
    },
  };
}

/** First launch: follow the phone's language when it is Urdu, otherwise English. The person can change it in Settings. */
export function deviceDefaultLocale(): Locale {
  try {
    const { I18nManager } = require('react-native');
    const id = String(I18nManager.getConstants?.().localeIdentifier ?? '');
    return /^ur(?![a-z])/i.test(id) ? 'ur' : 'en';
  } catch {
    return 'en';
  }
}

interface LocaleState {
  locale: Locale;
  setLocale: (locale: Locale) => void;
}

/** The chosen app language, kept on this device. Small and separate so changing it never touches journey state. */
export const useLocaleStore = create<LocaleState>()(
  persist(
    (set) => ({
      locale: deviceDefaultLocale(),
      setLocale: (locale) => set({ locale: LOCALE_CODES.includes(locale) ? locale : 'en' }),
    }),
    {
      name: 'ijtema-locale-v1',
      storage: createJSONStorage(lazyStorage),
      partialize: (s) => ({ locale: s.locale }),
      merge: (persisted, current) => {
        const stored = (persisted as Partial<LocaleState> | undefined)?.locale;
        return { ...current, locale: stored && LOCALE_CODES.includes(stored) ? stored : current.locale };
      },
    },
  ),
);

export const getLocale = (): Locale => useLocaleStore.getState().locale;

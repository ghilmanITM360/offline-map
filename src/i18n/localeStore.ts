/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { I18nManager } from 'react-native';
import { LOCALE_CODES, Locale } from './types';

/** First launch: follow the phone's language when it is Urdu, otherwise English. The person can change it in Settings. */
export function deviceDefaultLocale(): Locale {
  try {
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
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ locale: s.locale }),
      merge: (persisted, current) => {
        const stored = (persisted as Partial<LocaleState> | undefined)?.locale;
        return { ...current, locale: stored && LOCALE_CODES.includes(stored) ? stored : current.locale };
      },
    },
  ),
);

export const getLocale = (): Locale => useLocaleStore.getState().locale;

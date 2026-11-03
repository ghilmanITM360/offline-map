import { ENGLISH_NAVIGATION_SCREEN_COPY, type NavigationScreenCopy } from '@muslim-ummah/offline-navigation/ui';
import { TRANSLATION_TABLE, type TranslationEntry } from './translationTable';

// The screen's wording per language. English is the SDK's own. Urdu and Roman Urdu come from the generated table, which is complete but DRAFT
// (see docs/sdk/client/TRANSLATION_REVIEW.md): PENDING NATIVE REVIEW. A key the table lacks, or an empty entry, stays English: a screen never shows a blank.

export type Language = 'en' | 'ur' | 'ur-Latn';

export const LANGUAGES: readonly { id: Language; autonym: string; rtl: boolean }[] = [
  { id: 'en', autonym: 'English', rtl: false },
  { id: 'ur', autonym: 'اردو', rtl: true },
  { id: 'ur-Latn', autonym: 'Roman Urdu', rtl: false },
];

export const isRTLLanguage = (language: Language): boolean => LANGUAGES.find((l) => l.id === language)?.rtl ?? false;

const fill = (template: string, args: readonly unknown[]): string => template.replace(/\{(\d+)\}/g, (_, i: string) => String(args[Number(i)] ?? ''));

// Plain objects and arrays are copied; functions and strings are kept, so the result can be edited without touching the SDK's copy.
const clone = <T,>(value: T): T => {
  if (typeof value !== 'object' || value === null) return value;
  return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, clone(v)])) as T;
};

/** The screen copy for `language` from `table`: English everywhere the table has no usable text. Exported for tests and for hosts with their own table. */
export function buildCopy(language: Language, table: readonly Pick<TranslationEntry, 'key' | 'ur' | 'urLatn'>[] = TRANSLATION_TABLE): NavigationScreenCopy {
  if (language === 'en') return ENGLISH_NAVIGATION_SCREEN_COPY;
  const copy = clone(ENGLISH_NAVIGATION_SCREEN_COPY);
  for (const entry of table) {
    const text: unknown = language === 'ur' ? entry.ur : entry.urLatn;
    if (typeof text !== 'string' || text.trim() === '') continue;
    const path = entry.key.split('.');
    let parent = copy as unknown as Record<string, unknown>;
    for (const part of path.slice(0, -1)) {
      const next = parent[part];
      if (typeof next !== 'object' || next === null) { parent = {}; break; } // a key the screen does not have: ignore, never throw
      parent = next as Record<string, unknown>;
    }
    const last = path[path.length - 1];
    if (!(last in parent)) continue;
    parent[last] = typeof parent[last] === 'function' ? (...args: unknown[]) => fill(text, args) : text;
  }
  return copy;
}

const cache = new Map<Language, NavigationScreenCopy>();

export function copyFor(language: Language): NavigationScreenCopy {
  const cached = cache.get(language);
  if (cached) return cached;
  const copy = buildCopy(language);
  cache.set(language, copy);
  return copy;
}

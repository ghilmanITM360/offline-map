import { ENGLISH_NAVIGATION_SCREEN_COPY, type NavigationScreenCopy } from '@muslim-ummah/offline-navigation/ui';
import { TRANSLATION_TABLE } from './translationTable';

// The screen's wording per language. English is the SDK's own. Urdu and Roman Urdu are ONLY the host-shipped wording in the generated table
// (see docs/sdk/client/TRANSLATION_REVIEW.md): every string without reviewed wording stays English instead of being invented. PENDING OWNER REVIEW.

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

const cache = new Map<Language, NavigationScreenCopy>();

export function copyFor(language: Language): NavigationScreenCopy {
  if (language === 'en') return ENGLISH_NAVIGATION_SCREEN_COPY;
  const cached = cache.get(language);
  if (cached) return cached;
  const copy = clone(ENGLISH_NAVIGATION_SCREEN_COPY);
  for (const entry of TRANSLATION_TABLE) {
    const text = language === 'ur' ? entry.ur : entry.urLatn;
    if (text === undefined) continue;
    const path = entry.key.split('.');
    let parent = copy as unknown as Record<string, unknown>;
    for (const part of path.slice(0, -1)) parent = parent[part] as Record<string, unknown>;
    const last = path[path.length - 1];
    parent[last] = typeof parent[last] === 'function' ? (...args: unknown[]) => fill(text, args) : text;
  }
  cache.set(language, copy);
  return copy;
}

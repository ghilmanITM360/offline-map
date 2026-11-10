/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// The directory's text filter, free of React so it can be tested and measured headlessly. It folds text with the catalog's own
// `searchKey`, so the ready-made screen and the headless catalog search agree on what matches.

import { searchKey } from '../domain/catalog/PlaceCatalog';

export interface SearchablePlaceItem {
  title: string;
  subtitle?: string;
  searchTerms?: readonly string[];
}

/** Case, width, composition, punctuation and Arabic-script-variant insensitive text for matching; never changes what is displayed. */
export function normalizeSearchText(text: string): string {
  return searchKey(text);
}

// Folded once per item object, not once per keystroke: the screen keeps the same item objects while the user types.
const folded = new WeakMap<object, { keys: string[]; haystack: string }>();
const fold = (item: SearchablePlaceItem): { keys: string[]; haystack: string } => {
  let entry = folded.get(item);
  if (!entry) {
    const keys = [item.title, item.subtitle ?? '', ...(item.searchTerms ?? [])].map(searchKey).filter(Boolean);
    entry = { keys, haystack: keys.join(' ') };
    folded.set(item, entry);
  }
  return entry;
};

/**
 * Every word the user typed must appear somewhere in the place's title, subtitle or search terms. A place one of whose names is exactly
 * what was typed comes first ("Block 2" before "Block 21"); otherwise the given order is kept.
 */
export function filterPlaceItems<T extends SearchablePlaceItem>(items: readonly T[], query: string): T[] {
  const whole = searchKey(query);
  if (whole === '') return [...items];
  const words = whole.split(' ');
  const exact: T[] = [];
  const rest: T[] = [];
  for (const item of items) {
    const { keys, haystack } = fold(item);
    if (!words.every((word) => haystack.includes(word))) continue;
    (keys.includes(whole) ? exact : rest).push(item);
  }
  return exact.concat(rest);
}

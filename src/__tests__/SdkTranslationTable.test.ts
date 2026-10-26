/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// The consumer's Urdu / Roman Urdu wording is never written here: it is host-shipped text, copied unchanged, listed for the owner to review.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ENGLISH_NAVIGATION_SCREEN_COPY } from '@muslim-ummah/offline-navigation/ui';
import { messages } from '../i18n/messages';
import { buildTable, renderReview, renderTable } from '../../scripts/sdk-i18n/generate';
import { TRANSLATION_TABLE } from '../../examples/expo-consumer/copy/translationTable';

const ROOT = join(__dirname, '../..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

const keys = (node: unknown, path = ''): string[] =>
  Object.entries(node as Record<string, unknown>).flatMap(([k, v]) => {
    const key = path ? `${path}.${k}` : k;
    return typeof v === 'string' || typeof v === 'function' ? [key] : v && typeof v === 'object' ? keys(v, key) : [];
  });

describe('consumer translation table', () => {
  it('covers exactly the screen copy: no stale key, no missing key', () => {
    expect(TRANSLATION_TABLE.map((e) => e.key).sort()).toEqual(keys(ENGLISH_NAVIGATION_SCREEN_COPY).sort());
  });

  it('is what the generator produces now, so the committed table and review document cannot drift or be edited by hand', () => {
    const table = buildTable();
    expect(read('examples/expo-consumer/copy/translationTable.ts')).toBe(renderTable(table));
    expect(read('docs/sdk/client/TRANSLATION_REVIEW.md')).toBe(renderReview(table));
  });

  it('carries host-shipped wording only, unchanged apart from positional placeholders', () => {
    const translated = TRANSLATION_TABLE.filter((e) => e.ur !== undefined);
    expect(translated.length).toBeGreaterThan(20);
    for (const e of translated) {
      const key = e.source!.replace(/^host:/, '');
      const host = { ur: (messages.ur as Record<string, string>)[key], urLatn: (messages['ur-Latn'] as Record<string, string>)[key] };
      expect(host.ur).toBeTruthy();
      const strip = (text: string) => text.replace(/\{[a-zA-Z0-9]+\}/g, '{}');
      expect(strip(e.ur!)).toBe(strip(host.ur));
      expect(strip(e.urLatn!)).toBe(strip(host.urLatn));
      // Same number of placeholders as the English it replaces: nothing dropped, nothing added.
      const count = (text: string) => (text.match(/\{\d+\}/g) ?? []).length;
      expect(count(e.ur!)).toBe(count(e.en));
      expect(count(e.urLatn!)).toBe(count(e.en));
    }
  });

  it('says plainly that none of it is approved', () => {
    expect(read('docs/sdk/client/TRANSLATION_REVIEW.md')).toMatch(/PENDING OWNER REVIEW/);
    expect(read('examples/expo-consumer/copy/translationTable.ts')).toMatch(/PENDING OWNER REVIEW/);
  });
});

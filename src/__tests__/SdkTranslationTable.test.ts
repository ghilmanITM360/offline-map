/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// The consumer's Urdu / Roman Urdu tables are complete DRAFTS (host-shipped wording where it exists, SDK-team draft otherwise), still pending native
// review. These checks keep them structurally sound: every key, intact placeholders, the right script, no empty text, and a safe fallback.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ENGLISH_NAVIGATION_SCREEN_COPY } from '@muslim-ummah/offline-navigation/ui';
import { messages } from '../i18n/messages';
import { buildTable, renderReview, renderTable } from '../../scripts/sdk-i18n/generate';
import { TRANSLATION_TABLE } from '../../examples/expo-consumer/copy/translationTable';
import { buildCopy, copyFor } from '../../examples/expo-consumer/copy';
import { DRAFT_WORDING } from '../../scripts/sdk-i18n/draft';

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

  const placeholders = (text: string) => (text.match(/\{\d+\}/g) ?? []).sort();
  const withoutPlaceholders = (text: string) => text.replace(/\{\d+\}/g, '');

  it('has Urdu and Roman Urdu text for all 113 keys (the original 89, 21 catalog and availability strings, 3 provisional-arrival strings): nothing is left to fall back to English', () => {
    expect(TRANSLATION_TABLE).toHaveLength(113);
    expect(TRANSLATION_TABLE.filter((e) => e.source.startsWith('host:'))).toHaveLength(28);
    expect(TRANSLATION_TABLE.filter((e) => e.source === 'draft')).toHaveLength(85);
    for (const e of TRANSLATION_TABLE) {
      expect(typeof e.ur).toBe('string');
      expect(typeof e.urLatn).toBe('string');
      expect(e.ur.trim()).not.toBe('');
      expect(e.urLatn.trim()).not.toBe('');
    }
  });

  it('keeps exactly the English placeholders in both languages (none dropped, none added, none renamed)', () => {
    for (const e of TRANSLATION_TABLE) {
      expect({ key: e.key, ur: placeholders(e.ur) }).toEqual({ key: e.key, ur: placeholders(e.en) });
      expect({ key: e.key, urLatn: placeholders(e.urLatn) }).toEqual({ key: e.key, urLatn: placeholders(e.en) });
      for (const text of [e.ur, e.urLatn]) expect(text).not.toMatch(/\{[^0-9}]|\{\}|\}\{/); // no named or malformed placeholder
    }
  });

  it('writes Urdu in Arabic script and Roman Urdu in Latin script only', () => {
    for (const e of TRANSLATION_TABLE) {
      expect({ key: e.key, ok: /[\u0600-\u06FF]/.test(withoutPlaceholders(e.ur)) }).toEqual({ key: e.key, ok: true });
      expect({ key: e.key, latin: /[A-Za-z]/.test(withoutPlaceholders(e.ur)) }).toEqual({ key: e.key, latin: false });
      expect({ key: e.key, arabic: /[\u0600-\u06FF]/.test(e.urLatn) }).toEqual({ key: e.key, arabic: false });
    }
  });

  it('draft wording covers exactly the strings the host has no wording for', () => {
    expect(Object.keys(DRAFT_WORDING).sort()).toEqual(TRANSLATION_TABLE.filter((e) => e.source === 'draft').map((e) => e.key).sort());
    for (const e of TRANSLATION_TABLE.filter((x) => x.source === 'draft')) expect({ ur: e.ur, urLatn: e.urLatn }).toEqual(DRAFT_WORDING[e.key]);
  });

  it('carries host-shipped wording unchanged apart from positional placeholders', () => {
    for (const e of TRANSLATION_TABLE.filter((x) => x.source.startsWith('host:'))) {
      const key = e.source.replace(/^host:/, '');
      const host = { ur: (messages.ur as Record<string, string>)[key], urLatn: (messages['ur-Latn'] as Record<string, string>)[key] };
      expect(host.ur).toBeTruthy();
      const strip = (text: string) => text.replace(/\{[a-zA-Z0-9]+\}/g, '{}');
      expect(strip(e.ur)).toBe(strip(host.ur));
      expect(strip(e.urLatn)).toBe(strip(host.urLatn));
    }
  });

  it('fills every function-valued string with its real arguments in both languages', () => {
    const ur = copyFor('ur') as any;
    const lat = copyFor('ur-Latn') as any;
    expect(ur.routeStep.arrive('هال')).toBe('آپ هال پہنچ گئے ہیں');
    expect(lat.routeStep.arrive('Hall')).toBe('Aap Hall pahunch gaye hain');
    expect(lat.guide.stepCount(2, 5)).toBe('Qadam 2 az 5');
    expect(lat.live.remaining('120 meter', 3)).toBe('120 meter baqi · taqreeban 3 minute');
    expect(lat.guide.stepSummary('A', 'B', 'C')).toBe('A. B. C');
    expect(lat.directory.noMatches('xyz')).toBe('"xyz" se koi jagah nahin milti.');
    for (const e of TRANSLATION_TABLE) {
      const path = e.key.split('.').reduce((n: any, part) => n[part], ENGLISH_NAVIGATION_SCREEN_COPY as any);
      if (typeof path !== 'function') continue;
      const args = Array.from({ length: path.length }, (_, i) => `<${i}>`);
      const filled = e.key.split('.').reduce((n: any, part) => n[part], lat)(...args);
      expect(filled).toBe(e.urLatn.replace(/\{(\d+)\}/g, (_, i) => `<${i}>`));
    }
  });

  it('falls back to English for a missing key, an empty or non-string entry and a key the screen does not have, and never throws', () => {
    const table = [
      { key: 'trip.retry', ur: '', urLatn: '   ' },
      { key: 'guide.next', ur: undefined as unknown as string, urLatn: 42 as unknown as string },
      { key: 'no.such.key', ur: 'x', urLatn: 'x' },
      { key: 'live.exit', ur: 'ختم', urLatn: 'Khatam' },
    ];
    const ur = buildCopy('ur', table) as any;
    expect(ur.trip.retry).toBe(ENGLISH_NAVIGATION_SCREEN_COPY.trip.retry);
    expect(ur.guide.next).toBe(ENGLISH_NAVIGATION_SCREEN_COPY.guide.next);
    expect(ur.live.exit).toBe('ختم');
    expect(ur.arrival.title).toBe(ENGLISH_NAVIGATION_SCREEN_COPY.arrival.title); // key absent from the table
    expect((buildCopy('ur-Latn', table) as any).live.exit).toBe('Khatam');
    expect(buildCopy('en', table)).toBe(ENGLISH_NAVIGATION_SCREEN_COPY);
  });

  it('says plainly that none of it is approved', () => {
    expect(read('docs/sdk/client/TRANSLATION_REVIEW.md')).toMatch(/PENDING OWNER \/ NATIVE-SPEAKER REVIEW/);
    expect(read('examples/expo-consumer/copy/translationTable.ts')).toMatch(/PENDING OWNER REVIEW/);
  });
});

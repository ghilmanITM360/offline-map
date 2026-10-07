/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs';
import { BASELINE_FILE, scanAll } from '../../scripts/hardcoded-strings';

/**
 * Ratchet: user-visible text belongs in src/i18n/messages, never inline. The baseline lists how much inline text
 * each file still has; a file may only go down. When a file reaches 0 its baseline entry is removed
 * (node --import tsx scripts/hardcoded-strings.ts --write), and from then on any new inline text fails here.
 */
describe('no new hardcoded user-visible strings outside the localization catalogs', () => {
  const baseline: Record<string, number> = JSON.parse(fs.readFileSync(BASELINE_FILE, 'utf8'));
  const found = scanAll();

  test('the scan sees real code (guards against matching nothing)', () => {
    expect(Object.keys(found).length + Object.keys(baseline).length).toBeGreaterThan(0);
  });

  test('no file has more inline text than its baseline', () => {
    const over = Object.entries(found)
      .filter(([file, strings]) => strings.length > (baseline[file] ?? 0))
      .map(([file, strings]) => `${file}: ${strings.length} > ${baseline[file] ?? 0}\n    ${strings.join('\n    ')}`);
    expect(over).toEqual([]);
  });

  test('the baseline is tight: lower it when strings are moved into the catalogs', () => {
    const stale = Object.entries(baseline)
      .filter(([file, n]) => (found[file]?.length ?? 0) < n)
      .map(([file, n]) => `${file}: baseline ${n}, found ${found[file]?.length ?? 0}`);
    expect(stale).toEqual([]);
  });
});

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { BASELINE_FILE, findHardcodedStrings, scanAll } from '../../scripts/hardcoded-strings';

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

describe('hardcoded-string scanner coverage', () => {
  let root: string;
  beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'hardcoded-strings-')); });
  afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });

  function fixture(relative: string, source: string): string {
    const file = path.join(root, relative);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, source);
    return file;
  }

  test('ignores conditional non-copy props but detects rendered and accessible text', () => {
    const file = fixture('Example.tsx', `<>
      <Button variant={selected ? 'secondary' : 'outline'} />
      <View accessibilityLiveRegion={lost ? 'assertive' : 'polite'} />
      <Text>{active ? 'On' : 'Off'}</Text>
      <Button accessibilityLabel={active ? 'Start' : 'Stop'} />
    </>`);
    expect(findHardcodedStrings(file)).toEqual(['On', 'Off', 'Start', 'Stop']);
  });

  test('new SDK UI copy exceeds the zero baseline while host keys stay stable', () => {
    fixture('src/Host.tsx', '<Text>Host</Text>');
    fixture('packages/offline-navigation/src/ui/GateChooser.tsx', '<Text>Continue</Text>');
    const found = scanAll(root);
    expect(found['Host.tsx']).toEqual(['Host']);
    const sdkKey = 'packages/offline-navigation/src/ui/GateChooser.tsx';
    expect(found[sdkKey]).toEqual(['Continue']);
    const baseline: Record<string, number> = {};
    expect(found[sdkKey].length).toBeGreaterThan(baseline[sdkKey] ?? 0);
  });
});

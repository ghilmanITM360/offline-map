/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// #140: offline = venue core; third-party imagery is optional online context. No UI copy may promise
// downloaded/offline imagery while release builds cannot download any (docs/OFFLINE_NAVIGATION_AND_ROUTING.md).

import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : /\.(tsx?)$/.test(name) ? [p] : [];
  });

const OVERCLAIMS = [
  /downloaded satellite tiles/i,
  /offline satellite tiles/i,
  /Download map data before/i,
  /'Use offline maps'/,
];

describe('#140 user-facing copy does not promise offline imagery', () => {
  const files = ['views', 'viewmodels', 'navigation'].flatMap((d) => walk(join(__dirname, '..', d)));

  it.each(OVERCLAIMS.map((re) => [String(re), re] as const))('no UI source contains %s', (_label, re) => {
    expect(files.filter((f) => re.test(readFileSync(f, 'utf8')))).toEqual([]);
  });
});

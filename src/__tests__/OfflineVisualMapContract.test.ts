/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// #140 (owner decision 2026-10-05): the visual map ships with the app and works with no internet. No UI copy may claim a
// map must be downloaded or that imagery needs internet, and no download/setup screen may come back
// (docs/OFFLINE_NAVIGATION_AND_ROUTING.md).

import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : /\.(tsx?)$/.test(name) ? [p] : [];
  });

const STALE_CLAIMS = [
  /Download map data before/i,
  /'Use offline maps'/,
  /Map isn.t downloaded/i,
  /Background map not downloaded/i,
  /Download background map/i,
  /imagery needs internet/i,
  /Satellite imagery requires internet/i,
  /satellite background needs internet/i,
  /Use Venue Map Only/i,
  /Map setup/i,
];

describe('#140 user-facing copy matches the bundled offline map', () => {
  const files = ['views', 'viewmodels', 'navigation', 'utils'].flatMap((d) => walk(join(__dirname, '..', d)));

  it.each(STALE_CLAIMS.map((re) => [String(re), re] as const))('no UI source contains %s', (_label, re) => {
    expect(files.filter((f) => re.test(readFileSync(f, 'utf8')))).toEqual([]);
  });

  it('the Download Map screen and its services are gone', () => {
    for (const gone of ['views/screens/DownloadMapScreen.tsx', 'viewmodels/DownloadMapViewModel.ts', 'services/OfflineMapService.ts', 'services/OfflineMapStatusService.ts']) {
      expect(existsSync(join(__dirname, '..', gone))).toBe(false);
    }
  });
});

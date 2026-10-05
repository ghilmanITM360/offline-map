/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { readFileSync } from 'fs';
import { join } from 'path';

// #222 plain-language rules: what an attendee sees must say what happened without software words (imagery, key, tile).
describe('#222 plain-language map messages', () => {
  it('the Settings satellite alert does not show a technical key title', () => {
    const settings = readFileSync(join(__dirname, '..', 'views', 'screens', 'SettingsScreen.tsx'), 'utf8');
    expect(settings).not.toContain('Map key not configured');
  });
});

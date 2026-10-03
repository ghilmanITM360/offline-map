/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { GOOGLE_MAPS_KEY_NOT_CONFIGURED_MESSAGE, GOOGLE_MAPS_LOAD_FAILED_MESSAGE } from '../services/MapConfigResolver';

// #222 plain-language rules: the map-status messages an attendee sees must say what happened and that routes
// still work, without software words (imagery, key, venue data).
const jargon = /imagery|venue data|\bkey\b|tile|sdk|api/i;

describe('#222 plain-language map messages', () => {
  it.each([
    ['missing map background', GOOGLE_MAPS_KEY_NOT_CONFIGURED_MESSAGE],
    ['map background failed to load', GOOGLE_MAPS_LOAD_FAILED_MESSAGE],
  ])('%s reads in plain words and keeps routes reassuring', (_label, message) => {
    expect(message).not.toMatch(jargon);
    expect(message).toMatch(/Ijtema routes still work\.$/);
    expect(message.length).toBeLessThanOrEqual(60);
  });

  it('the Settings satellite alert does not show a technical key title', () => {
    const settings = readFileSync(join(__dirname, '..', 'views', 'screens', 'SettingsScreen.tsx'), 'utf8');
    expect(settings).not.toContain('Map key not configured');
  });
});

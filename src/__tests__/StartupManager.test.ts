/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { StartupManager } from '../services/StartupManager';

// Location is optional (#307): it improves live guidance, never gates browsing or the route guide, so the
// launch decision depends only on whether the Welcome screen was seen. Permission is asked in context.
describe('StartupManager.resolve', () => {
  it('sends first-time users to Welcome', () => {
    expect(StartupManager.resolve({ hasSeenWelcome: false })).toEqual({ phase: 'first_install', route: 'Welcome' });
  });

  it('sends every onboarded user straight to the Locations Directory, whatever the location permission', () => {
    expect(StartupManager.resolve({ hasSeenWelcome: true })).toEqual({ phase: 'ready', route: 'LocationsDirectory' });
  });

  it('never resolves to a Permission or DownloadMap route', () => {
    const routes = [StartupManager.resolve({ hasSeenWelcome: false }), StartupManager.resolve({ hasSeenWelcome: true })]
      .map((r) => r.route as string);
    expect(routes).not.toContain('Permission');
    expect(routes).not.toContain('DownloadMap');
  });
});

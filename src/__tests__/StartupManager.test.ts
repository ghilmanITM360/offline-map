/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { StartupManager, StartupChecks } from '../services/StartupManager';

const base: StartupChecks = {
  hasSeenWelcome: true,
  permissionGranted: true,
  skippedLocationPermission: false,
};

describe('StartupManager.resolve', () => {
  it('sends first-time users to Welcome', () => {
    expect(StartupManager.resolve({ ...base, hasSeenWelcome: false })).toEqual({
      phase: 'first_install',
      route: 'Welcome',
    });
  });

  it('sends users without location permission to Permission', () => {
    expect(StartupManager.resolve({ ...base, permissionGranted: false })).toEqual({
      phase: 'first_install',
      route: 'Permission',
    });
  });

  it('bypasses Permission for a returning user who already chose Continue Without Location', () => {
    expect(
      StartupManager.resolve({ ...base, permissionGranted: false, skippedLocationPermission: true }),
    ).toEqual({ phase: 'ready', route: 'LocationsDirectory' });
  });

  // #140: the basemap ships inside the app — there is no map download/setup step, whatever the connectivity.
  it('sends every onboarded user straight to the Locations Directory (no map-setup route exists)', () => {
    expect(StartupManager.resolve(base)).toEqual({ phase: 'ready', route: 'LocationsDirectory' });
    expect(StartupManager.resolve({ ...base, permissionGranted: false, skippedLocationPermission: true })).toEqual({
      phase: 'ready',
      route: 'LocationsDirectory',
    });
  });

  it('never resolves to a DownloadMap route', () => {
    const routes = [
      StartupManager.resolve({ ...base, hasSeenWelcome: false }),
      StartupManager.resolve({ ...base, permissionGranted: false }),
      StartupManager.resolve(base),
    ].map((r) => r.route as string);
    expect(routes).not.toContain('DownloadMap');
  });
});

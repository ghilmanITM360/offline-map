/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { StartupManager, StartupChecks } from '../services/StartupManager';

const base: StartupChecks = {
  hasSeenWelcome: true,
  permissionGranted: true,
  skippedLocationPermission: false,
  offlineMapStatus: 'downloaded',
  graphOnlyModeEnabled: false,
  skippedOnlineModeEnabled: false,
  isConnected: true,
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
    ).toEqual({ phase: 'ready', route: 'Main' });
  });

  it('still routes a skipped-permission user through DownloadMap/graph-only precedence normally', () => {
    expect(
      StartupManager.resolve({
        ...base,
        permissionGranted: false,
        skippedLocationPermission: true,
        offlineMapStatus: 'not_downloaded',
        isConnected: true,
      }),
    ).toEqual({ phase: 'incomplete_setup', route: 'DownloadMap' });
  });

  it('sends returning users with a valid downloaded map straight to Main', () => {
    expect(StartupManager.resolve({ ...base, offlineMapStatus: 'downloaded' })).toEqual({
      phase: 'ready',
      route: 'Main',
    });
  });

  it.each(['corrupt', 'needs_update'] as const)('sends %s map status to DownloadMap', (status) => {
    expect(StartupManager.resolve({ ...base, offlineMapStatus: status })).toEqual({
      phase: 'incomplete_setup',
      route: 'DownloadMap',
    });
  });

  it('lets graph-only mode users skip straight to Main with no map', () => {
    expect(
      StartupManager.resolve({ ...base, offlineMapStatus: 'not_downloaded', graphOnlyModeEnabled: true }),
    ).toEqual({ phase: 'ready', route: 'Main' });
  });

  it('does not re-prompt a user who already skipped online mode once', () => {
    expect(
      StartupManager.resolve({ ...base, offlineMapStatus: 'not_downloaded', skippedOnlineModeEnabled: true }),
    ).toEqual({ phase: 'ready', route: 'Main' });
  });

  it('goes to Main in graph-only mode when offline and no map', () => {
    expect(
      StartupManager.resolve({ ...base, offlineMapStatus: 'not_downloaded', isConnected: false }),
    ).toEqual({ phase: 'ready', route: 'Main' });
  });

  it('sends connected users with no map and no prior choice to DownloadMap', () => {
    expect(StartupManager.resolve({ ...base, offlineMapStatus: 'not_downloaded' })).toEqual({
      phase: 'incomplete_setup',
      route: 'DownloadMap',
    });
  });

  it('sends an in-progress download back to DownloadMap to resume', () => {
    expect(StartupManager.resolve({ ...base, offlineMapStatus: 'downloading' })).toEqual({
      phase: 'incomplete_setup',
      route: 'DownloadMap',
    });
  });

  it('prioritizes Welcome over every other check', () => {
    expect(
      StartupManager.resolve({
        ...base,
        hasSeenWelcome: false,
        permissionGranted: false,
        offlineMapStatus: 'corrupt',
      }),
    ).toEqual({ phase: 'first_install', route: 'Welcome' });
  });
});

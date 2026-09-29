/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render, screen } from './test-utils';

import { DownloadMapScreen } from '../views/screens/DownloadMapScreen';
import { useDownloadMapViewModel } from '../viewmodels/DownloadMapViewModel';
import { useAppStore } from '../store/useAppStore';

const mockNavigation = { canGoBack: () => false, goBack: jest.fn(), navigate: jest.fn(), replace: jest.fn(), reset: jest.fn() };
jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  return { ...actual, useNavigation: () => mockNavigation };
});

jest.mock('../services/OfflineMapStatusService', () => ({
  OfflineMapStatusService: {
    validateAtStartup: jest.fn(() => Promise.resolve({ manifest: null })),
    getExpectedTileCount: jest.fn(() => 100),
  },
}));

jest.mock('../viewmodels/DownloadMapViewModel', () => ({
  useDownloadMapViewModel: jest.fn(),
}));

const mockedUseDownloadMapViewModel = useDownloadMapViewModel as jest.Mock;
const initialStoreState = useAppStore.getState();

function baseViewModel(overrides: Record<string, unknown> = {}) {
  return {
    downloadState: { phase: 'idle', progress: 0, totalTiles: 0, errorMessage: null },
    showContinueFallback: false,
    offlineTileDownloadAvailable: true,
    startDownload: jest.fn(),
    pauseDownload: jest.fn(),
    resumeDownload: jest.fn(),
    cancelDownload: jest.fn(),
    retryDownload: jest.fn(),
    continueToMain: jest.fn(),
    continueWithVenueMapOnly: jest.fn(),
    continueWithOnlineMode: jest.fn(),
    repairDownload: jest.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  useAppStore.setState(initialStoreState, true);
});

// None of this screen's action buttons carried accessibilityRole/Label — a TalkBack
// user got either an un-announced-as-actionable text node or, in most cases, still the
// visible label read out but with no "button" affordance. Every phase's action(s) below
// are checked by role+name, matching the same fix already applied to Welcome/Permission.
describe('DownloadMapScreen — action buttons expose accessible role and name', () => {
  test('idle phase: Download Offline Map', async () => {
    mockedUseDownloadMapViewModel.mockReturnValue(baseViewModel());
    await render(<DownloadMapScreen />);

    expect(screen.getByRole('button', { name: 'Download Offline Map' })).toBeTruthy();
  });

  test('downloading phase: Pause', async () => {
    mockedUseDownloadMapViewModel.mockReturnValue(
      baseViewModel({ downloadState: { phase: 'downloading', progress: 0.4, totalTiles: 100, errorMessage: null } }),
    );
    await render(<DownloadMapScreen />);

    expect(screen.getByRole('button', { name: 'Pause' })).toBeTruthy();
  });

  test('paused phase: Resume and Cancel', async () => {
    mockedUseDownloadMapViewModel.mockReturnValue(
      baseViewModel({ downloadState: { phase: 'paused', progress: 0.4, totalTiles: 100, errorMessage: null } }),
    );
    await render(<DownloadMapScreen />);

    expect(screen.getByRole('button', { name: 'Resume' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeTruthy();
  });

  test('error phase: Try Again', async () => {
    mockedUseDownloadMapViewModel.mockReturnValue(
      baseViewModel({ downloadState: { phase: 'error', progress: 0.1, totalTiles: 100, errorMessage: 'Network lost.' } }),
    );
    await render(<DownloadMapScreen />);

    expect(screen.getByRole('button', { name: 'Try Again' })).toBeTruthy();
  });

  test('corrupt map status: Repair Download', async () => {
    useAppStore.setState({ offlineMapStatus: 'corrupt' });
    mockedUseDownloadMapViewModel.mockReturnValue(baseViewModel());
    await render(<DownloadMapScreen />);

    expect(screen.getByRole('button', { name: 'Repair Download' })).toBeTruthy();
  });

  test('showContinueFallback: Continue to Map', async () => {
    mockedUseDownloadMapViewModel.mockReturnValue(
      baseViewModel({
        downloadState: { phase: 'complete', progress: 1, totalTiles: 100, errorMessage: null },
        showContinueFallback: true,
      }),
    );
    await render(<DownloadMapScreen />);

    expect(screen.getByRole('button', { name: 'Continue to Map' })).toBeTruthy();
  });

  test('idle phase: Use Venue Map Only', async () => {
    mockedUseDownloadMapViewModel.mockReturnValue(baseViewModel());
    await render(<DownloadMapScreen />);

    expect(screen.getByRole('button', { name: 'Use Venue Map Only' })).toBeTruthy();
  });

  test('idle phase with internet: Use Online Mode', async () => {
    useAppStore.setState({ hasInternet: true });
    mockedUseDownloadMapViewModel.mockReturnValue(baseViewModel());
    await render(<DownloadMapScreen />);

    expect(screen.getByRole('button', { name: 'Use Online Mode' })).toBeTruthy();
  });
});

// The screen used to promise a Settings download that Settings does not offer when the
// tile source is unavailable (every release build). Dialog copy must follow the flag.
describe('DownloadMapScreen — confirmation copy matches real download support', () => {
  const dialogBody = async (label: string, vm: Record<string, unknown>) => {
    useAppStore.setState({ hasInternet: true });
    mockedUseDownloadMapViewModel.mockReturnValue(baseViewModel(vm));
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    await render(<DownloadMapScreen />);
    fireEvent.press(screen.getByRole('button', { name: label }));
    const body = String(alertSpy.mock.calls[0][1]);
    alertSpy.mockRestore();
    return body;
  };

  test.each(['Use Venue Map Only', 'Use Online Mode'])('%s: no Settings promise when download is unavailable', async (label) => {
    const body = await dialogBody(label, { offlineTileDownloadAvailable: false });
    expect(body).not.toMatch(/Settings/);
    expect(body).toMatch(/without internet/);
  });

  test.each(['Use Venue Map Only', 'Use Online Mode'])('%s: keeps Settings hint when download is available', async (label) => {
    expect(await dialogBody(label, { offlineTileDownloadAvailable: true })).toMatch(/Settings/);
  });
});

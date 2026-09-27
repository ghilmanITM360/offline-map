/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Pressable, Text } from 'react-native';
import { act, fireEvent, render, screen } from './test-utils';
import { useDownloadMapViewModel } from '../viewmodels/DownloadMapViewModel';
import { useAppStore } from '../store/useAppStore';
import { OfflineMapStatusService } from '../services/OfflineMapStatusService';

jest.mock('../services/OfflineMapStatusService', () => ({
  OfflineMapStatusService: {
    validateAtStartup: jest.fn(),
    getExpectedTileCount: jest.fn(() => 100),
  },
}));

function Probe({ navigation }: { navigation: any }) {
  const { showContinueFallback, continueToMain } = useDownloadMapViewModel();
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="complete"
        onPress={() => useAppStore.getState().setDownloadState({ phase: 'complete', progress: 1 })}
      />
      <Pressable accessibilityRole="button" accessibilityLabel="continue" onPress={() => { void continueToMain(navigation); }} />
      {showContinueFallback ? <Text>FALLBACK_SHOWN</Text> : null}
    </>
  );
}

const initialStoreState = useAppStore.getState();

// #153 Finding 4 — see DownloadMapViewModelRedirectFallback.test.tsx for why this scenario
// lives in its own file rather than a second test alongside the others.
test('#153 Finding 4: does not arm the fallback once continueToMain has already navigated away', async () => {
  useAppStore.setState(initialStoreState, true);
  jest.useFakeTimers();
  (OfflineMapStatusService.validateAtStartup as jest.Mock).mockResolvedValue({ status: 'downloaded' });
  const navigation = { reset: jest.fn() };
  try {
    await render(<Probe navigation={navigation} />);

    fireEvent.press(screen.getByLabelText('complete'));
    await act(async () => {
      fireEvent.press(screen.getByLabelText('continue'));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(navigation.reset).toHaveBeenCalled();

    await act(async () => {
      await jest.advanceTimersByTimeAsync(2600);
    });
    expect(screen.queryByText('FALLBACK_SHOWN')).not.toBeOnTheScreen();
  } finally {
    jest.useRealTimers();
  }
});

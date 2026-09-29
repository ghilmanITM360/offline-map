/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Pressable, Text } from 'react-native';
import { act, fireEvent, render, screen, waitFor } from './test-utils';
import { useDownloadMapViewModel } from '../viewmodels/DownloadMapViewModel';
import { useAppStore } from '../store/useAppStore';

jest.mock('../services/OfflineMapStatusService', () => ({
  OfflineMapStatusService: {
    validateAtStartup: jest.fn(),
    getExpectedTileCount: jest.fn(() => 100),
  },
}));

function Probe() {
  const { showContinueFallback } = useDownloadMapViewModel();
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="complete"
        onPress={() => useAppStore.getState().setDownloadState({ phase: 'complete', progress: 1 })}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="idle"
        onPress={() => useAppStore.getState().setDownloadState({ phase: 'idle', progress: 0 })}
      />
      {showContinueFallback ? <Text>FALLBACK_SHOWN</Text> : null}
    </>
  );
}

const initialStoreState = useAppStore.getState();

// #153 Finding 4 — see DownloadMapViewModelRedirectFallback.test.tsx for why this scenario
// lives in its own file rather than a second test alongside the others.
test('#153 Finding 4: resets the fallback once the phase leaves complete', async () => {
  useAppStore.setState(initialStoreState, true);
  jest.useFakeTimers();
  try {
    await render(<Probe />);

    fireEvent.press(screen.getByLabelText('complete'));
    await act(async () => {
      await jest.advanceTimersByTimeAsync(2600);
    });
    expect(screen.getByText('FALLBACK_SHOWN')).toBeOnTheScreen();

    fireEvent.press(screen.getByLabelText('idle'));
    await waitFor(() => {
      expect(screen.queryByText('FALLBACK_SHOWN')).not.toBeOnTheScreen();
    });
  } finally {
    jest.useRealTimers();
  }
});

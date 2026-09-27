/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Pressable, Text } from 'react-native';
import { act, fireEvent, render, screen } from './test-utils';
import { useDownloadMapViewModel } from '../viewmodels/DownloadMapViewModel';
import { useAppStore } from '../store/useAppStore';

jest.mock('../services/OfflineMapStatusService', () => ({
  OfflineMapStatusService: {
    validateAtStartup: jest.fn(),
    getExpectedTileCount: jest.fn(() => 100),
  },
}));

// Minimal probe so timer-driven state updates go through a real component render, driven
// by fireEvent (a real synthetic event dispatch) rather than poking the zustand store
// directly from the test body — matching how the rest of this codebase's fake-timer
// tests observe effect state (see NavigationChromeV2.test.tsx / HomeScreenColdLaunchCamera.test.tsx).
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

// #153 Finding 4: DownloadMapScreen used to run its own independent 2600ms fallback timer,
// uncoordinated with this hook's own auto-redirect timer. Now this hook is the single
// source of truth for showContinueFallback, gated on whether the auto-redirect already
// navigated away. Each scenario below is deliberately its own top-level test so jest's
// per-file isolation gives each a clean React/timer environment — chaining these in one
// file surfaced a flaky cross-test act()/fake-timer interaction unrelated to this logic.
test('#153 Finding 4: arms the fallback ~2600ms after completion when nothing has navigated away', async () => {
  useAppStore.setState(initialStoreState, true);
  jest.useFakeTimers();
  try {
    await render(<Probe navigation={{ reset: jest.fn() }} />);

    fireEvent.press(screen.getByLabelText('complete'));
    expect(screen.queryByText('FALLBACK_SHOWN')).not.toBeOnTheScreen();

    await act(async () => {
      await jest.advanceTimersByTimeAsync(2600);
    });
    expect(screen.getByText('FALLBACK_SHOWN')).toBeOnTheScreen();
  } finally {
    jest.useRealTimers();
  }
});

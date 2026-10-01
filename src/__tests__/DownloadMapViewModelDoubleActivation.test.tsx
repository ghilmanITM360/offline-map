/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Pressable } from 'react-native';
import { act, fireEvent, render, screen } from './test-utils';
import { useDownloadMapViewModel } from '../viewmodels/DownloadMapViewModel';

jest.mock('../services/OfflineMapStatusService', () => ({
  OfflineMapStatusService: {
    validateAtStartup: jest.fn(),
    getExpectedTileCount: jest.fn(() => 100),
    setDownloadedFlag: jest.fn().mockResolvedValue(undefined),
    setGraphOnlyMode: jest.fn().mockResolvedValue(undefined),
    setSkippedOnlineMode: jest.fn().mockResolvedValue(undefined),
  },
}));

function Probe({ navigation }: { navigation: any }) {
  const { continueWithVenueMapOnly } = useDownloadMapViewModel();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel="continue" onPress={() => { void continueWithVenueMapOnly(navigation); }} />
  );
}

// #208 S16: two quick taps on the only action ran the navigation reset twice. On a release build the second reset
// unmounted Home's MapView while its label projection was pending and the screen went blank.
test('a double tap navigates to Main exactly once', async () => {
  const navigation = { reset: jest.fn() };
  await render(<Probe navigation={navigation} />);

  await act(async () => {
    fireEvent.press(screen.getByLabelText('continue'));
    fireEvent.press(screen.getByLabelText('continue'));
    for (let i = 0; i < 10; i += 1) await Promise.resolve();
  });

  expect(navigation.reset).toHaveBeenCalledTimes(1);
});

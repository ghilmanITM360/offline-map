/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render, screen } from './test-utils';

import { Alert } from 'react-native';
import { fireEvent } from '@testing-library/react-native';
import { SettingsScreen } from '../views/screens/SettingsScreen';
import { useAppStore } from '../store/useAppStore';

const mockNavigation = { canGoBack: () => true, goBack: jest.fn(), navigate: jest.fn() };
jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  return { ...actual, useNavigation: () => mockNavigation };
});

jest.mock('expo-location', () => ({
  getForegroundPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  requestForegroundPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  hasServicesEnabledAsync: jest.fn().mockResolvedValue(true),
  PermissionStatus: { GRANTED: 'granted', DENIED: 'denied', UNDETERMINED: 'undetermined' },
}));

describe('SettingsScreen — accessibility and copy (#155)', () => {
  test('a toggle row exposes switch semantics with no redundant inner announcement', async () => {
    await render(<SettingsScreen />);

    const row = screen.getByRole(
      'switch',
      { name: /North-up Map, Map always points north instead of turning to match your walking direction/ },
    );
    expect(row.props.accessibilityState).toMatchObject({ checked: expect.any(Boolean) });
    expect(screen.queryAllByRole('switch', { name: /North-up Map/ })).toHaveLength(1);
  });

  test('does not use "heading-up rotation" jargon', async () => {
    await render(<SettingsScreen />);

    expect(screen.queryByText(/heading-up rotation/i)).not.toBeOnTheScreen();
  });
});

describe('SettingsScreen — targeted privacy clears (#145)', () => {
  test('Clear Recent Searches asks first, then clears only recents', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    useAppStore.setState({ recentSearches: [{ id: 'B1' } as never], recentSearchTimes: { B1: Date.now() }, favorites: [{ placeId: 'B1' } as never] });
    await render(<SettingsScreen />);

    fireEvent.press(screen.getByRole('button', { name: /Clear Recent Searches/ }));
    expect(useAppStore.getState().recentSearches).toHaveLength(1);
    const buttons = alert.mock.calls[0][2] as { text: string; onPress?: () => void }[];
    buttons.find((b) => b.text === 'Clear')!.onPress!();

    expect(useAppStore.getState().recentSearches).toEqual([]);
    expect(useAppStore.getState().favorites).toHaveLength(1);
    alert.mockRestore();
  });
});

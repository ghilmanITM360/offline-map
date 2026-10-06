/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Settings keeps only what an attendee can meaningfully use. Each removal is backed by the code, not taste:
// - Voice Language: the spoken text is English, so "Urdu" only made an Urdu-locale voice read English words.
// - North-up Map: the map's own compass button already toggles it (HomeViewModel.handleCompassToggle).
// - Auto-follow Location: camera behaviour, not a preference (it only moves the map while browsing).
// - Fix my route automatically: always on, throttled by a 25 s cooldown (REROUTE_COOLDOWN_MS); off just stranded people.
// - Walking Speed: the default 1.4 m/s matched the preset called "Fast", so a default user saw "Fast".

import React from 'react';
import { Alert } from 'react-native';
import { act, render, screen } from './test-utils';
import { fireEvent } from '@testing-library/react-native';
import * as Location from 'expo-location';

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

const mockedPermission = Location.getForegroundPermissionsAsync as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  mockedPermission.mockResolvedValue({ status: 'granted' });
});

describe('Settings — only meaningful rows remain', () => {
  test.each(['Voice Language', 'Auto-follow Location', 'North-up Map', 'Fix my route automatically', 'Walking Speed'])(
    '%s is no longer a setting',
    async (label) => {
      await render(<SettingsScreen />);
      expect(screen.queryByText(label)).not.toBeOnTheScreen();
    },
  );

  test.each(['Voice Instructions', 'Distance Unit', 'Clear Recent Searches', 'Clear Saved Location', 'App Guide', 'About Ijtema Map'])(
    '%s stays',
    async (label) => {
      await render(<SettingsScreen />);
      expect(screen.getByText(label)).toBeOnTheScreen();
    },
  );

  test('Voice Instructions is a switch that carries its own state', async () => {
    await render(<SettingsScreen />);
    const row = screen.getByRole('switch', { name: /Voice Instructions, Speaks each turn aloud/ });
    expect(row.props.accessibilityState).toMatchObject({ checked: expect.any(Boolean) });
  });
});

describe('Settings — Location', () => {
  test('says Off once, plainly, with one Manage action', async () => {
    mockedPermission.mockResolvedValue({ status: 'denied', canAskAgain: true });
    await render(<SettingsScreen />);

    const row = await screen.findByRole('button', { name: 'Location, Off. Used for live guidance.' });
    expect(row).toBeOnTheScreen();
    expect(screen.getByText('Manage')).toBeOnTheScreen();
    expect(screen.queryByText(/Not allowed|Location Permission|Tap to allow/)).not.toBeOnTheScreen();
  });

  test('says On when location is allowed', async () => {
    await render(<SettingsScreen />);
    expect(await screen.findByRole('button', { name: 'Location, On. Used for live guidance.' })).toBeOnTheScreen();
  });
});

describe('Settings — Privacy and Help wording', () => {
  test('the journey reminder is "Clear unfinished journey"', async () => {
    await render(<SettingsScreen />);
    expect(screen.getByRole('button', { name: 'Clear unfinished journey, Removes the reminder for your last unfinished route.' })).toBeOnTheScreen();
    expect(screen.queryByText(/Navigation Recovery|Unfinished Trip/)).not.toBeOnTheScreen();
  });

  test('App Guide is described in plain words', async () => {
    await render(<SettingsScreen />);
    expect(screen.getByRole('button', { name: 'App Guide, Learn how to find places and follow directions.' })).toBeOnTheScreen();
  });
});

describe('Settings — Developer Mode is invisible in a release build', () => {
  const g = globalThis as unknown as { __DEV__: boolean };
  const original = g.__DEV__;
  afterEach(() => { g.__DEV__ = original; });

  test('no row, and tapping the version seven times does nothing', async () => {
    g.__DEV__ = false;
    useAppStore.setState({ developerModeEnabled: false });
    await render(<SettingsScreen />);

    expect(screen.queryByText('Developer Mode')).not.toBeOnTheScreen();
    for (let i = 0; i < 7; i += 1) {
      await act(async () => { fireEvent.press(screen.getByText('Version 1.0.0')); });
    }
    expect(useAppStore.getState().developerModeEnabled).toBe(false);
  });

  test('in a development build seven taps still toggle it (guards the test above against passing vacuously)', async () => {
    g.__DEV__ = true;
    useAppStore.setState({ developerModeEnabled: false });
    await render(<SettingsScreen />);

    for (let i = 0; i < 7; i += 1) {
      await act(async () => { fireEvent.press(screen.getByText('Version 1.0.0')); });
    }
    expect(useAppStore.getState().developerModeEnabled).toBe(true);
  });

  test('in a development build the row is there', async () => {
    g.__DEV__ = true;
    await render(<SettingsScreen />);
    expect(screen.getByText('Developer Mode')).toBeOnTheScreen();
  });
});

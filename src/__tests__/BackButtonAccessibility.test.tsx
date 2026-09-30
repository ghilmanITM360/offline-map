/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { fireEvent, render, screen } from './test-utils';

import { AboutScreen } from '../views/screens/AboutScreen';
import { HelpScreen } from '../views/screens/HelpScreen';
import { SettingsScreen } from '../views/screens/SettingsScreen';

const mockNavigation = { canGoBack: () => true, goBack: jest.fn(), navigate: jest.fn() };
jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  return { ...actual, useNavigation: () => mockNavigation };
});
jest.mock('expo-location', () => ({
  getForegroundPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  requestForegroundPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  hasServicesEnabledAsync: jest.fn().mockResolvedValue(true),
}));

beforeEach(() => jest.clearAllMocks());

// The header back control is an icon-only Pressable. AppGuide already names it and widens its hit area;
// Help, About and Settings did neither, so TalkBack saw an unnamed control inside a ~36dp target.
describe('#128: icon-only header back buttons are named and meet the touch target', () => {
  const screens: [string, React.ReactElement][] = [
    ['HelpScreen', <HelpScreen />],
    ['AboutScreen', <AboutScreen />],
    ['SettingsScreen', <SettingsScreen />],
  ];

  test.each(screens)('%s back button has a button role, the name "Back" and a widened hit area', async (_name, ui) => {
    await render(ui);

    const back = screen.getByRole('button', { name: 'Back' });
    expect(back.props.hitSlop).toBe(12);

    fireEvent.press(back);
    expect(mockNavigation.goBack).toHaveBeenCalledTimes(1);
  });
});

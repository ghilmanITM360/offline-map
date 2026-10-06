/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// 200% font acceptance: the drawer title ("Ijtema Map") ran past the drawer's edge because its text column could not
// shrink. Entries: the drawer is Find a place / Settings / Help only.

import React from 'react';
import { StyleSheet } from 'react-native';
import { render, screen } from './test-utils';

import { CustomDrawer } from '../views/components/CustomDrawer';

jest.mock('@react-navigation/drawer', () => {
  const { ScrollView } = jest.requireActual('react-native');
  return { DrawerContentScrollView: ScrollView };
});

const renderDrawer = () => render(<CustomDrawer {...({ navigation: { navigate: jest.fn() } } as never)} />);

describe('CustomDrawer at large text', () => {
  test('the header text column can shrink and wrap instead of overflowing the drawer', async () => {
    await renderDrawer();
    const column = screen.getByText('Ijtema Map').parent!;
    expect(StyleSheet.flatten(column.props.style).flex).toBe(1);
  });

  test('lists only the three real destinations, with Help named plainly', async () => {
    await renderDrawer();
    expect(screen.getAllByRole('button').map((b) => b.props.accessibilityLabel)).toEqual(['Find a place', 'Settings', 'Help']);
    // Home was only the plain map (one tap on the scrim away); About and the version now live in Settings.
    for (const gone of ['Home', 'Help & Feedback', 'About Ijtema Map', 'Version 1.0.0']) {
      expect(screen.queryByText(gone)).not.toBeOnTheScreen();
    }
  });
});

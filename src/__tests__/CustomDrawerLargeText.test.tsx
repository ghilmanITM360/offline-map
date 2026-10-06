/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// 200% font acceptance: the drawer title ("Ijtema Map") ran past the drawer's edge because its text column could not
// shrink, and the version footer sat under the system navigation bar.

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

  test('the version footer clears the system navigation bar', async () => {
    await renderDrawer();
    const footer = screen.getByText('Version 1.0.0').parent!;
    // test-utils reports a 34 dp bottom inset
    expect(StyleSheet.flatten(footer.props.style).paddingBottom).toBeGreaterThanOrEqual(20 + 34);
  });
});

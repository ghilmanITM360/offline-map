/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { StyleSheet } from 'react-native';
import { act, render, screen, userEvent } from './test-utils';
import { useLocaleStore } from '../i18n/localeStore';
import { translate } from '../i18n/translate';
import { MapTopBar } from '../views/components/map/MapTopBar';

// #307: the Directory is the one place chooser, so the Map needs a plain way back to it that is always visible,
// and the menu (Settings, Help, About) must not be the only door to it.
describe('MapTopBar', () => {
  test('offers Places (back to the Directory) and the menu as named buttons', async () => {
    const onPlaces = jest.fn();
    const onMore = jest.fn();
    await render(<MapTopBar title={null} onPlaces={onPlaces} onMore={onMore} />);

    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Places' }));
    await user.press(screen.getByRole('button', { name: 'Open menu' }));

    expect(onPlaces).toHaveBeenCalledTimes(1);
    expect(onMore).toHaveBeenCalledTimes(1);
  });

  test('shows the context title for sighted users only when there is one, hidden from screen readers (the sheet names it)', async () => {
    const { rerender } = await render(<MapTopBar title="Block 2" onPlaces={jest.fn()} onMore={jest.fn()} />);
    expect(screen.getByText('Block 2', { includeHiddenElements: true })).toBeOnTheScreen();
    expect(screen.queryByText('Block 2')).not.toBeOnTheScreen(); // not in the accessibility tree

    await rerender(<MapTopBar title={null} onPlaces={jest.fn()} onMore={jest.fn()} />);
    expect(screen.queryByText('Block 2', { includeHiddenElements: true })).not.toBeOnTheScreen();
  });

  test('every control meets the 48 dp minimum touch target', async () => {
    await render(<MapTopBar title="Block 2" onPlaces={jest.fn()} onMore={jest.fn()} />);
    for (const name of ['Places', 'Open menu']) {
      const style = StyleSheet.flatten(screen.getByRole('button', { name }).props.style);
      expect(style.minHeight).toBeGreaterThanOrEqual(48);
      expect(style.minWidth).toBeGreaterThanOrEqual(48);
    }
  });

  test('has no place search or browse control: the Directory owns choosing a place', async () => {
    await render(<MapTopBar title={null} onPlaces={jest.fn()} onMore={jest.fn()} />);
    expect(screen.queryByLabelText('Search destinations')).not.toBeOnTheScreen();
    expect(screen.queryByText('All Locations')).not.toBeOnTheScreen();
  });
});

test('updates map control names when the locale changes while mounted', async () => {
  await render(<MapTopBar title="Gate 12" onPlaces={jest.fn()} onMore={jest.fn()} />);
  for (const locale of ['ur-Latn', 'ur', 'en']) {
    await act(async () => useLocaleStore.getState().setLocale(locale));
    expect(screen.getByRole('button', { name: translate(locale, 'journeyControls.places') })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: translate(locale, 'journeyControls.menu') })).toBeOnTheScreen();
  }
});

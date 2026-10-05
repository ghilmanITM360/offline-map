/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render, screen, userEvent } from './test-utils';

import { AppGuideScreen } from '../views/screens/AppGuideScreen';

const mockNavigation = { canGoBack: () => true, goBack: jest.fn(), navigate: jest.fn() };
jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  return { ...actual, useNavigation: () => mockNavigation };
});

describe('AppGuideScreen — accessibility', () => {
  // Every other back button in this codebase (LocationSheet, PlaceSection's details
  // back) carries hitSlop + accessibilityRole + accessibilityLabel — this one had none,
  // so a TalkBack user landing on it heard an unlabeled icon-only control.
  test('back button exposes an accessible button role and name', async () => {
    await render(<AppGuideScreen />);

    expect(screen.getByRole('button', { name: 'Back' })).toBeTruthy();
  });

  test('pressing back invokes navigation.goBack', async () => {
    const user = userEvent.setup();
    await render(<AppGuideScreen />);

    await user.press(screen.getByRole('button', { name: 'Back' }));

    expect(mockNavigation.goBack).toHaveBeenCalled();
  });
});

describe('AppGuideScreen — start-selection wording (#222)', () => {
  // The Directory is the single start chooser; the guide must name the FROM row,
  // not the removed "Choose start manually" card.
  test('explains the FROM row and no longer mentions the removed manual-start card', async () => {
    await render(<AppGuideScreen />);

    expect(screen.getAllByText(/FROM row/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/Choose start manually/)).toBeNull();
    expect(screen.queryByText(/manual start/i)).toBeNull();
  });
});

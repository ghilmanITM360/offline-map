/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render, screen } from './test-utils';

import { HelpScreen } from '../views/screens/HelpScreen';

const mockNavigation = { canGoBack: () => true, goBack: jest.fn(), navigate: jest.fn() };
jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  return { ...actual, useNavigation: () => mockNavigation };
});

describe('HelpScreen — accessibility and copy (#155)', () => {
  test('help rows expose an accessible button role and name', async () => {
    await render(<HelpScreen />);

    const row = screen.getByRole('button', { name: 'How to use offline maps?, Learn what remains available without internet.' });
    expect(row).toBeTruthy();
  });

  test('the contact row sets correct expectations instead of promising in-app feedback submission', async () => {
    await render(<HelpScreen />);

    expect(screen.queryByText('Send Feedback')).not.toBeOnTheScreen();
    expect(screen.getByText('Contact Us')).toBeOnTheScreen();
  });
});

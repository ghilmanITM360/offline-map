/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render, screen } from './test-utils';

import { AboutScreen } from '../views/screens/AboutScreen';

const mockNavigation = { canGoBack: () => true, goBack: jest.fn(), navigate: jest.fn() };
jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  return { ...actual, useNavigation: () => mockNavigation };
});

describe('AboutScreen — accessibility and copy (#155)', () => {
  test('legal links expose an accessible button role and name', async () => {
    await render(<AboutScreen />);

    expect(screen.getByRole('button', { name: 'Privacy Policy' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Terms of Service' })).toBeTruthy();
  });

  test('does not overclaim bilingual support beyond what the app actually delivers', async () => {
    await render(<AboutScreen />);

    expect(screen.queryByText('Urdu & English Language Support')).not.toBeOnTheScreen();
  });
});

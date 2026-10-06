/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { act, fireEvent, render, screen } from './test-utils';

import { WelcomeScreen } from '../views/screens/WelcomeScreen';

const mockNavigation = { canGoBack: () => false, goBack: jest.fn(), navigate: jest.fn(), replace: jest.fn() };
let mockRouteParams: { onboardingStatusReadFailed?: boolean } | undefined;
jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  return { ...actual, useNavigation: () => mockNavigation, useRoute: () => ({ params: mockRouteParams }) };
});

jest.mock('../services/OnboardingStatusService', () => ({
  OnboardingStatusService: { setHasSeenWelcome: jest.fn().mockResolvedValue(undefined) },
}));

beforeEach(() => {
  mockRouteParams = undefined;
});

describe('WelcomeScreen (#159 WEL-007)', () => {
  test('renders the bilingual title and the three benefits', async () => {
    await render(<WelcomeScreen />);

    expect(screen.getByText('Welcome to Ijtema Map')).toBeOnTheScreen();
    expect(screen.getByText('اجتماع میپ میں خوش آمدید')).toBeOnTheScreen();
    expect(screen.getByText('See where you are')).toBeOnTheScreen();
    expect(screen.getByText('Navigate to blocks and gates')).toBeOnTheScreen();
    expect(screen.queryByText(/offline|internet/i)).not.toBeOnTheScreen();
    expect(screen.getByText('Get walking directions')).toBeOnTheScreen();
  });

  test('#307: says plainly that location is optional and is asked for later, when it helps', async () => {
    await render(<WelcomeScreen />);

    expect(screen.getByText('Location is optional. You can turn it on later.')).toBeOnTheScreen();
    expect(screen.queryByText('Find your location')).not.toBeOnTheScreen();
  });

  test('pressing Continue goes straight to the Directory (no permission step)', async () => {
    await render(<WelcomeScreen />);

    await act(async () => {
      fireEvent.press(screen.getByText('Continue'));
    });

    expect(mockNavigation.replace).toHaveBeenCalledWith('LocationsDirectory');
  });

  // The primary CTA of the first onboarding screen had no accessibilityRole/Label — a
  // TalkBack user could not identify it as an actionable button by name.
  test('Continue exposes an accessible button role and name', async () => {
    await render(<WelcomeScreen />);

    expect(screen.getByRole('button', { name: 'Continue' })).toBeTruthy();
  });

  test('#153 Finding 3: shows a brief notice when Splash could not confirm previous setup', async () => {
    mockRouteParams = { onboardingStatusReadFailed: true };
    await render(<WelcomeScreen />);

    expect(screen.getByText('Welcome back.')).toBeOnTheScreen();
  });

  test('shows no notice on a genuine first install', async () => {
    await render(<WelcomeScreen />);

    expect(screen.queryByText('Welcome back.')).not.toBeOnTheScreen();
  });
});

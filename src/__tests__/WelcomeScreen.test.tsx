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
  test('renders the bilingual title and all four benefits', async () => {
    await render(<WelcomeScreen />);

    expect(screen.getByText('Welcome to Ijtema Map')).toBeOnTheScreen();
    expect(screen.getByText('اجتماع میپ میں خوش آمدید')).toBeOnTheScreen();
    expect(screen.getByText('See where you are')).toBeOnTheScreen();
    expect(screen.getByText('Navigate to blocks and gates')).toBeOnTheScreen();
    expect(screen.getByText('Use offline maps')).toBeOnTheScreen();
    expect(screen.getByText('Get walking directions')).toBeOnTheScreen();
  });

  test('WEL-006: no benefit repeats the Permission screen heading one tap later', async () => {
    await render(<WelcomeScreen />);

    expect(screen.queryByText('Find your location')).not.toBeOnTheScreen();
  });

  test('pressing Continue replaces onto Permission', async () => {
    await render(<WelcomeScreen />);

    await act(async () => {
      fireEvent.press(screen.getByText('Continue'));
    });

    expect(mockNavigation.replace).toHaveBeenCalledWith('Permission');
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

    expect(screen.getByText("We couldn't confirm your previous setup, so we're showing this again.")).toBeOnTheScreen();
  });

  test('shows no notice on a genuine first install', async () => {
    await render(<WelcomeScreen />);

    expect(screen.queryByText(/couldn't confirm your previous setup/)).not.toBeOnTheScreen();
  });
});

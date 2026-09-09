/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { act, fireEvent, render, screen } from './test-utils';

import { WelcomeScreen } from '../views/screens/WelcomeScreen';
import { OnboardingStatusService } from '../services/OnboardingStatusService';

jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  return {
    ...actual,
    useNavigation: jest.fn(),
  };
});

jest.mock('../services/OnboardingStatusService', () => ({
  OnboardingStatusService: {
    setHasSeenWelcome: jest.fn(),
  },
}));

const { useNavigation } = jest.requireMock('@react-navigation/native') as { useNavigation: jest.Mock };

function mockNav() {
  const navigation = { replace: jest.fn() };
  useNavigation.mockReturnValue(navigation);
  return navigation;
}

beforeEach(() => {
  jest.clearAllMocks();
  (OnboardingStatusService.setHasSeenWelcome as jest.Mock).mockResolvedValue(undefined);
});

describe('WelcomeScreen', () => {
  test('exposes a single accessible Get Started action', async () => {
    mockNav();
    await render(<WelcomeScreen />);
    expect(screen.getByRole('button', { name: 'Get Started' })).toBeOnTheScreen();
  });

  test('Get Started records onboarding completion and hands off to Permission', async () => {
    const navigation = mockNav();
    await render(<WelcomeScreen />);

    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Get Started' }));
    });

    expect(OnboardingStatusService.setHasSeenWelcome).toHaveBeenCalledWith(true);
    expect(navigation.replace).toHaveBeenCalledWith('Permission');
  });
});

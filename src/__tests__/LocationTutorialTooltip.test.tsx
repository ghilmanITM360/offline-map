/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { AccessibilityInfo, Animated } from 'react-native';
import { act, render, screen } from './test-utils';

import { LocationTutorialTooltip } from '../views/components/map/LocationTutorialTooltip';

jest.useFakeTimers();

jest.mock('../viewmodels/useReducedMotion', () => ({ useReducedMotion: jest.fn(() => false) }));
const mockedUseReducedMotion = jest.requireMock('../viewmodels/useReducedMotion').useReducedMotion as jest.Mock;

describe('LocationTutorialTooltip — accessibility (Batch A)', () => {
  afterEach(() => {
    mockedUseReducedMotion.mockReturnValue(false);
    jest.restoreAllMocks();
  });

  test('announces itself once for screen-reader users, since the tooltip is otherwise silent pointerEvents="none" text', async () => {
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
    announce.mockClear();

    await render(<LocationTutorialTooltip onDismiss={jest.fn()} bottomOffset={100} />);

    expect(announce).toHaveBeenCalledTimes(1);
    expect(announce).toHaveBeenCalledWith(expect.stringContaining("You're here"));
  });

  test('with Reduce Motion disabled, the entrance fade animates via Animated.timing', async () => {
    mockedUseReducedMotion.mockReturnValue(false);
    const timingSpy = jest.spyOn(Animated, 'timing');

    await render(<LocationTutorialTooltip onDismiss={jest.fn()} bottomOffset={100} />);

    expect(timingSpy).toHaveBeenCalled();
  });

  test('with Reduce Motion enabled, the entrance/exit fade is skipped entirely', async () => {
    mockedUseReducedMotion.mockReturnValue(true);
    const timingSpy = jest.spyOn(Animated, 'timing');
    const onDismiss = jest.fn();

    await render(<LocationTutorialTooltip onDismiss={onDismiss} bottomOffset={100} />);
    await act(async () => {
      jest.advanceTimersByTime(3200);
    });

    expect(timingSpy).not.toHaveBeenCalled();
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  test('still auto-dismisses via a fade-out with Reduce Motion disabled', async () => {
    mockedUseReducedMotion.mockReturnValue(false);
    const onDismiss = jest.fn();

    await render(<LocationTutorialTooltip onDismiss={onDismiss} bottomOffset={100} />);
    await act(async () => {
      jest.advanceTimersByTime(3200 + 220);
    });

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  test('renders the expected copy', async () => {
    await render(<LocationTutorialTooltip onDismiss={jest.fn()} bottomOffset={100} />);

    expect(screen.getByText("You're here")).toBeOnTheScreen();
    expect(screen.getByText('Your location is shown on the map')).toBeOnTheScreen();
  });
});

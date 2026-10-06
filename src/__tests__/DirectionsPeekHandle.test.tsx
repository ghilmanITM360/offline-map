/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// #307: a collapsed Directions sheet must never become undiscoverable. It leaves a persistent, tappable peek that
// says where the journey stands and offers the way back up, so nobody has to guess "swipe up from somewhere".

import React from 'react';
import { StyleSheet } from 'react-native';
import { act, render, screen, userEvent } from './test-utils';
import { DirectionsPeekHandle, publishDirectionsPeek } from '../views/components/map/DirectionsPeekHandle';

afterEach(() => act(() => publishDirectionsPeek(null)));

describe('DirectionsPeekHandle', () => {
  test('collapsed: shows the published line and expands the sheet when tapped', async () => {
    const onToggle = jest.fn();
    await render(<DirectionsPeekHandle />);
    await act(async () => publishDirectionsPeek({ text: '2 min · 121 m', collapsed: true, onToggle }));

    expect(screen.getByText('2 min · 121 m')).toBeOnTheScreen();
    await userEvent.setup().press(screen.getByRole('button', { name: '2 min · 121 m. Show route details' }));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  test('expanded: the same handle stays (it is never swapped) and offers to fold the sheet', async () => {
    const onToggle = jest.fn();
    await render(<DirectionsPeekHandle />);
    await act(async () => publishDirectionsPeek({ text: '2 min · 121 m', collapsed: false, onToggle }));

    await userEvent.setup().press(screen.getByRole('button', { name: '2 min · 121 m. Hide route details' }));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  test('the whole peek is a button with at least a 48 dp target', async () => {
    await render(<DirectionsPeekHandle />);
    await act(async () => publishDirectionsPeek({ text: 'Directions · Block 9 → Block 2', collapsed: true, onToggle: jest.fn() }));

    const style = StyleSheet.flatten(screen.getByRole('button', { name: /route details/ }).props.style);
    expect(style.minHeight).toBeGreaterThanOrEqual(48);
  });

  test('follows the journey: the line changes as the published state changes', async () => {
    await render(<DirectionsPeekHandle />);
    await act(async () => publishDirectionsPeek({ text: 'Next: Turn right · 40 m', collapsed: true, onToggle: jest.fn() }));
    expect(screen.getByText('Next: Turn right · 40 m')).toBeOnTheScreen();
    await act(async () => publishDirectionsPeek({ text: '2 min · 121 m', collapsed: true, onToggle: jest.fn() }));
    expect(screen.queryByText('Next: Turn right · 40 m')).not.toBeOnTheScreen();
  });

  test('with nothing published it is only the drag handle (no dead button)', async () => {
    await render(<DirectionsPeekHandle />);
    expect(screen.queryByRole('button')).not.toBeOnTheScreen();
  });
});

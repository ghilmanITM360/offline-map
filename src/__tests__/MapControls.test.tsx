/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Animated } from 'react-native';
import { render, screen, userEvent } from './test-utils';

import { MapControls } from '../views/components/map/MapControls';

jest.mock('../viewmodels/useReducedMotion', () => ({ useReducedMotion: jest.fn(() => false) }));
const mockedUseReducedMotion = jest.requireMock('../viewmodels/useReducedMotion').useReducedMotion as jest.Mock;

function baseProps(overrides: Partial<React.ComponentProps<typeof MapControls>> = {}) {
  return {
    variant: 'browse' as const,
    compassMode: 'NORTH_UP' as const,
    onLayers: jest.fn(),
    onCompassToggle: jest.fn(),
    onZoomIn: jest.fn(),
    onZoomOut: jest.fn(),
    ...overrides,
  };
}

describe('MapControls — Batch A accessibility', () => {
  test('the north-up/compass helper badge is hidden from TalkBack, since it only repeats the compass button label', async () => {
    await render(<MapControls {...baseProps()} />);

    // includeHiddenElements: the suppression itself removes the badge from the default
    // (visible-only) query tree — the same effect it has on TalkBack — so it has to be
    // opted back in here to inspect the underlying prop.
    const badge = screen.getByText('North-up', { includeHiddenElements: true });
    expect(badge.parent?.props.importantForAccessibility).toBe('no-hide-descendants');
  });

  test('compass button label changes with heading-follow state', async () => {
    const { rerender } = await render(<MapControls {...baseProps({ compassMode: 'NORTH_UP' })} />);
    expect(screen.getByLabelText(/Map is north-up/)).toBeOnTheScreen();

    await rerender(<MapControls {...baseProps({ compassMode: 'FOLLOW_HEADING' })} />);
    expect(screen.getByLabelText(/rotates with your compass heading/)).toBeOnTheScreen();
  });

  test('nav variant omits the Layers button and the helper badge', async () => {
    await render(<MapControls {...baseProps({ variant: 'nav' })} />);

    expect(screen.queryByLabelText('Map layers and filters')).toBeNull();
    expect(screen.queryByText('North-up')).toBeNull();
  });

  test('pressing zoom in/out and compass toggle invokes the right callbacks', async () => {
    const user = userEvent.setup();
    const onZoomIn = jest.fn();
    const onZoomOut = jest.fn();
    const onCompassToggle = jest.fn();
    await render(<MapControls {...baseProps({ onZoomIn, onZoomOut, onCompassToggle })} />);

    await user.press(screen.getByLabelText('Zoom in'));
    await user.press(screen.getByLabelText('Zoom out'));
    await user.press(screen.getByLabelText(/Map is north-up/));

    expect(onZoomIn).toHaveBeenCalledTimes(1);
    expect(onZoomOut).toHaveBeenCalledTimes(1);
    expect(onCompassToggle).toHaveBeenCalledTimes(1);
  });

  test('recenter button reflects state and is disabled while loading', async () => {
    const onPress = jest.fn();
    await render(<MapControls {...baseProps({ recenter: { state: 'loading', onPress } })} />);

    const recenterButton = screen.getByLabelText('Center map on my current location');
    expect(recenterButton.props.accessibilityState?.disabled ?? recenterButton.props.disabled).toBe(true);
  });

  test('recenter button announces the following state distinctly', async () => {
    await render(<MapControls {...baseProps({ recenter: { state: 'active', onPress: jest.fn() } })} />);

    expect(screen.getByLabelText(/Following my current location/)).toBeOnTheScreen();
  });

  describe('recenter success confirmation (React-Bits-inspired, Reduce Motion aware)', () => {
    afterEach(() => {
      mockedUseReducedMotion.mockReturnValue(false);
      jest.restoreAllMocks();
    });

    test('with Reduce Motion disabled, success state animates the checkmark via Animated.spring', async () => {
      mockedUseReducedMotion.mockReturnValue(false);
      const springSpy = jest.spyOn(Animated, 'spring');

      await render(<MapControls {...baseProps({ recenter: { state: 'success', onPress: jest.fn() } })} />);

      expect(springSpy).toHaveBeenCalled();
    });

    test('with Reduce Motion enabled, success state skips the animation entirely', async () => {
      mockedUseReducedMotion.mockReturnValue(true);
      const springSpy = jest.spyOn(Animated, 'spring');

      await render(<MapControls {...baseProps({ recenter: { state: 'success', onPress: jest.fn() } })} />);

      expect(springSpy).not.toHaveBeenCalled();
    });

    test('the checkmark still renders regardless of Reduce Motion', async () => {
      mockedUseReducedMotion.mockReturnValue(true);
      await render(<MapControls {...baseProps({ recenter: { state: 'success', onPress: jest.fn() } })} />);

      expect(screen.getByLabelText('Center map on my current location')).toBeOnTheScreen();
    });
  });
});

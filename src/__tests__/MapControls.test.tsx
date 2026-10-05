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
  test('normal state foregrounds only direction, recenter and one "More map controls" button', async () => {
    await render(<MapControls {...baseProps({ recenter: { state: 'idle', onPress: jest.fn() } })} />);

    expect(screen.getByLabelText('More map controls')).toBeOnTheScreen();
    expect(screen.getByLabelText(/Follow direction is off/)).toBeOnTheScreen();
    expect(screen.getByLabelText('Center map on my current location')).toBeOnTheScreen();
    expect(screen.queryByLabelText('Zoom in')).toBeNull();
    expect(screen.queryByLabelText('Zoom out')).toBeNull();
    expect(screen.queryByLabelText('Map layers and filters')).toBeNull();
    // The orientation control itself carries the state; there is no separate North-up pill.
    expect(screen.queryByText('North-up', { includeHiddenElements: true })).toBeNull();
  });

  test('More map controls reveals Layers and accessible Zoom in/out, and collapses again', async () => {
    const user = userEvent.setup();
    await render(<MapControls {...baseProps()} />);

    await user.press(screen.getByLabelText('More map controls'));
    expect(screen.getByLabelText('More map controls').props.accessibilityState).toMatchObject({ expanded: true });
    expect(screen.getByLabelText('Zoom in')).toBeOnTheScreen();
    expect(screen.getByLabelText('Zoom out')).toBeOnTheScreen();
    expect(screen.getByLabelText('Map layers and filters')).toBeOnTheScreen();

    await user.press(screen.getByLabelText('More map controls'));
    expect(screen.queryByLabelText('Zoom in')).toBeNull();
  });

  test('opening Layers closes the extras', async () => {
    const user = userEvent.setup();
    const onLayers = jest.fn();
    await render(<MapControls {...baseProps({ onLayers })} />);
    await user.press(screen.getByLabelText('More map controls'));
    await user.press(screen.getByLabelText('Map layers and filters'));
    expect(onLayers).toHaveBeenCalledTimes(1);
    expect(screen.queryByLabelText('Zoom in')).toBeNull();
  });

  test('compass button label changes with heading-follow state', async () => {
    const { rerender } = await render(<MapControls {...baseProps({ compassMode: 'NORTH_UP' })} />);
    expect(screen.getByLabelText(/Follow direction is off/)).toBeOnTheScreen();

    await rerender(<MapControls {...baseProps({ compassMode: 'FOLLOW_HEADING' })} />);
    expect(screen.getByLabelText(/Follow direction is on/)).toBeOnTheScreen();
  });

  test('the control is not called a compass, since it follows the direction of travel and not a magnetometer', async () => {
    const { rerender } = await render(<MapControls {...baseProps({ compassMode: 'NORTH_UP' })} />);
    expect(screen.queryByLabelText(/compass/i)).toBeNull();

    await rerender(<MapControls {...baseProps({ compassMode: 'FOLLOW_HEADING' })} />);
    expect(screen.queryByLabelText(/compass/i)).toBeNull();
    expect(screen.queryByText('Compass', { includeHiddenElements: true })).toBeNull();
  });

  test('nav variant never offers Layers, even under More map controls', async () => {
    const user = userEvent.setup();
    await render(<MapControls {...baseProps({ variant: 'nav' })} />);
    await user.press(screen.getByLabelText('More map controls'));

    expect(screen.queryByLabelText('Map layers and filters')).toBeNull();
    expect(screen.getByLabelText('Zoom in')).toBeOnTheScreen();
  });

  test('pressing zoom in/out and compass toggle invokes the right callbacks', async () => {
    const user = userEvent.setup();
    const onZoomIn = jest.fn();
    const onZoomOut = jest.fn();
    const onCompassToggle = jest.fn();
    await render(<MapControls {...baseProps({ onZoomIn, onZoomOut, onCompassToggle })} />);

    await user.press(screen.getByLabelText('More map controls'));
    await user.press(screen.getByLabelText('Zoom in'));
    await user.press(screen.getByLabelText('Zoom out'));
    await user.press(screen.getByLabelText(/Follow direction is off/));

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

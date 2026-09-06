/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render, screen } from './test-utils';

import { MapControls } from '../views/components/map/MapControls';

describe('MapControls — compass toggle state', () => {
  test('exposes north-up as unselected', async () => {
    await render(
      <MapControls
        variant="browse"
        compassMode="NORTH_UP"
        onCompassToggle={jest.fn()}
        onZoomIn={jest.fn()}
        onZoomOut={jest.fn()}
      />,
    );

    const compass = screen.getByRole('button', { name: /Map is north-up/ });
    expect(compass.props.accessibilityState).toMatchObject({ selected: false });
  });

  test('exposes compass-follow as selected', async () => {
    await render(
      <MapControls
        variant="browse"
        compassMode="FOLLOW_HEADING"
        onCompassToggle={jest.fn()}
        onZoomIn={jest.fn()}
        onZoomOut={jest.fn()}
      />,
    );

    const compass = screen.getByRole('button', { name: /Map rotates with your compass heading/ });
    expect(compass.props.accessibilityState).toMatchObject({ selected: true });
  });
});

describe('MapControls — recenter state', () => {
  test.each(['nav', 'recenter'] as const)('%s suppresses browse layers and zoom', async (variant) => {
    await render(<MapControls variant={variant} compassMode="NORTH_UP"
      onCompassToggle={jest.fn()} onZoomIn={jest.fn()} onZoomOut={jest.fn()}
      recenter={variant === 'recenter' ? { state: 'idle', onPress: jest.fn() } : undefined} />);
    expect(screen.queryByRole('button', { name: 'Map layers and filters' })).not.toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Zoom in' })).not.toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Zoom out' })).not.toBeOnTheScreen();
    if (variant === 'recenter') {
      expect(screen.queryByRole('button', { name: /Map is north-up/ })).not.toBeOnTheScreen();
      expect(screen.getByRole('button', { name: 'Center map on my current location' })).toBeOnTheScreen();
    } else {
      expect(screen.getByRole('button', { name: /Map is north-up/ })).toBeOnTheScreen();
    }
  });

  test('exposes "active" (following) recenter state as selected', async () => {
    await render(
      <MapControls
        variant="browse"
        compassMode="NORTH_UP"
        onCompassToggle={jest.fn()}
        onZoomIn={jest.fn()}
        onZoomOut={jest.fn()}
        recenter={{ state: 'active', onPress: jest.fn() }}
      />,
    );

    const recenter = screen.getByRole('button', { name: /Following my current location/ });
    expect(recenter.props.accessibilityState).toMatchObject({ selected: true, disabled: false });
  });

  test('exposes "loading" recenter state as busy and disabled', async () => {
    await render(
      <MapControls
        variant="browse"
        compassMode="NORTH_UP"
        onCompassToggle={jest.fn()}
        onZoomIn={jest.fn()}
        onZoomOut={jest.fn()}
        recenter={{ state: 'loading', onPress: jest.fn() }}
      />,
    );

    const recenter = screen.getByRole('button', { name: /Center map on my current location/ });
    expect(recenter.props.accessibilityState).toMatchObject({ busy: true, disabled: true });
  });
});

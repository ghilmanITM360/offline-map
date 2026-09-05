/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render, screen, userEvent } from './test-utils';

import { LayersSheet } from '../views/components/map/LayersSheet';

function baseProps(overrides: Partial<React.ComponentProps<typeof LayersSheet>> = {}) {
  return {
    visible: true,
    onClose: jest.fn(),
    mapType: 'standard' as const,
    onMapTypeChange: jest.fn(),
    showBlockPolygons: true,
    onToggleBlocks: jest.fn(),
    showGatesLayer: true,
    onToggleGates: jest.fn(),
    showRastasLayer: true,
    onToggleRastas: jest.fn(),
    showSpecialRoutesLayer: true,
    onToggleSpecialRoutes: jest.fn(),
    ...overrides,
  };
}

describe('LayersSheet — map type control', () => {
  test('exposes Standard/Satellite as accessible, selectable buttons', async () => {
    await render(<LayersSheet {...baseProps({ mapType: 'standard' })} />);

    const standard = screen.getByRole('button', { name: 'Standard map type' });
    const satellite = screen.getByRole('button', { name: 'Satellite map type' });
    expect(standard.props.accessibilityState).toMatchObject({ selected: true });
    expect(satellite.props.accessibilityState).toMatchObject({ selected: false });
  });

  test('pressing "Satellite map type" invokes onMapTypeChange', async () => {
    const onMapTypeChange = jest.fn();
    const user = userEvent.setup();
    await render(<LayersSheet {...baseProps({ onMapTypeChange })} />);

    await user.press(screen.getByRole('button', { name: 'Satellite map type' }));

    expect(onMapTypeChange).toHaveBeenCalledWith('satellite');
  });
});

describe('LayersSheet — overlay toggle rows', () => {
  test('reflects each overlay\'s on/off state via switch semantics', async () => {
    await render(<LayersSheet {...baseProps({ showGatesLayer: false })} />);

    const gatesRow = screen.getByRole('switch', { name: 'Gates' });
    expect(gatesRow.props.accessibilityState).toMatchObject({ checked: false });
  });

  test('pressing a row toggles it', async () => {
    const onToggleRastas = jest.fn();
    const user = userEvent.setup();
    await render(<LayersSheet {...baseProps({ showRastasLayer: true, onToggleRastas })} />);

    await user.press(screen.getByRole('switch', { name: 'Rastas' }));

    expect(onToggleRastas).toHaveBeenCalledWith(false);
  });
});

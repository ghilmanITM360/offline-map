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

describe('LayersSheet — no imagery options (#140)', () => {
  test('offers only the venue overlay toggles: there is no map-type / satellite choice', async () => {
    await render(<LayersSheet {...baseProps()} />);

    expect(screen.queryByRole('button', { name: 'Satellite map type' })).not.toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Standard map type' })).not.toBeOnTheScreen();
    expect(screen.queryByText('Map Type')).not.toBeOnTheScreen();
    expect(screen.getByRole('switch', { name: 'Blocks' })).toBeOnTheScreen();
  });
});

describe('LayersSheet — overlay toggle rows', () => {
  test('#65: reflects each overlay\'s on/off state via switch semantics, without a duplicate inner announcement', async () => {
    await render(<LayersSheet {...baseProps({ showGatesLayer: false })} />);

    const gatesRow = screen.getByRole('switch', { name: 'Gates' });
    expect(gatesRow.props.accessibilityState).toMatchObject({ checked: false });
    expect(screen.queryAllByRole('switch', { name: 'Gates' })).toHaveLength(1);
  });

  test('#65: pressing a row toggles it', async () => {
    const onToggleRastas = jest.fn();
    const user = userEvent.setup();
    await render(<LayersSheet {...baseProps({ showRastasLayer: true, onToggleRastas })} />);

    await user.press(screen.getByRole('switch', { name: 'Rastas' }));

    expect(onToggleRastas).toHaveBeenCalledWith(false);
  });
});

describe('LayersSheet — close control (#128)', () => {
  test('the header close icon is an accessible, labelled button that closes the sheet', async () => {
    const onClose = jest.fn();
    const user = userEvent.setup();
    await render(<LayersSheet {...baseProps({ onClose })} />);

    // Icon-only control: without role + name TalkBack cannot announce or operate it (WCAG 4.1.2).
    await user.press(screen.getByRole('button', { name: 'Close Map Layers' }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

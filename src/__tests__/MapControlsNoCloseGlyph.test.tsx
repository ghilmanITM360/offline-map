/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// #307: a close "X" floating among the map controls reads as Cancel route / Close place. The only X there was the
// expanded "More map controls" toggle, which merely folds Layers and Zoom away. Map controls control the map;
// journey actions (Cancel route, End route guide, Close place) live in the sheet they belong to.

import React from 'react';
import { render, screen, userEvent } from './test-utils';
import { MapControls } from '../views/components/map/MapControls';

jest.mock('../viewmodels/useReducedMotion', () => ({ useReducedMotion: jest.fn(() => false) }));
jest.mock('lucide-react-native', () => {
  const ReactActual = jest.requireActual('react');
  const { View } = jest.requireActual('react-native');
  // Every icon renders as a View carrying its name, so the test can see which glyph a control uses.
  return new Proxy({ __esModule: true } as Record<string, unknown>, {
    get: (target, name) => (name in target ? target[name as string] : () => ReactActual.createElement(View, { testID: `icon-${String(name)}` })),
  });
});

const props = {
  variant: 'browse' as const,
  compassMode: 'NORTH_UP' as const,
  onLayers: jest.fn(),
  onCompassToggle: jest.fn(),
  onZoomIn: jest.fn(),
  onZoomOut: jest.fn(),
};

describe('MapControls — no close glyph among map controls', () => {
  test('collapsed: the More button is an ellipsis', async () => {
    await render(<MapControls {...props} />);
    expect(screen.getByTestId('icon-Ellipsis')).toBeOnTheScreen();
    expect(screen.queryByTestId('icon-X')).not.toBeOnTheScreen();
  });

  test('expanded: it folds the extras with a chevron, never an X, and keeps its name and expanded state', async () => {
    const user = userEvent.setup();
    await render(<MapControls {...props} />);
    await user.press(screen.getByLabelText('More map controls'));

    expect(screen.queryByTestId('icon-X')).not.toBeOnTheScreen();
    expect(screen.getByTestId('icon-ChevronDown')).toBeOnTheScreen();
    expect(screen.getByLabelText('More map controls').props.accessibilityState).toMatchObject({ expanded: true });
  });
});

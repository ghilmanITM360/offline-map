/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render, screen } from './test-utils';

import { BlockLayer } from '../views/components/map/BlockLayer';
import { V2BlockLayer } from '../services/V2MapRenderingService';

function makeBlock(overrides: Partial<V2BlockLayer> = {}): V2BlockLayer {
  return {
    id: 'BLOCK_1',
    label: 'Block 1',
    name: { en: 'Block 1', ur: 'بلاک 1' },
    center: { latitude: 24.9645, longitude: 67.0065 },
    polygon: [
      { latitude: 24.9645, longitude: 67.0065 },
      { latitude: 24.9646, longitude: 67.0066 },
      { latitude: 24.9647, longitude: 67.0064 },
    ],
    isSelected: false,
    pulse: false,
    ...overrides,
  };
}

describe('BlockLayer — marker accessibility (#157)', () => {
  test('home variant exposes an accessible name on the tappable block polygon', async () => {
    await render(<BlockLayer blocks={[makeBlock()]} variant="home" keyPrefix="test" onPressBlock={jest.fn()} />);

    expect(screen.getByLabelText('Block 1')).toBeTruthy();
  });
});

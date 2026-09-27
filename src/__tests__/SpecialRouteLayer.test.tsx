/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render, screen } from './test-utils';

import { SpecialRouteLayer } from '../views/components/map/SpecialRouteLayer';
import { V2PolylineLayer } from '../services/V2MapRenderingService';

function makeRoute(overrides: Partial<V2PolylineLayer> = {}): V2PolylineLayer {
  return {
    id: 'ROUTE_1',
    label: 'Shahr-e-Pindal 1',
    name: { en: 'Shahr-e-Pindal 1', ur: 'شہر پنڈال 1' },
    polyline: [
      { latitude: 24.9645, longitude: 67.0065 },
      { latitude: 24.9646, longitude: 67.0066 },
    ],
    labelCoordinate: { latitude: 24.9645, longitude: 67.0065 },
    isSelected: false,
    ...overrides,
  };
}

describe('SpecialRouteLayer — hit-corridor accessibility (#157)', () => {
  test('home variant exposes an accessible name on the tappable hit corridor', async () => {
    await render(<SpecialRouteLayer routes={[makeRoute()]} variant="home" keyPrefix="test" onPressRoute={jest.fn()} />);

    expect(screen.getByLabelText('Shahr-e-Pindal 1')).toBeTruthy();
  });
});

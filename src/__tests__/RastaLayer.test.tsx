/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render, screen } from './test-utils';

import { RastaLayer } from '../views/components/map/RastaLayer';
import { V2PolylineLayer } from '../services/V2MapRenderingService';

function makeRasta(overrides: Partial<V2PolylineLayer> = {}): V2PolylineLayer {
  return {
    id: 'RASTA_1',
    label: 'Rasta 1',
    name: { en: 'Rasta 1', ur: 'رستہ 1' },
    polyline: [
      { latitude: 24.9645, longitude: 67.0065 },
      { latitude: 24.9646, longitude: 67.0066 },
    ],
    labelCoordinate: { latitude: 24.9645, longitude: 67.0065 },
    isSelected: false,
    ...overrides,
  };
}

describe('RastaLayer — hit-corridor accessibility (#157)', () => {
  test('home variant exposes an accessible name on the tappable hit corridor', async () => {
    await render(<RastaLayer rastas={[makeRasta()]} variant="home" keyPrefix="test" onPressRasta={jest.fn()} />);

    expect(screen.getByLabelText('Rasta 1')).toBeTruthy();
  });
  test('#157: endpoint markers carry a native title so TalkBack does not say "Map Marker"', async () => {
    // Android's Google Maps SDK names a marker from its title and ignores accessibilityLabel (react-native-maps#3500).
    await render(<RastaLayer rastas={[makeRasta()]} variant="home" keyPrefix="test" />);

    const titles: string[] = [];
    const walk = (node: any) => {
      if (!node || typeof node === 'string') return;
      if (Array.isArray(node)) return node.forEach(walk);
      if (node.props?.title) titles.push(node.props.title);
      walk(node.children);
    };
    walk(screen.toJSON());
    expect(titles).toEqual(['Rasta 1 start', 'Rasta 1 end']);
  });
});

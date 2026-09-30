/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render, screen } from './test-utils';

import { GateLayer } from '../views/components/map/GateLayer';
import { V2GateLayer } from '../services/V2MapRenderingService';

function makeGate(overrides: Partial<V2GateLayer> = {}): V2GateLayer {
  return {
    id: 'GATE_12',
    label: 'Gate 12',
    name: { en: 'Gate 12', ur: 'گیٹ 12' },
    coordinate: { latitude: 24.963676, longitude: 67.006339 },
    isRoutable: true,
    isStartRoutable: true,
    needsConnectorVerification: false,
    ...overrides,
  };
}

/** Every `title` prop rendered in the tree. Android's Google Maps SDK names a marker for TalkBack from its
 * title and ignores accessibilityLabel (react-native-maps#3500); without one TalkBack says "Map Marker". */
function markerTitles(): string[] {
  const titles: string[] = [];
  const walk = (node: any) => {
    if (!node || typeof node === 'string') return;
    if (Array.isArray(node)) return node.forEach(walk);
    if (node.props?.title) titles.push(node.props.title);
    walk(node.children);
  };
  walk(screen.toJSON());
  return titles;
}

describe('GateLayer — marker accessibility (#151)', () => {
  test('#128: every gate marker carries its label as the native title so TalkBack does not say "Map Marker"', async () => {
    await render(
      <GateLayer
        gates={[makeGate(), makeGate({ id: 'GATE_13', label: 'Gate 13', labelSuppressed: true, isSelected: false })]}
        keyPrefix="test"
      />,
    );

    expect(markerTitles()).toEqual(['Gate 12', 'Gate 13']);
  });

  test('labelled gate leaves its accessible name to the MapLabelOverlay item (no duplicate node)', async () => {
    await render(<GateLayer gates={[makeGate()]} keyPrefix="test" />);

    expect(screen.queryByLabelText('Gate 12')).toBeNull();
  });

  test('selected gate also defers to its overlay label even if suppression is set', async () => {
    await render(<GateLayer gates={[makeGate({ labelSuppressed: true, isSelected: true })]} keyPrefix="test" />);

    expect(screen.queryByLabelText('Gate 12')).toBeNull();
  });

  test('suppressed/unselected gates (no overlay label) keep the marker as their only accessible name', async () => {
    await render(
      <GateLayer gates={[makeGate({ id: 'GATE_13', label: 'Gate 13', labelSuppressed: true, isSelected: false })]} keyPrefix="test" />,
    );

    expect(screen.getByLabelText('Gate 13')).toBeTruthy();
  });
});

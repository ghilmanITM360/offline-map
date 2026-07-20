/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { act, fireEvent, render, screen, waitFor } from './test-utils';

import { MapLabelItem, MapLabelOverlay, MapLabelOverlayHandle } from '../views/components/map/MapLabelOverlay';

/** A minimal MapView-ref stand-in — MapLabelOverlay only ever calls
 * pointForCoordinate on it, so a real MapView mock/render isn't needed. */
function makeMapRef(pointForCoordinate: jest.Mock) {
  return { current: { pointForCoordinate } } as any;
}

function gateItem(overrides: Partial<MapLabelItem> = {}): MapLabelItem {
  return {
    id: 'gate_GATE_08',
    coordinate: { latitude: 24.9, longitude: 67.1 },
    text: 'Gate 08',
    kind: 'gate',
    variant: 'full',
    zPriority: 12,
    ...overrides,
  };
}

/** Lets any pending rAF-scheduled projection batches (and their coalesced
 * trailing catch-up round) settle, wrapped in act() so the resulting state
 * updates aren't flagged as out-of-act. */
async function flush(ms = 50) {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
}

describe('MapLabelOverlay', () => {
  it('renders full label text untruncated, with no numberOfLines/clipping prop', async () => {
    const pointForCoordinate = jest.fn(() => Promise.resolve({ x: 100, y: 100 }));
    await render(<MapLabelOverlay mapRef={makeMapRef(pointForCoordinate)} items={[gateItem()]} />);

    const label = await screen.findByText('Gate 08');
    expect(label).toBeOnTheScreen();
    expect(label.props.numberOfLines).toBeUndefined();
  });

  it('stacks items by zPriority so a selected gate paints above a lower-priority label', async () => {
    const pointForCoordinate = jest.fn(() => Promise.resolve({ x: 50, y: 50 }));
    await render(
      <MapLabelOverlay
        mapRef={makeMapRef(pointForCoordinate)}
        items={[
          gateItem({ id: 'gate_low', text: 'Gate 01', zPriority: 12 }),
          gateItem({ id: 'gate_high', text: 'Gate 02', isSelected: true, zPriority: 16 }),
        ]}
      />,
    );

    const low = await screen.findByText('Gate 01');
    const high = await screen.findByText('Gate 02');
    const lowWrapperStyle = low.parent?.parent?.props.style;
    const highWrapperStyle = high.parent?.parent?.props.style;
    expect(highWrapperStyle.zIndex).toBeGreaterThan(lowWrapperStyle.zIndex);
  });

  it('does not render a label whose projected point falls outside the measured container', async () => {
    const pointForCoordinate = jest.fn(() => Promise.resolve({ x: 5000, y: 5000 }));
    await render(
      <MapLabelOverlay mapRef={makeMapRef(pointForCoordinate)} items={[gateItem({ text: 'Offscreen Gate' })]} />,
    );

    // Sanity: with no known container size yet, the label renders as soon as its
    // (off-screen) point resolves — off-screen filtering only kicks in once the
    // container's real size is known.
    await screen.findByText('Offscreen Gate');

    const container = screen.getByTestId('map-label-overlay');
    fireEvent(container, 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 400, height: 800 } } });

    await waitFor(() => {
      expect(screen.queryByText('Offscreen Gate')).not.toBeOnTheScreen();
    });
  });

  it('coalesces rapid requestProjection ticks instead of calling pointForCoordinate once per tick', async () => {
    const pointForCoordinate = jest.fn(() => Promise.resolve({ x: 10, y: 10 }));
    const ref = React.createRef<MapLabelOverlayHandle>();
    await render(<MapLabelOverlay ref={ref} mapRef={makeMapRef(pointForCoordinate)} items={[gateItem()]} />);
    await screen.findByText('Gate 08');
    const callsAfterMount = pointForCoordinate.mock.calls.length;

    // Simulate a burst of onRegionChange ticks during a fast drag/rotate gesture.
    await act(async () => {
      for (let i = 0; i < 20; i += 1) {
        ref.current?.requestProjection();
      }
    });
    await flush();

    const callsAfterBurst = pointForCoordinate.mock.calls.length - callsAfterMount;
    // One in-flight batch plus at most one trailing catch-up batch — nowhere near 20.
    expect(callsAfterBurst).toBeLessThanOrEqual(2);
  });
});

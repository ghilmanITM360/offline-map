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
  // Defensive: if a spy-installing test fails mid-assertion, its cleanup lines (e.g.
  // rafSpy.mockRestore()) never run — restoreAllMocks() here guarantees later tests never
  // inherit a stubbed requestAnimationFrame/console.error from an earlier failure.
  afterEach(() => {
    jest.restoreAllMocks();
  });

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

  it('does not update state or warn after unmount while a projection is still in flight', async () => {
    // Synchronous rAF stub sidesteps real-timer/act-scope races entirely — project()'s
    // callback runs inline during render, so pointForCoordinate is already in flight (and
    // still unresolved, since we haven't called resolvePoint) by the time render() returns.
    const rafSpy = jest
      .spyOn(global, 'requestAnimationFrame')
      .mockImplementation((cb: FrameRequestCallback) => {
        cb(0);
        return 0;
      });
    let resolvePoint: (value: { x: number; y: number }) => void = () => {};
    const pointForCoordinate = jest.fn(
      () => new Promise<{ x: number; y: number }>((resolve) => { resolvePoint = resolve; }),
    );
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

    const { unmount } = await render(
      <MapLabelOverlay mapRef={makeMapRef(pointForCoordinate)} items={[gateItem()]} />,
    );
    expect(pointForCoordinate).toHaveBeenCalled();

    // unmount() (from RNTL) is itself async — awaiting it matters here specifically, since
    // an un-awaited act() call overlapping with the next act() below is exactly the
    // "overlapping act() calls" React warning this test is trying to prove doesn't happen.
    await unmount();

    // Resolve the promise the component started before it was torn down — mountedRef must
    // stop the .then/.finally continuation from calling setPoints or re-triggering project().
    await act(async () => {
      resolvePoint({ x: 10, y: 10 });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
    rafSpy.mockRestore();
  });

  it('resolves to the latest item coordinates, not a stale in-flight batch, when items change mid-projection', async () => {
    const pointForCoordinate = jest.fn((coord: { latitude: number; longitude: number }) =>
      Promise.resolve({ x: coord.longitude, y: coord.latitude }),
    );
    const { rerender } = await render(
      <MapLabelOverlay
        mapRef={makeMapRef(pointForCoordinate)}
        items={[gateItem({ coordinate: { latitude: 1, longitude: 1 } })]}
      />,
    );
    await screen.findByText('Gate 08');

    // Change coordinate immediately, without waiting for the first projection batch to
    // resolve — exercises the inFlightRef/pendingRef coalescing path in project().
    await act(async () => {
      rerender(
        <MapLabelOverlay
          mapRef={makeMapRef(pointForCoordinate)}
          items={[gateItem({ coordinate: { latitude: 900, longitude: 900 } })]}
        />,
      );
    });
    await flush();

    const label = await screen.findByText('Gate 08');
    const wrapperStyle = label.parent?.parent?.props.style;
    // Stale (first) coordinate projects to x=1, which — after centering — is negative.
    // Only the latest coordinate (x=900) lands positive.
    expect(wrapperStyle.left).toBeGreaterThan(0);
  });
});

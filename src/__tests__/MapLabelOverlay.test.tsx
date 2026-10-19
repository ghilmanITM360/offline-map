/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';
import { act, fireEvent, render, screen, waitFor } from './test-utils';

import { MapLabelItem, MapLabelOverlay, MapLabelOverlayHandle } from '../views/components/map/MapLabelOverlay';
import { useLocaleStore } from '../i18n';

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
  beforeEach(() => {
    useLocaleStore.setState({ locale: 'en' });
  });

  // Defensive: if a spy-installing test fails mid-assertion, its cleanup lines (e.g.
  // rafSpy.mockRestore()) never run — restoreAllMocks() here guarantees later tests never
  // inherit a stubbed requestAnimationFrame/console.error from an earlier failure.
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it.each([
    ['ur', 'rtl'],
    ['en', 'ltr'],
    ['ur-Latn', 'ltr'],
  ] as const)('keeps projected coordinates physical for %s while text chooses its own direction', async (locale, appDirection) => {
    useLocaleStore.setState({ locale });
    const pointForCoordinate = jest.fn(() => Promise.resolve({ x: 120, y: 80 }));
    await render(
      <View style={{ direction: appDirection }}>
        <MapLabelOverlay mapRef={makeMapRef(pointForCoordinate)} items={[gateItem()]} />
      </View>,
    );

    const overlay = screen.getByTestId('map-label-overlay');
    const label = await screen.findByText('Gate 08');
    expect(StyleSheet.flatten(overlay.props.style).direction).toBe('ltr');
    expect(StyleSheet.flatten(label.parent?.parent?.props.style)).toMatchObject({ left: 66, top: 63 });
    expect(StyleSheet.flatten(label.props.style).writingDirection).toBe('auto');
  });

  it('lets each line in a bilingual label derive its own script direction', async () => {
    useLocaleStore.setState({ locale: 'ur-Latn' });
    const pointForCoordinate = jest.fn(() => Promise.resolve({ x: 120, y: 80 }));
    await render(
      <MapLabelOverlay
        mapRef={makeMapRef(pointForCoordinate)}
        items={[gateItem({ text: 'Gate 08', secondaryText: 'گیٹ 08' })]}
      />,
    );

    expect(StyleSheet.flatten((await screen.findByText('Gate 08')).props.style).writingDirection).toBe('auto');
    expect(StyleSheet.flatten(screen.getByText('گیٹ 08').props.style).writingDirection).toBe('auto');
  });

  it('#208 blank screen: a label whose coordinate makes the native call throw is skipped, not fatal', async () => {
    // On a release build "Expected argument 0 of method pointForCoordinate to be a number, but got null" was
    // thrown synchronously inside the rAF projection callback. Nothing caught it, React's host was torn down and
    // the whole Home screen turned into a blank frame. One bad item must only lose its own label.
    const pointForCoordinate = jest.fn((coordinate: { latitude: number | null }) => {
      if (coordinate?.latitude == null) throw new Error('Expected argument 0 of method "pointForCoordinate" to be a number, but got null');
      return Promise.resolve({ x: 100, y: 100 });
    });
    await render(
      <MapLabelOverlay
        mapRef={makeMapRef(pointForCoordinate as unknown as jest.Mock)}
        items={[
          gateItem({ id: 'bad', text: 'Bad', coordinate: { latitude: null as unknown as number, longitude: 67.1 } }),
          gateItem({ id: 'good', text: 'Gate 08' }),
        ]}
      />,
    );

    expect(await screen.findByText('Gate 08')).toBeOnTheScreen();
    expect(screen.queryByText('Bad')).toBeNull();
  });

  it('renders full label text untruncated, with no numberOfLines/clipping prop', async () => {
    const pointForCoordinate = jest.fn(() => Promise.resolve({ x: 100, y: 100 }));
    await render(<MapLabelOverlay mapRef={makeMapRef(pointForCoordinate)} items={[gateItem()]} />);

    const label = await screen.findByText('Gate 08');
    expect(label).toBeOnTheScreen();
    expect(label.props.numberOfLines).toBeUndefined();
  });

  it('speaks item.accessibilityLabel over an abbreviated LOD text, for pressable and passive labels', async () => {
    const pointForCoordinate = jest.fn(() => Promise.resolve({ x: 100, y: 100 }));
    await render(
      <MapLabelOverlay
        mapRef={makeMapRef(pointForCoordinate)}
        items={[
          gateItem({ id: 'g12', text: '12', variant: 'number', accessibilityLabel: 'Gate 12', onPress: jest.fn() }),
          gateItem({ id: 'g13', text: 'G13', variant: 'compact', accessibilityLabel: 'Gate 13' }),
        ]}
      />,
    );

    expect(await screen.findByLabelText('Gate 12')).toBeOnTheScreen();
    expect(screen.getByLabelText('Gate 13')).toBeOnTheScreen();
    expect(screen.queryByLabelText('12')).toBeNull();
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

  it('culls a label whose box overlaps dynamic bottom occlusion', async () => {
    const pointForCoordinate = jest.fn(() => Promise.resolve({ x: 100, y: 590 }));
    await render(
      <MapLabelOverlay
        mapRef={makeMapRef(pointForCoordinate)}
        items={[gateItem({ text: 'Boundary Gate' })]}
        edgeInsets={{ bottom: 200 }}
      />,
    );
    await screen.findByText('Boundary Gate');
    fireEvent(screen.getByTestId('map-label-overlay'), 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, width: 400, height: 800 } },
    });

    await waitFor(() => expect(screen.queryByText('Boundary Gate')).not.toBeOnTheScreen());
  });

  it('keeps a label whose full box remains above the occlusion boundary', async () => {
    const pointForCoordinate = jest.fn(() => Promise.resolve({ x: 100, y: 580 }));
    await render(
      <MapLabelOverlay
        mapRef={makeMapRef(pointForCoordinate)}
        items={[gateItem({ text: 'Visible Boundary Gate' })]}
        edgeInsets={{ bottom: 200 }}
      />,
    );
    await screen.findByText('Visible Boundary Gate');
    fireEvent(screen.getByTestId('map-label-overlay'), 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, width: 400, height: 800 } },
    });

    expect(screen.getByText('Visible Boundary Gate')).toBeOnTheScreen();
  });

  it('culls selected label text behind bottom chrome while its marker remains separately owned', async () => {
    const pointForCoordinate = jest.fn(() => Promise.resolve({ x: 100, y: 650 }));
    await render(
      <MapLabelOverlay
        mapRef={makeMapRef(pointForCoordinate)}
        items={[gateItem({ text: 'Selected Hidden Gate', isSelected: true })]}
        edgeInsets={{ bottom: 200 }}
      />,
    );
    await screen.findByText('Selected Hidden Gate');
    fireEvent(screen.getByTestId('map-label-overlay'), 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, width: 400, height: 800 } },
    });

    await waitFor(() => expect(screen.queryByText('Selected Hidden Gate')).not.toBeOnTheScreen());
  });

  it('#157: exposes an accessible name for a non-interactive label (no onPress)', async () => {
    const pointForCoordinate = jest.fn(() => Promise.resolve({ x: 100, y: 100 }));
    await render(
      <MapLabelOverlay
        mapRef={makeMapRef(pointForCoordinate)}
        items={[gateItem({ id: 'gate_readonly', text: 'Gate 09', secondaryText: 'گیٹ 09' })]}
      />,
    );

    const label = await screen.findByLabelText('Gate 09, گیٹ 09');
    expect(label).toBeOnTheScreen();
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

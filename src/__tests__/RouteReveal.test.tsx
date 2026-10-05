/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { renderHook, act } from './test-utils';
import { AccessibilityInfo } from 'react-native';
import { sliceLineByFraction, revealSpecData, lineLengthMeters } from '../views/components/mapgl/routeReveal';
import { useRouteReveal } from '../views/components/mapgl/useRouteReveal';
import { ROUTE_REVEAL_MS } from '../views/components/mapgl/mapDesign';
import type { OverlaySpec } from '../views/components/mapgl/overlaySpec';

// Three points ~111 m apart each along a meridian: total ~222 m, the bend point at exactly half.
const LINE: [number, number][] = [[67, 25], [67, 25.001], [67, 25.002]];

describe('sliceLineByFraction', () => {
  it('returns nothing drawable at 0 and the whole line at 1', () => {
    expect(sliceLineByFraction(LINE, 0).length).toBeLessThan(2);
    expect(sliceLineByFraction(LINE, 1)).toEqual(LINE);
  });

  it('ends exactly on a vertex when the fraction lands on it, and interpolates between vertices otherwise', () => {
    const half = sliceLineByFraction(LINE, 0.5);
    expect(half).toHaveLength(2);
    expect(half[1][1]).toBeCloseTo(25.001, 5);
    const quarter = sliceLineByFraction(LINE, 0.25);
    expect(quarter).toHaveLength(2);
    expect(quarter[1][1]).toBeCloseTo(25.0005, 5);
    const threeQuarters = sliceLineByFraction(LINE, 0.75);
    expect(threeQuarters).toHaveLength(3);
    expect(threeQuarters[2][1]).toBeCloseTo(25.0015, 5);
  });

  it('never mutates its input and tolerates degenerate lines', () => {
    const copy = JSON.parse(JSON.stringify(LINE));
    sliceLineByFraction(LINE, 0.4);
    expect(LINE).toEqual(copy);
    expect(sliceLineByFraction([[67, 25]], 0.5).length).toBeLessThan(2);
    expect(sliceLineByFraction([[67, 25], [67, 25]], 0.5).length).toBeLessThan(2);
  });

  it('measures length in metres', () => {
    expect(lineLengthMeters(LINE)).toBeGreaterThan(215);
    expect(lineLengthMeters(LINE)).toBeLessThan(230);
  });
});

describe('revealSpecData', () => {
  const spec: OverlaySpec = {
    id: 'route-inside',
    data: {
      type: 'FeatureCollection',
      features: [{ type: 'Feature', properties: { part: 'full' }, geometry: { type: 'LineString', coordinates: LINE } }],
    },
    layers: [],
    reveal: { key: 'k', from: 0.4, to: 1 },
  };

  it('keeps the same data object once complete (so no native update is sent) and before it is relevant', () => {
    expect(revealSpecData(spec, 1)).toBe(spec.data);
    expect(revealSpecData({ ...spec, reveal: undefined }, 0.3)).toBe(spec.data);
  });

  it('draws nothing before this spec\'s turn and a growing prefix during it', () => {
    expect(revealSpecData(spec, 0.2).features).toHaveLength(0);
    const mid = revealSpecData(spec, 0.7);
    expect(mid.features).toHaveLength(1);
    const coords = (mid.features[0].geometry as GeoJSON.LineString).coordinates;
    expect(coords.length).toBeGreaterThanOrEqual(2);
    expect(coords[coords.length - 1][1]).toBeLessThan(25.002);
  });
});

describe('useRouteReveal', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());
  const run = (ms: number) => act(() => { jest.advanceTimersByTime(ms); });

  it('is complete without a key (nothing to reveal)', async () => {
    const { result } = await renderHook(() => useRouteReveal(undefined));
    expect(result.current).toBe(1);
  });

  it('grows from 0 to 1 over the reveal window (600-900 ms) and then stops', async () => {
    expect(ROUTE_REVEAL_MS).toBeGreaterThanOrEqual(600);
    expect(ROUTE_REVEAL_MS).toBeLessThanOrEqual(900);
    const { result } = await renderHook(() => useRouteReveal('a'));
    expect(result.current).toBe(0);
    await run(ROUTE_REVEAL_MS / 2);
    expect(result.current).toBeGreaterThan(0.2);
    expect(result.current).toBeLessThan(0.8);
    await run(ROUTE_REVEAL_MS);
    expect(result.current).toBe(1);
  });

  it('does not restart for the same key and restarts for a new one', async () => {
    const { result, rerender } = await renderHook(({ k }: { k: string }) => useRouteReveal(k), { initialProps: { k: 'a' } });
    await run(ROUTE_REVEAL_MS + 100);
    await rerender({ k: 'a' });
    expect(result.current).toBe(1);
    await rerender({ k: 'b' });
    expect(result.current).toBe(0);
  });

  it('shows the whole route at once under reduced motion', async () => {
    (AccessibilityInfo.isReduceMotionEnabled as jest.Mock).mockResolvedValueOnce(true);
    const { result } = await renderHook(() => useRouteReveal('a'));
    await act(async () => {});
    expect(result.current).toBe(1);
  });
});

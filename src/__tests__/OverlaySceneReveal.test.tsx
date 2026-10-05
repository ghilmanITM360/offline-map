/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { act, render } from './test-utils';
import { OverlayScene } from '../views/components/mapgl/OverlayScene';
import { buildRouteOverlay } from '../views/components/mapgl/overlaySpec';
import { ROUTE_FADE_MS, ROUTE_REVEAL_MS } from '../views/components/mapgl/mapDesign';
import { hasSource, sourceFeatures } from './mapTestUtils';

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

const c = (lat: number, lng: number) => ({ latitude: lat, longitude: lng });
const INSIDE = [c(25, 67), c(25.001, 67), c(25.002, 67)];
const lastLat = () => {
  const geometry = sourceFeatures('route-inside')[0]?.geometry as GeoJSON.LineString | undefined;
  return geometry ? geometry.coordinates[geometry.coordinates.length - 1][1] : null;
};

describe('OverlayScene route reveal', () => {
  it('grows the route from the start to the destination, then holds the full line', async () => {
    const specs = buildRouteOverlay({ outside: [], roadFollowing: false, inside: INSIDE, revealKey: 'a' });
    await render(<OverlayScene specs={specs} />);
    expect(sourceFeatures('route-inside')).toHaveLength(0); // nothing drawn at t=0

    await act(() => { jest.advanceTimersByTime(ROUTE_REVEAL_MS / 2); });
    const mid = lastLat();
    expect(mid).toBeGreaterThan(25);
    expect(mid).toBeLessThan(25.002);

    await act(() => { jest.advanceTimersByTime(ROUTE_REVEAL_MS); });
    expect(lastLat()).toBeCloseTo(25.002, 6);
  });

  it('draws a route without a reveal key in full at once', async () => {
    await render(<OverlayScene specs={buildRouteOverlay({ outside: [], roadFollowing: false, inside: INSIDE })} />);
    expect(lastLat()).toBeCloseTo(25.002, 6);
  });
});

describe('OverlayScene reroute transition', () => {
  const OLD = [c(25, 67), c(25.001, 67), c(25.002, 67)];
  const NEW = [c(25, 67), c(25, 67.001), c(25.002, 67.002)];
  const scene = (inside: typeof OLD, revealKey?: string) =>
    buildRouteOverlay({ outside: [], roadFollowing: false, inside, walked: [], remaining: inside, revealKey });

  it('fades the replaced route out while the new one reveals, then drops it', async () => {
    const view = await render(<OverlayScene specs={scene(OLD)} />);
    expect(hasSource('route-inside-ghost')).toBe(false);

    await view.rerender(<OverlayScene specs={scene(NEW, 'reroute-1')} />);
    expect(hasSource('route-inside-ghost')).toBe(true);
    const ghost = sourceFeatures('route-inside-ghost');
    expect((ghost[0].geometry as GeoJSON.LineString).coordinates[1][1]).toBeCloseTo(25.001, 6); // the OLD geometry

    await act(() => { jest.advanceTimersByTime(ROUTE_FADE_MS + 200); });
    expect(hasSource('route-inside-ghost')).toBe(false);
    await act(() => { jest.advanceTimersByTime(ROUTE_REVEAL_MS); });
    expect(lastLat()).toBeCloseTo(25.002, 6); // the new route finished revealing
  });

  it('still drops the ghost when GPS progress ticks re-render the scene during the fade', async () => {
    const view = await render(<OverlayScene specs={scene(OLD)} />);
    await view.rerender(<OverlayScene specs={scene(NEW, 'reroute-1')} />);
    expect(hasSource('route-inside-ghost')).toBe(true);

    for (let i = 0; i < 4; i++) {
      await act(() => { jest.advanceTimersByTime(60); });
      await view.rerender(<OverlayScene specs={buildRouteOverlay({ outside: [], roadFollowing: false, inside: NEW, walked: NEW.slice(0, 1), remaining: NEW, revealKey: 'reroute-1' })} />);
    }
    await act(() => { jest.advanceTimersByTime(ROUTE_FADE_MS + 200); });
    expect(hasSource('route-inside-ghost')).toBe(false);
  });

  it('shows no ghost when the first route appears, or when the same route is re-rendered', async () => {
    const view = await render(<OverlayScene specs={scene(OLD, 'first')} />);
    expect(hasSource('route-inside-ghost')).toBe(false);
    await view.rerender(<OverlayScene specs={scene(OLD, 'first')} />);
    expect(hasSource('route-inside-ghost')).toBe(false);
  });
});

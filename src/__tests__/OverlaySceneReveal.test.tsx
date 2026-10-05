/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { act, render } from './test-utils';
import { OverlayScene } from '../views/components/mapgl/OverlayScene';
import { buildRouteOverlay } from '../views/components/mapgl/overlaySpec';
import { ROUTE_REVEAL_MS } from '../views/components/mapgl/mapDesign';
import { sourceFeatures } from './mapTestUtils';

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

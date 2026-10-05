/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { calculateNavigationProgressV2 } from '../services/V2NavigationRuntimeService';
import { RerouteService } from '../services/RerouteService';
import type { Coordinate, V2ActiveRoute } from '../models/types';

// #93: live progress used to project every fix onto the globally nearest route segment. On a route
// that doubles back beside itself (two corridors ~20 m apart, ~300 m apart ALONG the route), one
// noisy fix that lands closer to the far corridor ratcheted progress forward and the monotonic
// clamp then made the wrong position permanent. Progress now stays on the corridor the walker is
// on while that corridor is still within the off-route tolerance.
const LAT0 = 24.9640;
const LNG_A = 67.0000;
const M_PER_DEG_LAT = 111_320;
const M_PER_DEG_LNG = 111_320 * Math.cos((LAT0 * Math.PI) / 180);
const north = (m: number) => LAT0 + m / M_PER_DEG_LAT;
const east = (m: number) => LNG_A + m / M_PER_DEG_LNG;

// Corridor A: 0 -> 200 m north. Connector 20 m east. Corridor B: back south 200 -> 0 m, 20 m east of A.
// Along-route length: 200 + 20 + 200 = 420 m. A point at 100 m on A has its twin at 320 m on B.
const route = {
  coordinates: [
    { latitude: north(0), longitude: east(0) },
    { latitude: north(200), longitude: east(0) },
    { latitude: north(200), longitude: east(20) },
    { latitude: north(0), longitude: east(20) },
  ],
  totalDistanceM: 420,
} as unknown as V2ActiveRoute;

const T0 = 1_000_000;
const fix = (northM: number, eastM: number, atMs: number, accuracy = 10): Coordinate => ({
  latitude: north(northM),
  longitude: east(eastM),
  accuracy,
  observedAtMs: atMs,
});

function step(prev: { progress: number; at: number }, coordinate: Coordinate) {
  const result = calculateNavigationProgressV2({
    route,
    coordinate,
    previousProgressMeters: prev.progress,
    walkingSpeedMs: 1.4,
    previousObservedAtMs: prev.at,
  });
  return { result, state: { progress: result.progressMeters, at: coordinate.observedAtMs as number } };
}

describe('#93 live progress keeps continuity across parallel corridors', () => {
  test('a fix 12 m off corridor A, closer to corridor B, stays on corridor A', () => {
    const { result } = step({ progress: 100, at: T0 }, fix(102, 12, T0 + 1000));
    expect(result.progressMeters).toBeGreaterThan(99);
    expect(result.progressMeters).toBeLessThan(106);
    expect(result.distanceToRouteMeters).toBeCloseTo(12, 0);
  });

  test('noise oscillating between the two corridors keeps progress stable and monotonic', () => {
    let state = { progress: 100, at: T0 };
    let last = 100;
    for (let i = 1; i <= 20; i += 1) {
      const eastM = i % 2 === 0 ? 3 : 13; // alternately nearer A, then nearer B
      const next = step(state, fix(100 + i * 1.2, eastM, T0 + i * 1000));
      state = next.state;
      expect(next.result.progressMeters).toBeGreaterThanOrEqual(last);
      expect(next.result.progressMeters).toBeLessThan(140);
      last = next.result.progressMeters;
    }
  });

  test('forward walking still advances and turns the corner onto the connector and corridor B', () => {
    let state = { progress: 190, at: T0 };
    const path: Array<[number, number]> = [[196, 0], [200, 4], [200, 12], [200, 19], [194, 20], [186, 20]];
    let last = 190;
    path.forEach(([n, e], i) => {
      const next = step(state, fix(n, e, T0 + (i + 1) * 4000));
      state = next.state;
      expect(next.result.progressMeters).toBeGreaterThanOrEqual(last);
      last = next.result.progressMeters;
    });
    expect(last).toBeGreaterThan(225); // 200 + 20 + 14 = 234 on corridor B
    expect(last).toBeLessThan(245);
  });

  test('walking away from corridor A beyond the tolerance releases the window (no sticky lock)', () => {
    // 45 m east of A is 25 m beyond B. A is out of tolerance, so the global nearest corridor (B) applies.
    const { result } = step({ progress: 100, at: T0 }, fix(102, 45, T0 + 60_000));
    expect(result.progressMeters).toBeGreaterThan(300);
  });

  test('a giant jump is still bounded by the plausible-forward cap', () => {
    const { result } = step({ progress: 100, at: T0 }, fix(102, 45, T0 + 1000));
    expect(result.progressMeters).toBeLessThan(100 + 1.4 * 3 + 25 + 1);
  });

  test('no timestamp evidence leaves the old global projection untouched', () => {
    const result = calculateNavigationProgressV2({
      route,
      coordinate: { ...fix(102, 12, T0), observedAtMs: undefined },
      previousProgressMeters: 100,
      walkingSpeedMs: 1.4,
    });
    expect(result.progressMeters).toBeGreaterThan(300);
  });

  test('a non-finite previous progress or fix does not throw and falls back to the global projection', () => {
    const bad = RerouteService.projectProgressMetersOnRoute(fix(102, 12, T0), route as never, {
      previousProgressMeters: Number.NaN,
      maxForwardMeters: 29,
      acceptDistanceM: 30,
    });
    expect(bad.progressMeters).toBeGreaterThan(300);
    const nan = RerouteService.projectProgressMetersOnRoute(
      { latitude: Number.NaN, longitude: Number.NaN } as Coordinate,
      route as never,
      { previousProgressMeters: 100, maxForwardMeters: 29, acceptDistanceM: 30 },
    );
    expect(Number.isFinite(nan.progressMeters)).toBe(true);
  });

  test('a new route resets continuity: progress 0 on a fresh route starts from the nearest corridor', () => {
    const { result } = step({ progress: 0, at: T0 }, fix(2, 1, T0 + 1000));
    expect(result.progressMeters).toBeLessThan(10);
  });
});

import { SpatialGrid, haversineM } from '../utils/SpatialGrid';
import type { SpatialGridPoint } from '../utils/SpatialGrid';
import { SpatialGrid as PublicGrid, spatialHaversineM, haversineM as venueDistance } from '@muslim-ummah/offline-navigation';
import * as domain from '../../packages/offline-navigation/src/domain/geo/SpatialGrid';
import { haversineM as domainVenueDistance } from '../../packages/offline-navigation/src/domain/venue';

it('preserves class and both distinct distance function identities', () => {
  expect(SpatialGrid).toBe(PublicGrid);
  expect(SpatialGrid).toBe(domain.SpatialGrid);
  expect(haversineM).toBe(spatialHaversineM);
  expect(haversineM).toBe(domain.haversineM);
  expect(venueDistance).toBe(domainVenueDistance);
  expect(venueDistance).not.toBe(haversineM);
  const cases: [number, number, number, number][] = [
    [0, 0, 0, 0], [-0, -0, 0, 0], [24.963676, 67.006339, 24.965516, 67.007675],
    [-90, -180, 90, 180], [0, 0, 0, 180], [90, 180, 90, -180],
    [NaN, 0, 0, 0], [0, Infinity, 0, 0], [0, 0, -Infinity, 0],
  ];
  for (const args of cases) expect(Object.is(haversineM(...args), domain.haversineM(...args))).toBe(true);
});

it('preserves empty lookup, point references, exact distances and stable equal-distance order', () => {
  expect(new SpatialGrid([]).nearest(0, 0)).toBeUndefined();
  const points: SpatialGridPoint[] = [{ id: 'first', lat: 0, lng: 0 }, { id: 'second', lat: 0, lng: 0 }];
  const actual = new SpatialGrid(points).nearest(0, 0)!;
  expect(actual.point).toBe(points[0]);
  expect(actual.distanceM).toBe(0);
  expect(new SpatialGrid(points).nearest(-0.001, 0.001)).toEqual(new domain.SpatialGrid(points).nearest(-0.001, 0.001));
});

// Production-scale review 2026-11-10: a query far from the grid used to walk 200+ rings of empty cells (cubic in the ring count), which froze
// the JS thread for seconds on a large venue when a walker far outside asked for Live.
describe('bounded nearest', () => {
  const grid = (side: number) => new domain.SpatialGrid(Array.from({ length: side * side }, (_, i) => ({ id: `n${i}`, lat: 24.9 + (Math.floor(i / side) * 20) / 111320, lng: 67 + ((i % side) * 20) / 101000 })));
  it('with a maximum distance, returns the same point as the unbounded search when one is in range and nothing otherwise', () => {
    const g = grid(40);
    for (const [lat, lng] of [[24.9001, 67.0001], [24.9031, 67.0052], [24.9, 67], [24.89995, 66.99996]] as const) {
      expect(g.nearest(lat, lng, 100)).toEqual(g.nearest(lat, lng));
    }
    expect(g.nearest(24.89, 67, 100)).toBeUndefined(); // about 1.1 km south
    expect(g.nearest(24.89, 67)!.point.id).toBe('n0'); // unbounded still finds it
    expect(g.nearest(24.9, 67, 0)!.distanceM).toBe(0);
    expect(g.nearest(NaN, 67, 100)).toBeUndefined();
  });
  it('a bounded query 1,000 km away answers at once on a 100,000-point grid', () => {
    const g = grid(317);
    const t = Date.now();
    for (let i = 0; i < 50; i += 1) expect(g.nearest(31.5, 74.3, 100)).toBeUndefined();
    expect(Date.now() - t).toBeLessThan(200); // was about 26 s for ONE query
  });
});

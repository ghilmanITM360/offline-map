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

import { isValidCoordinate as publicCoordinate } from '@muslim-ummah/offline-navigation';
import { isValidCoordinate as domainCoordinate } from '../../packages/offline-navigation/src/domain/geo/isValidCoordinate';
import { isValidCoordinate } from '../utils/isValidCoordinate';

describe('coordinate facade public SDK boundary', () => {
  it('shares the exact public and domain function, without a wrapper', () => {
    expect(isValidCoordinate).toBe(publicCoordinate);
    expect(publicCoordinate).toBe(domainCoordinate);
  });

  it.each([
    [0, 0, true], [-0, -0, true], [24.963676, 67.006339, true],
    [90, 180, true], [90, -180, true], [-90, 180, true], [-90, -180, true],
    [90.000001, 0, false], [-90.000001, 0, false],
    [0, 180.000001, false], [0, -180.000001, false],
    [NaN, 0, false], [0, NaN, false],
    [Infinity, 0, false], [-Infinity, 0, false],
    [0, Infinity, false], [0, -Infinity, false],
  ])('preserves (%s, %s) => %s', (latitude, longitude, expected) => {
    const coordinate = { latitude, longitude };
    expect(isValidCoordinate(coordinate)).toBe(expected);
    expect(publicCoordinate(coordinate)).toBe(expected);
    expect(domainCoordinate(coordinate)).toBe(expected);
  });
});

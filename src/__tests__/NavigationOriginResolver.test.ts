/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { resolveNavigationOrigin } from '../services/NavigationOriginResolver';
import { LocationAccessService } from '../services/LocationAccessService';
import { SearchService } from '../services/SearchService';
import type { Place } from '../models/types';

jest.mock('../services/LocationAccessService', () => ({
  LocationAccessService: { resolveCurrentLocation: jest.fn() },
}));
jest.mock('../services/SearchService', () => ({
  SearchService: { getPlaceById: jest.fn() },
}));

const resolveCurrentLocation = LocationAccessService.resolveCurrentLocation as jest.Mock;
const getPlaceById = SearchService.getPlaceById as jest.Mock;

const B2_PLACE = { id: 'B2', name: 'Block 2' } as Place;
const permissionState = { granted: true, canAskAgain: true, status: 'granted', servicesEnabled: true } as any;

beforeEach(() => {
  jest.clearAllMocks();
  getPlaceById.mockReturnValue(B2_PLACE);
});

describe('resolveNavigationOrigin', () => {
  it('resolves to live current location when GPS is usable', async () => {
    resolveCurrentLocation.mockResolvedValue({
      ok: true,
      coordinate: { latitude: 1, longitude: 2 },
      source: 'live',
      permissionState,
      message: null,
    });

    const origin = await resolveNavigationOrigin();

    expect(origin).toEqual({
      kind: 'current_location',
      coordinate: { latitude: 1, longitude: 2 },
      source: 'live',
    });
  });

  it('accepts device last-known location as current location, matching the existing Directions contract', async () => {
    resolveCurrentLocation.mockResolvedValue({
      ok: true,
      coordinate: { latitude: 1, longitude: 2 },
      source: 'device_last_known',
      permissionState,
      message: null,
    });

    const origin = await resolveNavigationOrigin();

    expect(origin.kind).toBe('current_location');
  });

  it('falls back to canonical B2 place when permission is denied', async () => {
    resolveCurrentLocation.mockResolvedValue({
      ok: false,
      coordinate: null,
      source: null,
      permissionState: { ...permissionState, granted: false },
      message: 'denied',
    });

    const origin = await resolveNavigationOrigin();

    expect(origin).toEqual({ kind: 'fallback_place', place: B2_PLACE });
    expect(getPlaceById).toHaveBeenCalledWith('B2');
  });

  it('falls back to canonical B2 place when location services are off', async () => {
    resolveCurrentLocation.mockResolvedValue({
      ok: false,
      coordinate: null,
      source: null,
      permissionState: { ...permissionState, servicesEnabled: false },
      message: 'services off',
    });

    const origin = await resolveNavigationOrigin();

    expect(origin.kind).toBe('fallback_place');
  });

  it('falls back to canonical B2 place when there is no fix', async () => {
    resolveCurrentLocation.mockResolvedValue({
      ok: false,
      coordinate: null,
      source: null,
      permissionState,
      message: 'no fix',
    });

    const origin = await resolveNavigationOrigin();

    expect(origin.kind).toBe('fallback_place');
  });

  it('falls back to canonical B2 place when the resolved location is invalid despite ok:true', async () => {
    resolveCurrentLocation.mockResolvedValue({
      ok: true,
      coordinate: null,
      source: 'live',
      permissionState,
      message: null,
    });

    const origin = await resolveNavigationOrigin();

    expect(origin.kind).toBe('fallback_place');
  });

  it('throws rather than inventing coordinates when the canonical B2 place is missing from location data', async () => {
    resolveCurrentLocation.mockResolvedValue({
      ok: false,
      coordinate: null,
      source: null,
      permissionState,
      message: 'no fix',
    });
    getPlaceById.mockReturnValue(null);

    await expect(resolveNavigationOrigin()).rejects.toThrow(/B2/);
  });

  it('passes allowPrompt through to the accepted-location service', async () => {
    resolveCurrentLocation.mockResolvedValue({
      ok: false,
      coordinate: null,
      source: null,
      permissionState,
      message: 'no fix',
    });

    await resolveNavigationOrigin(false);

    expect(resolveCurrentLocation).toHaveBeenCalledWith(false);
  });
});

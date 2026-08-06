/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { resolveBaseMapMode } from '../services/BaseMapModeResolver';

const validTiles = {
  offlineDataDownloaded: true,
  offlineMapStatus: 'downloaded' as const,
};

describe('resolveBaseMapMode', () => {
  test('online with a usable Google map selects Google', () => {
    expect(resolveBaseMapMode({
      hasGoogleMapsKey: true,
      hasInternet: true,
      googleMapLoadFailed: false,
      ...validTiles,
    })).toBe('GOOGLE_BASEMAP');
  });

  test('offline with valid downloaded tiles selects LocalTile', () => {
    expect(resolveBaseMapMode({
      hasGoogleMapsKey: true,
      hasInternet: false,
      googleMapLoadFailed: false,
      ...validTiles,
    })).toBe('LOCAL_TILES');
  });

  test('online with no Google key falls back to valid downloaded tiles', () => {
    expect(resolveBaseMapMode({
      hasGoogleMapsKey: false,
      hasInternet: true,
      googleMapLoadFailed: false,
      ...validTiles,
    })).toBe('LOCAL_TILES');
  });

  test('online Google load failure falls back to valid downloaded tiles', () => {
    expect(resolveBaseMapMode({
      hasGoogleMapsKey: true,
      hasInternet: true,
      googleMapLoadFailed: true,
      ...validTiles,
    })).toBe('LOCAL_TILES');
  });

  test('no usable Google map and no tiles selects graph-only warning mode', () => {
    expect(resolveBaseMapMode({
      hasGoogleMapsKey: false,
      hasInternet: true,
      googleMapLoadFailed: false,
      offlineDataDownloaded: false,
      offlineMapStatus: 'not_downloaded',
    })).toBe('GRAPH_ONLY');
  });

  test.each(['corrupt', 'needs_update'] as const)('%s tiles are not valid fallback data', (offlineMapStatus) => {
    expect(resolveBaseMapMode({
      hasGoogleMapsKey: false,
      hasInternet: true,
      googleMapLoadFailed: false,
      offlineDataDownloaded: true,
      offlineMapStatus,
    })).toBe('GRAPH_ONLY');
  });

  test('returning online restores Google after a failure latch is reset', () => {
    const common = {
      hasGoogleMapsKey: true,
      hasInternet: true,
      ...validTiles,
    };
    expect(resolveBaseMapMode({ ...common, googleMapLoadFailed: true })).toBe('LOCAL_TILES');
    expect(resolveBaseMapMode({ ...common, googleMapLoadFailed: false })).toBe('GOOGLE_BASEMAP');
  });
});

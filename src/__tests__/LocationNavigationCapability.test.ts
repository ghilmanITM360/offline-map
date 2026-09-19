/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { evaluateNavigationLocationCapability } from '../services/LocationNavigationCapability';

const nowMs = 1_790_000_000_000;

describe('evaluateNavigationLocationCapability', () => {
  it.each([
    ['manual_place', 'Choose a current precise location before starting live navigation. Route preview remains available.'],
    ['remembered_location', 'Last known location cannot drive live navigation. Route preview remains available.'],
    ['device_last_known', 'Last known location cannot drive live navigation. Route preview remains available.'],
  ] as const)('LOC-10: keeps %s routes preview-only', (startSource, message) => {
    expect(evaluateNavigationLocationCapability({
      startSource,
      coordinate: { latitude: 24.96, longitude: 67.01, accuracy: 8, observedAtMs: nowMs },
      nowMs,
    })).toEqual({ canStart: false, message });
  });

  it('LOC-09: keeps an approximate or weak fix preview-only', () => {
    expect(evaluateNavigationLocationCapability({
      startSource: 'live_gps',
      coordinate: { latitude: 24.96, longitude: 67.01, accuracy: 500, observedAtMs: nowMs },
      nowMs,
    })).toEqual({
      canStart: false,
      message: 'Precise location is required for live navigation. Route preview remains available.',
    });
  });

  it('LOC-04: reports searching when permission and services may be ready but no fix exists', () => {
    expect(evaluateNavigationLocationCapability({ startSource: 'live_gps', coordinate: null, nowMs })).toEqual({
      canStart: false,
      message: 'Searching for a current location. Route preview remains available.',
    });
  });

  it('LOC-05: rejects a stale live fix', () => {
    expect(evaluateNavigationLocationCapability({
      startSource: 'live_gps',
      coordinate: { latitude: 24.96, longitude: 67.01, accuracy: 8, observedAtMs: nowMs - 30_001 },
      nowMs,
    })).toEqual({
      canStart: false,
      message: 'Current location is stale. Wait for a fresh fix before starting live navigation.',
    });
  });

  it('LOC-06: permits a fresh precise live fix', () => {
    expect(evaluateNavigationLocationCapability({
      startSource: 'live_gps',
      coordinate: { latitude: 24.96, longitude: 67.01, accuracy: 8, observedAtMs: nowMs - 1_000 },
      nowMs,
    })).toEqual({ canStart: true, message: '' });
  });
});

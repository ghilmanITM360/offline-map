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

  it('LOC-07: keeps coarse permission preview-only even with a small reported accuracy', () => {
    expect(evaluateNavigationLocationCapability({
      startSource: 'live_gps',
      precision: 'coarse',
      coordinate: { latitude: 24.96, longitude: 67.01, accuracy: 5, observedAtMs: nowMs },
      nowMs,
    })).toEqual({
      canStart: false,
      message: 'Precise location is required for reliable walking navigation inside Ijtima.',
    });
  });

  it('LOC-06: fine permission with a fresh accurate fix can start live navigation', () => {
    expect(evaluateNavigationLocationCapability({
      startSource: 'live_gps',
      precision: 'fine',
      coordinate: { latitude: 24.96, longitude: 67.01, accuracy: 8, observedAtMs: nowMs },
      nowMs,
    })).toEqual({ canStart: true, message: '' });
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

  // #139: a coordinate hydrated from storage after process death must never start live navigation.
  it('#139: rejects an hours-old hydrated fix and a fix with no timestamp at all', () => {
    const stale = evaluateNavigationLocationCapability({
      startSource: 'live_gps',
      coordinate: { latitude: 24.96, longitude: 67.01, accuracy: 8, observedAtMs: nowMs - 3_600_000 },
      nowMs,
    });
    const untimed = evaluateNavigationLocationCapability({
      startSource: 'live_gps',
      coordinate: { latitude: 24.96, longitude: 67.01, accuracy: 8 },
      nowMs,
    });
    const staleResult = {
      canStart: false,
      message: 'Current location is stale. Wait for a fresh fix before starting live navigation.',
    };
    expect(stale).toEqual(staleResult);
    expect(untimed).toEqual(staleResult);
  });

  it('#139: the 30 s freshness boundary is inclusive', () => {
    expect(evaluateNavigationLocationCapability({
      startSource: 'live_gps',
      coordinate: { latitude: 24.96, longitude: 67.01, accuracy: 8, observedAtMs: nowMs - 30_000 },
      nowMs,
    }).canStart).toBe(true);
  });

  it.each([
    ['one millisecond in the future', nowMs + 1],
    ['one hour in the future', nowMs + 3_600_000],
    ['NaN', Number.NaN],
    ['positive infinity', Number.POSITIVE_INFINITY],
    ['negative infinity', Number.NEGATIVE_INFINITY],
  ])('rejects a live fix timestamp %s', (_label, observedAtMs) => {
    expect(evaluateNavigationLocationCapability({
      startSource: 'live_gps',
      coordinate: { latitude: 24.96, longitude: 67.01, accuracy: 8, observedAtMs },
      nowMs,
    })).toEqual({
      canStart: false,
      message: 'Current location is stale. Wait for a fresh fix before starting live navigation.',
    });
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    'rejects an invalid current clock %s', (invalidNowMs) => {
      expect(evaluateNavigationLocationCapability({
        startSource: 'live_gps',
        coordinate: { latitude: 24.96, longitude: 67.01, accuracy: 8, observedAtMs: nowMs },
        nowMs: invalidNowMs,
      }).canStart).toBe(false);
    },
  );
});

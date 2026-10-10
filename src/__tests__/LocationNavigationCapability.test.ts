/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { evaluateNavigationLocationCapability, resolveStartAction } from '../services/LocationNavigationCapability';

const nowMs = 1_790_000_000_000;

describe('evaluateNavigationLocationCapability', () => {
  it.each([
    ['manual_place', 'Turn on your location to get live directions.'],
    ['remembered_location', 'Your saved location is old. Use your current location for live directions.'],
    ['device_last_known', 'Your saved location is old. Use your current location for live directions.'],
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
      message: 'Turn on exact location in Settings for live directions.',
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
      precision: 'fine',
      coordinate: { latitude: 24.96, longitude: 67.01, accuracy: 500, observedAtMs: nowMs },
      nowMs,
    })).toEqual({
      canStart: false,
      message: "Your location isn't exact enough yet. Move to an open area.",
    });
  });

  it('LOC-04: reports searching when permission and services may be ready but no fix exists', () => {
    expect(evaluateNavigationLocationCapability({ startSource: 'live_gps', precision: 'fine', coordinate: null, nowMs })).toEqual({
      canStart: false,
      message: 'Finding your location…',
    });
  });

  it('LOC-05: rejects a stale live fix', () => {
    expect(evaluateNavigationLocationCapability({
      startSource: 'live_gps',
      precision: 'fine',
      coordinate: { latitude: 24.96, longitude: 67.01, accuracy: 8, observedAtMs: nowMs - 30_001 },
      nowMs,
    })).toEqual({
      canStart: false,
      message: 'Finding your location…',
    });
  });

  it('LOC-06: permits a fresh precise live fix', () => {
    expect(evaluateNavigationLocationCapability({
      startSource: 'live_gps',
      precision: 'fine',
      coordinate: { latitude: 24.96, longitude: 67.01, accuracy: 8, observedAtMs: nowMs - 1_000 },
      nowMs,
    })).toEqual({ canStart: true, message: '' });
  });

  // #139: a coordinate hydrated from storage after process death must never start live navigation.
  it('#139: rejects an hours-old hydrated fix and a fix with no timestamp at all', () => {
    const stale = evaluateNavigationLocationCapability({
      startSource: 'live_gps',
      precision: 'fine',
      coordinate: { latitude: 24.96, longitude: 67.01, accuracy: 8, observedAtMs: nowMs - 3_600_000 },
      nowMs,
    });
    const untimed = evaluateNavigationLocationCapability({
      startSource: 'live_gps',
      precision: 'fine',
      coordinate: { latitude: 24.96, longitude: 67.01, accuracy: 8 },
      nowMs,
    });
    const staleResult = {
      canStart: false,
      message: 'Finding your location…',
    };
    expect(stale).toEqual(staleResult);
    expect(untimed).toEqual(staleResult);
  });

  it('#139: the 30 s freshness boundary is inclusive', () => {
    expect(evaluateNavigationLocationCapability({
      startSource: 'live_gps',
      precision: 'fine',
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
      precision: 'fine',
      coordinate: { latitude: 24.96, longitude: 67.01, accuracy: 8, observedAtMs },
      nowMs,
    })).toEqual({
      canStart: false,
      message: 'Finding your location…',
    });
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    'rejects an invalid current clock %s', (invalidNowMs) => {
      expect(evaluateNavigationLocationCapability({
        startSource: 'live_gps',
      precision: 'fine',
        coordinate: { latitude: 24.96, longitude: 67.01, accuracy: 8, observedAtMs: nowMs },
        nowMs: invalidNowMs,
      }).canStart).toBe(false);
    },
  );
});

describe('resolveStartAction (zero-thinking start CTA)', () => {
  const nearFix = { latitude: 24.96001, longitude: 67.01001, accuracy: 8, observedAtMs: nowMs };
  const base = { startSource: 'manual_place', permission: { granted: true, precision: 'fine' }, nowMs } as const;

  it('1: manual start with no fix offers an enabled Start route (route guide), live guidance as the secondary', () => {
    expect(resolveStartAction({ ...base, liveFix: null })).toMatchObject({ kind: 'route_guide', primaryLabel: 'Start route', secondaryLabel: 'Use my location to guide me' });
  });

  it('2: location denied never blocks a manual route; a live-location start offers turn-on-location', () => {
    const denied = { granted: false, precision: 'none' } as const;
    expect(resolveStartAction({ ...base, liveFix: null, permission: denied })).toMatchObject({ kind: 'route_guide', primaryLabel: 'Start route', secondaryLabel: 'Use my location to guide me' });
    expect(resolveStartAction({ ...base, startSource: 'live_gps', liveFix: null, permission: denied }))
      .toMatchObject({ kind: 'turn_on_location', primaryLabel: 'Turn on location & start' });
  });

  it('3: a manual start stays a route guide even with a perfect fix: the FROM the user chose is respected, live guidance is one tap away', () => {
    expect(resolveStartAction({ ...base, liveFix: nearFix })).toMatchObject({ kind: 'route_guide', primaryLabel: 'Start route', secondaryLabel: 'Use my location to guide me' });
  });

  it('5: approximate permission never satisfies the precise gate, even with a good-looking fix', () => {
    expect(resolveStartAction({ ...base, startSource: 'live_gps', liveFix: nearFix, permission: { granted: true, precision: 'coarse' } }))
      .toMatchObject({ kind: 'precise_location', primaryLabel: 'Turn on precise location' });
  });

  it('5b: an inaccurate or stale live fix is retried rather than trusted', () => {
    const live = { ...base, startSource: 'live_gps' } as const;
    expect(resolveStartAction({ ...live, liveFix: { ...nearFix, accuracy: 500 } }).kind).toBe('use_location');
    expect(resolveStartAction({ ...live, liveFix: { ...nearFix, observedAtMs: nowMs - 60_000 } }).kind).toBe('use_location');
  });

  it('9: a remembered / last-known start never counts as live GPS: it is a route guide', () => {
    expect(resolveStartAction({ ...base, startSource: 'remembered_location', liveFix: nearFix }).kind).toBe('route_guide');
    expect(resolveStartAction({ ...base, startSource: 'device_last_known', liveFix: nearFix }).kind).toBe('route_guide');
  });

  it('a live GPS start with a valid fix keeps the plain Start Navigation', () => {
    expect(resolveStartAction({ ...base, startSource: 'live_gps', liveFix: nearFix })).toMatchObject({ kind: 'start', primaryLabel: 'Start Navigation' });
  });

  it('every state keeps the primary enabled and never mentions technical wording', () => {
    for (const startSource of ['manual_place', 'live_gps'] as const) {
      for (const liveFix of [null, nearFix]) {
        const action = resolveStartAction({ ...base, startSource, liveFix });
        expect(action.primaryLabel.length).toBeGreaterThan(0);
        expect(JSON.stringify(action)).not.toMatch(/precise location is required|manual_place|capability|preview remains|not near/i);
      }
    }
  });
});

it.each([undefined, 'none'] as const)('unknown precision %s cannot authorize live navigation', precision => {
  expect(evaluateNavigationLocationCapability({ startSource: 'live_gps', precision, coordinate: { latitude: 24.96, longitude: 67.01, accuracy: 5, observedAtMs: nowMs }, nowMs }).canStart).toBe(false);
});

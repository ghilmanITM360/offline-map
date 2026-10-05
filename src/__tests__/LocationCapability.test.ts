import { classifyLiveFix, evaluateLocationCapability, liveBlockerMessage } from '../services/LocationCapability';
import type { Coordinate } from '../models/types';

const NOW = 1_700_000_000_000;
const fix = (over: Partial<Coordinate> = {}): Coordinate => ({
  latitude: 24.965, longitude: 67.006, accuracy: 8, observedAtMs: NOW - 2_000, ...over,
});
const granted = (over: Record<string, unknown> = {}) => ({
  granted: true, canAskAgain: true, precision: 'fine' as const, servicesState: 'enabled' as const, ...over,
});
const denied = (canAskAgain: boolean) => ({ granted: false, canAskAgain, precision: 'none' as const, servicesState: 'enabled' as const });

describe('classifyLiveFix', () => {
  it('is none without a coordinate', () => expect(classifyLiveFix(null, NOW)).toBe('none'));
  it('is usable at exactly 50 m and 30 s', () => {
    expect(classifyLiveFix(fix({ accuracy: 50, observedAtMs: NOW - 30_000 }), NOW)).toBe('usable');
  });
  it('is unusable above 50 m or without a reported accuracy', () => {
    expect(classifyLiveFix(fix({ accuracy: 51 }), NOW)).toBe('unusable');
    expect(classifyLiveFix(fix({ accuracy: undefined }), NOW)).toBe('unusable');
  });
  it('is stale past 30 s, without a timestamp, or with a future timestamp (fail closed)', () => {
    expect(classifyLiveFix(fix({ observedAtMs: NOW - 30_001 }), NOW)).toBe('stale');
    expect(classifyLiveFix(fix({ observedAtMs: undefined }), NOW)).toBe('stale');
    expect(classifyLiveFix(fix({ observedAtMs: NOW + 5 }), NOW)).toBe('stale');
  });
});

describe('evaluateLocationCapability keeps permission, accuracy, services and fix independent (#307)', () => {
  it('denied permission blocks live guidance but never the route guide', () => {
    const c = evaluateLocationCapability({ permission: denied(true), liveFix: null, nowMs: NOW });
    expect(c).toMatchObject({ permission: 'denied', accuracy: 'unknown', fix: 'none', liveBlocker: 'permission_needed', mode: 'route_guide', routeGuideAvailable: true });
  });

  it('a permission that cannot be asked again is a different blocker (needs Settings)', () => {
    expect(evaluateLocationCapability({ permission: denied(false), liveFix: null, nowMs: NOW }).liveBlocker).toBe('permission_blocked');
  });

  it('approximate-only never behaves as live navigation, even with a pristine fix', () => {
    const c = evaluateLocationCapability({ permission: granted({ precision: 'coarse' }), liveFix: fix(), nowMs: NOW });
    expect(c).toMatchObject({ permission: 'granted', accuracy: 'approximate', fix: 'usable', liveBlocker: 'approximate_only', mode: 'route_guide' });
  });

  it('device location services off is its own blocker, separate from permission and fix', () => {
    const c = evaluateLocationCapability({ permission: granted({ servicesState: 'disabled' }), liveFix: null, nowMs: NOW });
    expect(c).toMatchObject({ permission: 'granted', services: 'disabled', liveBlocker: 'services_off', mode: 'route_guide' });
  });

  it('unknown services state is not treated as off', () => {
    const c = evaluateLocationCapability({ permission: granted({ servicesState: 'unknown' }), liveFix: fix(), nowMs: NOW });
    expect(c.services).toBe('unknown');
    expect(c.liveBlocker).toBeNull();
  });

  it('distinguishes no fix, acquiring, stale and weak fixes', () => {
    const base = { permission: granted(), nowMs: NOW };
    expect(evaluateLocationCapability({ ...base, liveFix: null }).liveBlocker).toBe('no_fix');
    expect(evaluateLocationCapability({ ...base, liveFix: null, acquiring: true })).toMatchObject({ fix: 'acquiring', liveBlocker: 'acquiring' });
    expect(evaluateLocationCapability({ ...base, liveFix: fix({ observedAtMs: NOW - 60_000 }) })).toMatchObject({ fix: 'stale', liveBlocker: 'stale_fix' });
    expect(evaluateLocationCapability({ ...base, liveFix: fix({ accuracy: 90 }) })).toMatchObject({ fix: 'unusable', liveBlocker: 'weak_fix' });
  });

  it('a fresh precise fix with permission and services on is live navigation with no blocker', () => {
    const c = evaluateLocationCapability({ permission: granted(), liveFix: fix(), nowMs: NOW });
    expect(c).toMatchObject({ accuracy: 'precise', fix: 'usable', liveBlocker: null, mode: 'live_navigation', routeGuideAvailable: true });
  });

  it('accuracy not yet read (store default) does not block a usable fix but is not claimed precise', () => {
    const c = evaluateLocationCapability({ permission: granted({ precision: 'none' }), liveFix: fix(), nowMs: NOW });
    expect(c.accuracy).toBe('unknown');
    expect(c.liveBlocker).toBeNull();
  });

  it('route guide is available in every state', () => {
    for (const permission of [denied(true), denied(false), granted({ precision: 'coarse' }), granted({ servicesState: 'disabled' }), granted()]) {
      expect(evaluateLocationCapability({ permission, liveFix: null, nowMs: NOW }).routeGuideAvailable).toBe(true);
    }
  });
});

describe('liveBlockerMessage', () => {
  it('speaks plainly and never leaks internal terms', () => {
    const blockers = ['permission_needed', 'permission_blocked', 'approximate_only', 'services_off', 'acquiring', 'no_fix', 'stale_fix', 'weak_fix'] as const;
    for (const b of blockers) {
      const m = liveBlockerMessage(b);
      expect(m.length).toBeGreaterThan(8);
      expect(m).not.toMatch(/manual_place|capability|provider|fix\b|preview/i);
    }
  });
});

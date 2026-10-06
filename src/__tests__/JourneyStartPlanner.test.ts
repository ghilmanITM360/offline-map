import { planDestinationTap } from '../services/JourneyStartPlanner';
import { evaluateLocationCapability } from '../services/LocationCapability';
import type { Coordinate, Place } from '../models/types';

const NOW = 1_700_000_000_000;
const fresh: Coordinate = { latitude: 24.965, longitude: 67.006, accuracy: 8, observedAtMs: NOW - 1_000 };
const start = { id: 'B9', name: 'Block 9' } as Place;
const granted = { granted: true, canAskAgain: true, precision: 'fine' as const, servicesState: 'enabled' as const };
const cap = (permission: Parameters<typeof evaluateLocationCapability>[0]['permission'], liveFix: Coordinate | null = null) =>
  evaluateLocationCapability({ permission, liveFix, nowMs: NOW });

describe('planDestinationTap: what a destination tap in the Directory should do (#307)', () => {
  it('A: a fresh usable live fix starts live navigation directly', () => {
    expect(planDestinationTap({ capability: cap(granted, fresh), knownStart: null })).toEqual({ kind: 'live' });
  });

  it('A: live wins even when a manual start is remembered (the user is here, so guide from here)', () => {
    expect(planDestinationTap({ capability: cap(granted, fresh), knownStart: start })).toEqual({ kind: 'live' });
  });

  it('B: permission and precision are fine but no fix yet: try to find the location (bounded by the sheet), do not ask', () => {
    expect(planDestinationTap({ capability: cap(granted, null), knownStart: null })).toEqual({ kind: 'live' });
    expect(planDestinationTap({ capability: cap(granted, { ...fresh, observedAtMs: NOW - 60_000 }), knownStart: null })).toEqual({ kind: 'live' });
    expect(planDestinationTap({ capability: cap(granted, { ...fresh, accuracy: 90 }), knownStart: null })).toEqual({ kind: 'live' });
  });

  it('C: no usable live location but a manual start is known: route guide from it', () => {
    expect(planDestinationTap({ capability: cap({ ...granted, granted: false }), knownStart: start })).toEqual({ kind: 'guide', start });
    expect(planDestinationTap({ capability: cap({ ...granted, precision: 'coarse' }, fresh), knownStart: start })).toEqual({ kind: 'guide', start });
  });

  it('D: no usable live location and no start: ask where the user is starting from', () => {
    expect(planDestinationTap({ capability: cap({ ...granted, granted: false }), knownStart: null })).toEqual({ kind: 'ask_start' });
    expect(planDestinationTap({ capability: cap({ ...granted, precision: 'coarse' }, fresh), knownStart: null })).toEqual({ kind: 'ask_start' });
    expect(planDestinationTap({ capability: cap({ ...granted, servicesState: 'disabled' }), knownStart: null })).toEqual({ kind: 'ask_start' });
  });

  it('E: a refusal is respected: permission blocked for good still just asks for a start, never routes to Settings', () => {
    expect(planDestinationTap({ capability: cap({ ...granted, granted: false, canAskAgain: false }), knownStart: null })).toEqual({ kind: 'ask_start' });
  });
});

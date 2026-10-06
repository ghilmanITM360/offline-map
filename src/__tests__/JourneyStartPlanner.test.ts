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
    expect(planDestinationTap({ capability: cap(granted, fresh) })).toEqual({ kind: 'live' });
  });

  it('B: permission and precision are fine but no fix yet: try to find the location (bounded by the sheet), do not ask', () => {
    expect(planDestinationTap({ capability: cap(granted, null) })).toEqual({ kind: 'live' });
    expect(planDestinationTap({ capability: cap(granted, { ...fresh, observedAtMs: NOW - 60_000 }) })).toEqual({ kind: 'live' });
    expect(planDestinationTap({ capability: cap(granted, { ...fresh, accuracy: 90 }) })).toEqual({ kind: 'live' });
  });

  it('C: a start from an earlier journey is never inherited: with no usable live location the user is asked', () => {
    // The Directory no longer reads any remembered start; an extra stale one passed by an old caller changes nothing.
    const stale = { capability: cap({ ...granted, granted: false }), knownStart: start } as unknown as Parameters<typeof planDestinationTap>[0];
    expect(planDestinationTap(stale)).toEqual({ kind: 'ask_start' });
  });

  it('D: no usable live location and no start: ask where the user is starting from', () => {
    expect(planDestinationTap({ capability: cap({ ...granted, granted: false }) })).toEqual({ kind: 'ask_start' });
    expect(planDestinationTap({ capability: cap({ ...granted, precision: 'coarse' }, fresh) })).toEqual({ kind: 'ask_start' });
    expect(planDestinationTap({ capability: cap({ ...granted, servicesState: 'disabled' }) })).toEqual({ kind: 'ask_start' });
  });

  it('E: a refusal is respected: permission blocked for good still just asks for a start, never routes to Settings', () => {
    expect(planDestinationTap({ capability: cap({ ...granted, granted: false, canAskAgain: false }) })).toEqual({ kind: 'ask_start' });
  });
});

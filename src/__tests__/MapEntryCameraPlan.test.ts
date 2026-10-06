/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { MapStartupController, FALLBACK_LOCATION_NOTICE } from '../services/MapStartupController';

// #222 camera rules for a Map entry with no destination and no active route: where the camera goes
// is decided by one pure function, from the location decision MapStartupController already makes.
const inside = { latitude: 24.9656, longitude: 67.0072 };
const outside = { latitude: 24.8607, longitude: 67.0011 };
const isInsideVenue = (c: { latitude: number; longitude: number }) => c.latitude > 24.963 && c.latitude < 24.9758 && c.longitude > 66.9974 && c.longitude < 67.0155;

describe('#222 MapStartupController.planEntryCamera', () => {
  it('valid location inside the Ijtema: grounds overview with the user shown, not a zoom onto the dot', () => {
    const plan = MapStartupController.planEntryCamera(
      { action: 'ANIMATE_TO_USER', coordinate: inside, source: 'live' },
      isInsideVenue,
    );

    expect(plan).toEqual({ kind: 'VENUE_OVERVIEW', reason: 'user_in_venue', user: { coordinate: inside, source: 'live' } });
  });

  it('valid location outside the Ijtema: venue context, the user is still recorded so the outside status can show', () => {
    const plan = MapStartupController.planEntryCamera(
      { action: 'ANIMATE_TO_USER', coordinate: outside, source: 'live' },
      isInsideVenue,
    );

    expect(plan).toEqual({ kind: 'VENUE_OVERVIEW', reason: 'user_outside', user: { coordinate: outside, source: 'live' } });
  });

  it('first install keeps the grounds overview with no user claim', () => {
    expect(MapStartupController.planEntryCamera({ action: 'FIT_VENUE_BOUNDS', reason: 'first_overview' }, isInsideVenue)).toEqual({
      kind: 'VENUE_OVERVIEW',
      reason: 'first_overview',
    });
  });

  it('no valid location: falls back to the verified Block 2 entity with an explicit not-GPS notice', () => {
    const plan = MapStartupController.planEntryCamera({ action: 'FIT_VENUE_BOUNDS', reason: 'no_gps' }, isInsideVenue);

    if (plan.kind !== 'FALLBACK_ANCHOR') throw new Error('expected FALLBACK_ANCHOR');
    expect(plan.anchor.id).toBe('B2');
    expect(plan.anchor.name).toBe('Block 2');
    expect(plan.anchor.coordinate).toEqual({ latitude: 24.9685, longitude: 66.9999167 });
    expect(plan.notice).toBe(FALLBACK_LOCATION_NOTICE);
    expect(FALLBACK_LOCATION_NOTICE).toBe("We can't find where you are. Showing the main area.");
  });

  it('the fallback is never represented as a detected location and never uses the legacy Masjid coordinate', () => {
    const plan = MapStartupController.planEntryCamera({ action: 'FIT_VENUE_BOUNDS', reason: 'no_gps' }, isInsideVenue);

    expect(plan).not.toHaveProperty('user');
    if (plan.kind !== 'FALLBACK_ANCHOR') throw new Error('expected FALLBACK_ANCHOR');
    expect(plan.anchor.coordinate).not.toEqual({ latitude: 24.9682, longitude: 67.003 });
    expect(JSON.stringify(plan)).not.toMatch(/mimbar|minbar|masjid/i);
  });
});

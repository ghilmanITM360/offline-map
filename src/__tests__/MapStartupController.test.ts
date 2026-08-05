/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { MapStartupController, FreshLocationResolution } from '../services/MapStartupController';

const liveCoordinate = { latitude: 24.965, longitude: 67.005 };
const staleRememberedCoordinate = { latitude: 24.9, longitude: 67.0 };

function resolverReturning(result: FreshLocationResolution, delayMs = 0) {
  return jest.fn(
    () =>
      new Promise<FreshLocationResolution>((resolve) => {
        if (delayMs === 0) {
          resolve(result);
        } else {
          setTimeout(() => resolve(result), delayMs);
        }
      }),
  );
}

describe('MapStartupController.resolveReturningLaunchCamera', () => {
  it('1. first install + GPS: venue overview remains the first camera move, resolver never consulted', async () => {
    const resolveFreshLocation = resolverReturning({ ok: true, coordinate: liveCoordinate, source: 'live' });

    const decision = await MapStartupController.resolveReturningLaunchCamera(
      { hasSeenMapOverview: false, hasLocationPermission: true },
      resolveFreshLocation,
    );

    expect(decision).toEqual({ action: 'FIT_VENUE_BOUNDS', reason: 'first_overview' });
    expect(resolveFreshLocation).not.toHaveBeenCalled();
  });

  it('2. returning launch + fresh live fix: animates to the live coordinate', async () => {
    const resolveFreshLocation = resolverReturning({ ok: true, coordinate: liveCoordinate, source: 'live' });

    const decision = await MapStartupController.resolveReturningLaunchCamera(
      { hasSeenMapOverview: true, hasLocationPermission: true },
      resolveFreshLocation,
    );

    expect(decision).toEqual({ action: 'ANIMATE_TO_USER', coordinate: liveCoordinate });
  });

  it('3. returning launch + only a device-cached ("remembered") fix: falls back to venue overview, does not auto-focus it', async () => {
    const resolveFreshLocation = resolverReturning({
      ok: true,
      coordinate: staleRememberedCoordinate,
      source: 'device_last_known',
    });

    const decision = await MapStartupController.resolveReturningLaunchCamera(
      { hasSeenMapOverview: true, hasLocationPermission: true },
      resolveFreshLocation,
    );

    expect(decision).toEqual({ action: 'FIT_VENUE_BOUNDS', reason: 'no_gps' });
  });

  it('4. an explicit "remembered" source is likewise never auto-animated — stays excluded from the automatic path', async () => {
    const resolveFreshLocation = resolverReturning({
      ok: true,
      coordinate: staleRememberedCoordinate,
      source: 'remembered',
    });

    const decision = await MapStartupController.resolveReturningLaunchCamera(
      { hasSeenMapOverview: true, hasLocationPermission: true },
      resolveFreshLocation,
    );

    expect(decision.action).toBe('FIT_VENUE_BOUNDS');
  });

  it('5. a fresh live fix that resolves after a delay still correctly animates once it arrives', async () => {
    const resolveFreshLocation = resolverReturning({ ok: true, coordinate: liveCoordinate, source: 'live' }, 50);

    const decision = await MapStartupController.resolveReturningLaunchCamera(
      { hasSeenMapOverview: true, hasLocationPermission: true },
      resolveFreshLocation,
    );

    expect(decision).toEqual({ action: 'ANIMATE_TO_USER', coordinate: liveCoordinate });
  });

  it('6. permission denied: venue overview, resolver never consulted', async () => {
    const resolveFreshLocation = resolverReturning({ ok: true, coordinate: liveCoordinate, source: 'live' });

    const decision = await MapStartupController.resolveReturningLaunchCamera(
      { hasSeenMapOverview: true, hasLocationPermission: false },
      resolveFreshLocation,
    );

    expect(decision).toEqual({ action: 'FIT_VENUE_BOUNDS', reason: 'no_gps' });
    expect(resolveFreshLocation).not.toHaveBeenCalled();
  });

  it('7. GPS disabled / resolution failure: falls back to venue overview', async () => {
    const resolveFreshLocation = resolverReturning({ ok: false, coordinate: null, source: null });

    const decision = await MapStartupController.resolveReturningLaunchCamera(
      { hasSeenMapOverview: true, hasLocationPermission: true },
      resolveFreshLocation,
    );

    expect(decision).toEqual({ action: 'FIT_VENUE_BOUNDS', reason: 'no_gps' });
  });

  it('8. never issues more than one location resolution per decision (no duplicate/racing camera command)', async () => {
    const resolveFreshLocation = resolverReturning({ ok: true, coordinate: liveCoordinate, source: 'live' });

    await MapStartupController.resolveReturningLaunchCamera(
      { hasSeenMapOverview: true, hasLocationPermission: true },
      resolveFreshLocation,
    );

    expect(resolveFreshLocation).toHaveBeenCalledTimes(1);
  });
});

describe('MapStartupController.resolveColdLaunchCamera (unchanged sync decision, still covered directly)', () => {
  it('first install always fits venue bounds regardless of GPS availability', () => {
    expect(
      MapStartupController.resolveColdLaunchCamera({
        hasSeenMapOverview: false,
        hasLocationPermission: true,
        gpsCoordinate: liveCoordinate,
      }),
    ).toEqual({ action: 'FIT_VENUE_BOUNDS', reason: 'first_overview' });
  });

  it('returning + permission + coordinate animates to that coordinate', () => {
    expect(
      MapStartupController.resolveColdLaunchCamera({
        hasSeenMapOverview: true,
        hasLocationPermission: true,
        gpsCoordinate: liveCoordinate,
      }),
    ).toEqual({ action: 'ANIMATE_TO_USER', coordinate: liveCoordinate });
  });

  it('returning + no coordinate falls back to venue bounds', () => {
    expect(
      MapStartupController.resolveColdLaunchCamera({
        hasSeenMapOverview: true,
        hasLocationPermission: true,
        gpsCoordinate: null,
      }),
    ).toEqual({ action: 'FIT_VENUE_BOUNDS', reason: 'no_gps' });
  });
});

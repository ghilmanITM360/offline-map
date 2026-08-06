/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { MapStartupController } from '../services/MapStartupController';
import type { LocationResolveResult } from '../services/LocationAccessService';

const liveCoordinate = { latitude: 24.965, longitude: 67.005 };
const staleRememberedCoordinate = { latitude: 24.9, longitude: 67.0 };

const basePermissionState: LocationResolveResult['permissionState'] = {
  granted: true,
  canAskAgain: true,
  status: 'granted' as any,
  servicesEnabled: true,
};

function resolverReturning(result: LocationResolveResult, delayMs = 0) {
  return jest.fn(
    () =>
      new Promise<LocationResolveResult>((resolve) => {
        if (delayMs === 0) {
          resolve(result);
        } else {
          setTimeout(() => resolve(result), delayMs);
        }
      }),
  );
}

function resolverRejecting(error: unknown, delayMs = 0) {
  return jest.fn(
    () =>
      new Promise<LocationResolveResult>((_resolve, reject) => {
        if (delayMs === 0) {
          reject(error);
        } else {
          setTimeout(() => reject(error), delayMs);
        }
      }),
  );
}

function resolverThatNeverSettles() {
  return jest.fn(() => new Promise<LocationResolveResult>(() => {}));
}

describe('MapStartupController.resolveReturningLaunchCamera', () => {
  it('1. first install + GPS: venue overview remains the first camera move, resolver never consulted', async () => {
    const resolveFreshLocation = resolverReturning({ ok: true, coordinate: liveCoordinate, source: 'live', permissionState: basePermissionState, message: null });

    const decision = await MapStartupController.resolveReturningLaunchCamera(
      { hasSeenMapOverview: false, hasLocationPermission: true },
      resolveFreshLocation,
    );

    expect(decision).toEqual({ action: 'FIT_VENUE_BOUNDS', reason: 'first_overview' });
    expect(resolveFreshLocation).not.toHaveBeenCalled();
  });

  it('2. returning launch + fresh live fix: animates to the live coordinate, tagged with the canonical live source', async () => {
    const resolveFreshLocation = resolverReturning({ ok: true, coordinate: liveCoordinate, source: 'live', permissionState: basePermissionState, message: null });

    const decision = await MapStartupController.resolveReturningLaunchCamera(
      { hasSeenMapOverview: true, hasLocationPermission: true },
      resolveFreshLocation,
    );

    expect(decision).toEqual({ action: 'ANIMATE_TO_USER', coordinate: liveCoordinate, source: 'live' });
  });

  it('3. returning launch + only a device-cached ("remembered") fix: falls back to venue overview, does not auto-focus it', async () => {
    const resolveFreshLocation = resolverReturning({
      ok: true,
      coordinate: staleRememberedCoordinate,
      source: 'device_last_known',
      permissionState: basePermissionState,
      message: 'Using device last known location.',
    });

    const decision = await MapStartupController.resolveReturningLaunchCamera(
      { hasSeenMapOverview: true, hasLocationPermission: true },
      resolveFreshLocation,
    );

    expect(decision).toEqual({ action: 'FIT_VENUE_BOUNDS', reason: 'no_gps' });
  });

  it('5. a fresh live fix that resolves after a delay still correctly animates once it arrives', async () => {
    const resolveFreshLocation = resolverReturning({ ok: true, coordinate: liveCoordinate, source: 'live', permissionState: basePermissionState, message: null }, 50);

    const decision = await MapStartupController.resolveReturningLaunchCamera(
      { hasSeenMapOverview: true, hasLocationPermission: true },
      resolveFreshLocation,
    );

    expect(decision).toEqual({ action: 'ANIMATE_TO_USER', coordinate: liveCoordinate, source: 'live' });
  });

  it('4. permission denied at the checks level: venue overview, resolver never consulted', async () => {
    const resolveFreshLocation = resolverReturning({ ok: true, coordinate: liveCoordinate, source: 'live', permissionState: basePermissionState, message: null });

    const decision = await MapStartupController.resolveReturningLaunchCamera(
      { hasSeenMapOverview: true, hasLocationPermission: false },
      resolveFreshLocation,
    );

    expect(decision).toEqual({ action: 'FIT_VENUE_BOUNDS', reason: 'no_gps' });
    expect(resolveFreshLocation).not.toHaveBeenCalled();
  });

  it('5. services disabled: normalizes to venue overview', async () => {
    const resolveFreshLocation = resolverReturning({
      ok: false,
      coordinate: null,
      source: null,
      permissionState: { ...basePermissionState, servicesEnabled: false },
      message: 'Device location is turned off.',
    });

    const decision = await MapStartupController.resolveReturningLaunchCamera(
      { hasSeenMapOverview: true, hasLocationPermission: true },
      resolveFreshLocation,
    );

    expect(decision).toEqual({ action: 'FIT_VENUE_BOUNDS', reason: 'no_gps' });
  });

  it('6. GPS unavailable / resolution failure (ok: false): normalizes to venue overview', async () => {
    const resolveFreshLocation = resolverReturning({ ok: false, coordinate: null, source: null, permissionState: basePermissionState, message: 'Current location unavailable.' });

    const decision = await MapStartupController.resolveReturningLaunchCamera(
      { hasSeenMapOverview: true, hasLocationPermission: true },
      resolveFreshLocation,
    );

    expect(decision).toEqual({ action: 'FIT_VENUE_BOUNDS', reason: 'no_gps' });
  });

  it('7. a rejected resolver promise is caught internally and normalizes to venue overview (never throws out of resolveReturningLaunchCamera)', async () => {
    const resolveFreshLocation = resolverRejecting(new Error('native module crashed'));

    await expect(
      MapStartupController.resolveReturningLaunchCamera(
        { hasSeenMapOverview: true, hasLocationPermission: true },
        resolveFreshLocation,
      ),
    ).resolves.toEqual({ action: 'FIT_VENUE_BOUNDS', reason: 'no_gps' });
  });

  it('8. a hung resolver that never settles falls back to venue overview once the bounded timeout elapses', async () => {
    jest.useFakeTimers();
    try {
      const resolveFreshLocation = resolverThatNeverSettles();

      const decisionPromise = MapStartupController.resolveReturningLaunchCamera(
        { hasSeenMapOverview: true, hasLocationPermission: true },
        resolveFreshLocation,
        1000,
      );

      await jest.advanceTimersByTimeAsync(1000);
      await expect(decisionPromise).resolves.toEqual({ action: 'FIT_VENUE_BOUNDS', reason: 'no_gps' });
      expect(jest.getTimerCount()).toBe(0); // no dangling timer/watcher left behind
    } finally {
      jest.useRealTimers();
    }
  });

  it('9. a malformed result (ok: true but no usable coordinate) normalizes to venue overview instead of animating to garbage', async () => {
    const resolveFreshLocation = resolverReturning({
      ok: true,
      coordinate: { latitude: Number.NaN, longitude: undefined as any } as any,
      source: 'live',
      permissionState: basePermissionState,
      message: null,
    });

    const decision = await MapStartupController.resolveReturningLaunchCamera(
      { hasSeenMapOverview: true, hasLocationPermission: true },
      resolveFreshLocation,
    );

    expect(decision).toEqual({ action: 'FIT_VENUE_BOUNDS', reason: 'no_gps' });
  });

  it('10. a resolver result arriving after the timeout is ignored — the caller already got the venue-overview fallback', async () => {
    jest.useFakeTimers();
    try {
      const resolveFreshLocation = resolverReturning({ ok: true, coordinate: liveCoordinate, source: 'live', permissionState: basePermissionState, message: null }, 5000);

      const decisionPromise = MapStartupController.resolveReturningLaunchCamera(
        { hasSeenMapOverview: true, hasLocationPermission: true },
        resolveFreshLocation,
        1000,
      );

      await jest.advanceTimersByTimeAsync(1000);
      await expect(decisionPromise).resolves.toEqual({ action: 'FIT_VENUE_BOUNDS', reason: 'no_gps' });

      // The resolver's own delayed resolution (at the 5s mark) must not throw, hang, or change
      // anything now that the caller has already moved on.
      await jest.advanceTimersByTimeAsync(4000);
      expect(jest.getTimerCount()).toBe(0);
    } finally {
      jest.useRealTimers();
    }
  });

  it('11. first-install short-circuit never starts a watcher/timer at all', async () => {
    jest.useFakeTimers();
    try {
      const resolveFreshLocation = resolverThatNeverSettles();
      await MapStartupController.resolveReturningLaunchCamera(
        { hasSeenMapOverview: false, hasLocationPermission: true },
        resolveFreshLocation,
      );
      expect(jest.getTimerCount()).toBe(0);
    } finally {
      jest.useRealTimers();
    }
  });

  it('12. never issues more than one location resolution per decision (no duplicate/racing camera command)', async () => {
    const resolveFreshLocation = resolverReturning({ ok: true, coordinate: liveCoordinate, source: 'live', permissionState: basePermissionState, message: null });

    await MapStartupController.resolveReturningLaunchCamera(
      { hasSeenMapOverview: true, hasLocationPermission: true },
      resolveFreshLocation,
    );

    expect(resolveFreshLocation).toHaveBeenCalledTimes(1);
  });

  it("13. the ANIMATE_TO_USER decision returns the canonical live payload (coordinate + source) HomeScreen's integration needs to commit marker/store state before animating", async () => {
    const resolveFreshLocation = resolverReturning({ ok: true, coordinate: liveCoordinate, source: 'live', permissionState: basePermissionState, message: null });

    const decision = await MapStartupController.resolveReturningLaunchCamera(
      { hasSeenMapOverview: true, hasLocationPermission: true },
      resolveFreshLocation,
    );

    if (decision.action !== 'ANIMATE_TO_USER') throw new Error('expected ANIMATE_TO_USER');
    expect(decision.coordinate).toEqual(liveCoordinate);
    expect(decision.source).toBe('live');
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

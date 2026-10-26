/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// C4.3-a: the host's reroute/arrival/staleness policy is now the SDK's. The REFERENCE_* functions below are the host's own formulas
// exactly as they were written before the delegation (RerouteService, constants/navigation); the delegated host functions must agree
// with them on a dense grid, so the migration cannot have changed a threshold.
import { readFileSync } from 'node:fs';
import {
  ARRIVAL_THRESHOLD_M, GPS_LOST_TIMEOUT_MS as SDK_GPS_LOST_TIMEOUT_MS, REROUTE_COOLDOWN_MS as SDK_REROUTE_COOLDOWN_MS,
  STALE_FIX_CLOCK_TOLERANCE_MS as SDK_STALE,
} from '@muslim-ummah/offline-navigation';
import { ARRIVAL_THRESHOLD_METERS, GPS_LOST_TIMEOUT_MS, STALE_FIX_CLOCK_TOLERANCE_MS } from '../constants/navigation';
import { RerouteService } from '../services/RerouteService';
import { shouldIgnorePoorAccuracyMovementV2 } from '../services/V2NavigationRuntimeService';

const REFERENCE_THRESHOLD = (gpsAccuracyM = 0): number => Math.min(80, Math.round(Math.max(30, gpsAccuracyM * 1.5)));
const REFERENCE_WEAK = (gpsAccuracyM = 0): boolean => gpsAccuracyM > 50;
const REFERENCE_SHOULD_REROUTE = (i: { consecutiveOffRouteCount: number; offRouteDurationMs: number; cooldownRemainingMs: number; movedDistanceSinceLastAcceptedM: number }): boolean => {
  if (i.cooldownRemainingMs > 0) return false;
  if (i.movedDistanceSinceLastAcceptedM < 12) return false;
  return i.consecutiveOffRouteCount >= 3 || i.offRouteDurationMs >= 9000;
};

describe('host policy = SDK policy (C4.3-a)', () => {
  it('off-route threshold agrees with the original formula for every accuracy from 0 to 200 m in 0.25 m steps', () => {
    for (let a = 0; a <= 200; a += 0.25) expect(RerouteService.getDynamicOffRouteThresholdMeters(a)).toBe(REFERENCE_THRESHOLD(a));
    expect(RerouteService.getDynamicOffRouteThresholdMeters()).toBe(30);
  });

  it('weak-GPS hold agrees at and around the 50 m boundary, and with the poor-accuracy movement rule', () => {
    for (const a of [0, 10, 49.9, 50, 50.0001, 51, 80, 400]) {
      expect(RerouteService.shouldHoldRouteForWeakGps(a)).toBe(REFERENCE_WEAK(a));
      expect(shouldIgnorePoorAccuracyMovementV2({ movedDistanceM: 3, accuracyM: a })).toBe(REFERENCE_WEAK(a));
    }
  });

  it('reroute evidence agrees on the full count x duration x cooldown x distance grid', () => {
    let checked = 0;
    for (const consecutiveOffRouteCount of [0, 1, 2, 3, 4, 10]) {
      for (const offRouteDurationMs of [0, 4000, 8999, 9000, 20_000]) {
        for (const cooldownRemainingMs of [0, 1, 24_999, 25_000]) {
          for (const movedDistanceSinceLastAcceptedM of [0, 11.99, 12, 40]) {
            const input = { consecutiveOffRouteCount, offRouteDurationMs, cooldownRemainingMs, movedDistanceSinceLastAcceptedM };
            expect(RerouteService.shouldTriggerReroute(input)).toBe(REFERENCE_SHOULD_REROUTE(input));
            checked += 1;
          }
        }
      }
    }
    expect(checked).toBe(6 * 5 * 4 * 4);
  });

  it('shared constants have the values the host always used', () => {
    expect(ARRIVAL_THRESHOLD_METERS).toBe(20);
    expect(ARRIVAL_THRESHOLD_M).toBe(20);
    expect(STALE_FIX_CLOCK_TOLERANCE_MS).toBe(2000);
    expect(SDK_STALE).toBe(2000);
    // The host derives GPS-lost from its own watcher cadence (8 x 1 s); the SDK states 8 s. They must stay equal.
    expect(GPS_LOST_TIMEOUT_MS).toBe(SDK_GPS_LOST_TIMEOUT_MS);
    expect(SDK_REROUTE_COOLDOWN_MS).toBe(25_000);
  });

  it('the view models still declare the cooldown the SDK declares (the literal is pinned by test:battery-v2)', () => {
    for (const file of ['src/viewmodels/NavigationViewModelV2.ts', 'src/viewmodels/NavigationViewModel.ts']) {
      expect(readFileSync(file, 'utf8')).toMatch(new RegExp(`REROUTE_COOLDOWN_MS = ${String(SDK_REROUTE_COOLDOWN_MS).replace(/(\d)(?=(\d{3})$)/, '$1_?')}`));
    }
  });
});

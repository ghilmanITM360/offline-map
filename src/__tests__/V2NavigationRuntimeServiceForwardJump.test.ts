/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { calculateNavigationProgressV2 } from '../services/V2NavigationRuntimeService';
import type { V2ActiveRoute } from '../models/types';

// NAV-P0-001 CASE D (pure-function): a straight ~2200m north-south route. calculateNavigationProgressV2
// is the same function NavigationViewModelV2's real per-fix effect calls, so this exercises the
// actual forward-jump-plausibility hardening (RerouteService.clampMonotonicProgress's
// maxForwardMeters) at the unit level, without needing a rendered hook.
describe('V2 progress forward-jump plausibility (NAV-P0-001 second defensive layer)', () => {
  const south = { latitude: 24.9762, longitude: 67.011 };
  const north = { latitude: 24.996, longitude: 67.011 }; // ~2223m due north of `south`
  const straightRoute = {
    coordinates: [south, north],
    totalDistanceM: 2223,
  } as unknown as V2ActiveRoute;

  test('a fresh but implausible outlier fix (good accuracy, huge same-second jump) is capped, not accepted whole', () => {
    const t0 = Date.now();
    const result = calculateNavigationProgressV2({
      route: straightRoute,
      coordinate: { ...north, accuracy: 15, observedAtMs: t0 + 1000 }, // 1s later, all the way at the far end
      previousProgressMeters: 0,
      walkingSpeedMs: 1.4,
      previousObservedAtMs: t0,
    });

    // Naive projection would put progress at ~totalDistanceM (2223m) in a single second — capped
    // to a physically plausible walking-speed-derived bound instead.
    expect(result.progressMeters).toBeLessThan(200);
    expect(result.remainingDistanceM).toBeGreaterThan(straightRoute.totalDistanceM - 200);
  });

  test('the same large jump IS accepted when the elapsed observed time actually justifies it', () => {
    const t0 = Date.now();
    const result = calculateNavigationProgressV2({
      route: straightRoute,
      coordinate: { ...north, accuracy: 15, observedAtMs: t0 + 20 * 60 * 1000 }, // 20 real minutes later
      previousProgressMeters: 0,
      walkingSpeedMs: 1.4,
      previousObservedAtMs: t0,
    });

    expect(result.progressMeters).toBeGreaterThan(2000);
    expect(result.remainingDistanceM).toBeLessThan(250);
  });

  test('no timestamp evidence on either side leaves the jump uncapped (pre-NAV-P0-001 behavior)', () => {
    const result = calculateNavigationProgressV2({
      route: straightRoute,
      coordinate: { ...north, accuracy: 15 },
      previousProgressMeters: 0,
      walkingSpeedMs: 1.4,
    });

    expect(result.progressMeters).toBeGreaterThan(2000);
  });
});

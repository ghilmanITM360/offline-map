import {
  advanceProgress, buildRouteSteps, findBestVenuePath, isArrivedAtDestination, locateStep, offRouteThresholdM,
  projectOnRoute, shouldTriggerReroute, buildRouteLine, ARRIVAL_THRESHOLD_M, REROUTE_COOLDOWN_MS,
  type RouteLine, type VenueCoordinate,
} from '@muslim-ummah/offline-navigation';
import { createSyntheticVenue } from '../../scripts/sdk-headless/syntheticVenue';

const venue = createSyntheticVenue();
const M_PER_DEG = 111_320;
// Offset a coordinate by metres north / east (local tangent plane, fine at this scale).
const offset = (from: VenueCoordinate, northM: number, eastM: number): VenueCoordinate => ({
  lat: from.lat + northM / M_PER_DEG,
  lng: from.lng + eastM / (M_PER_DEG * Math.cos((from.lat * Math.PI) / 180)),
});
const N1 = venue.graph.getNode('n/1')!.coordinate;
const N2 = venue.graph.getNode('n/2')!.coordinate;
const N3 = venue.graph.getNode('n/3')!.coordinate;

const route = findBestVenuePath(venue.graph, ['n/1'], ['n/3'])!; // n/1 -> n/2 (56 m) -> n/3 (61 m)
const line = buildRouteLine(route.nodes, route.edges, venue.graph)!;

describe('buildRouteLine', () => {
  it('uses the venue-surveyed edge lengths for the cumulative distances', () => {
    expect(line.points).toEqual([N1, N2, N3]);
    expect(line.cumulativeM).toEqual([0, 56, 117]);
    expect(line.totalM).toBe(117);
  });

  it('is undefined when a node has no coordinates, so a half-known route is never tracked', () => {
    expect(buildRouteLine(['n/1', 'ghost'], [{ to: 'ghost', distanceM: 10 }], venue.graph)).toBeUndefined();
  });

  it('is undefined for fewer than two nodes', () => {
    expect(buildRouteLine(['n/1'], [], venue.graph)).toBeUndefined();
  });
});

describe('projectOnRoute', () => {
  it('puts a fix on the first node at progress 0 and a fix on the last node at the end', () => {
    expect(projectOnRoute(line, N1)).toMatchObject({ progressM: 0 });
    expect(projectOnRoute(line, N1).distanceToRouteM).toBeLessThan(0.5);
    const end = projectOnRoute(line, N3);
    expect(end.progressM).toBeCloseTo(117, 0);
    expect(end.distanceToRouteM).toBeLessThan(0.5);
  });

  it('maps a fix beside the first leg to the matching share of that leg and reports the lateral distance', () => {
    const mid = offset(N1, 28, 0);
    const beside = offset(mid, 0, -10);
    const p = projectOnRoute(line, beside);
    expect(p.progressM).toBeGreaterThan(27);
    expect(p.progressM).toBeLessThan(29);
    expect(p.distanceToRouteM).toBeGreaterThan(9.5);
    expect(p.distanceToRouteM).toBeLessThan(10.5);
    expect(p.snapped.lng).toBeCloseTo(N1.lng, 6);
  });

  it('clamps a fix past the end of the route to the final node', () => {
    const p = projectOnRoute(line, offset(N3, 0, 40));
    expect(p.progressM).toBeCloseTo(117, 0);
    expect(p.distanceToRouteM).toBeGreaterThan(39);
  });

  it('a route without two points projects nowhere and is infinitely far', () => {
    const empty: RouteLine = { points: [N1], cumulativeM: [0], totalM: 0 };
    expect(projectOnRoute(empty, N1)).toEqual({ progressM: 0, snapped: N1, distanceToRouteM: Infinity });
  });

  describe('continuity on a route that doubles back beside itself (#93)', () => {
    // out 100 m north, 20 m east, back 100 m south: two corridors 20 m apart.
    const A = { lat: 38.7, lng: -9.14 };
    const B = offset(A, 100, 0);
    const C = offset(B, 0, 20);
    const D = offset(C, -100, 0);
    const u: RouteLine = { points: [A, B, C, D], cumulativeM: [0, 100, 120, 220], totalM: 220 };
    const fix = offset(A, 50, 9); // 9 m from the out-leg, 11 m from the return leg

    it('without continuity the globally nearest corridor wins', () => {
      expect(projectOnRoute(u, fix).progressM).toBeCloseTo(50, 0);
    });

    it('with continuity the walker stays on the corridor they were on', () => {
      const p = projectOnRoute(u, fix, { previousProgressM: 170, maxForwardM: 30, acceptDistanceM: 30, switchMarginM: 5 });
      expect(p.progressM).toBeCloseTo(170, 0);
    });

    it('a clearly closer corridor still wins over continuity', () => {
      const nearOut = offset(A, 50, 1); // 1 m from out-leg, 19 m from return leg
      const p = projectOnRoute(u, nearOut, { previousProgressM: 170, maxForwardM: 30, acceptDistanceM: 30, switchMarginM: 5 });
      expect(p.progressM).toBeCloseTo(50, 0);
    });

    it('beyond the off-route tolerance of the window the global nearest applies again', () => {
      const p = projectOnRoute(u, fix, { previousProgressM: 170, maxForwardM: 30, acceptDistanceM: 5, switchMarginM: 5 });
      expect(p.progressM).toBeCloseTo(50, 0);
    });

    it('a non-finite continuity input is ignored rather than trusted', () => {
      const p = projectOnRoute(u, fix, { previousProgressM: NaN, maxForwardM: 30, acceptDistanceM: 30, switchMarginM: 5 });
      expect(p.progressM).toBeCloseTo(50, 0);
    });
  });
});

describe('advanceProgress', () => {
  const base = { line, speedMps: 1.4 };

  it('derives remaining distance and a ceiling ETA from the progress', () => {
    const r = advanceProgress({ ...base, point: offset(N1, 28, 0), previousProgressM: 0 });
    expect(r.progressM).toBeGreaterThan(27);
    expect(r.remainingM).toBeCloseTo(117 - r.progressM, 6);
    expect(r.etaMinutes).toBe(Math.ceil(r.remainingM / 1.4 / 60));
  });

  it('bounds one fix by how far a person could have walked since the last accepted fix', () => {
    // 1 s elapsed: 1.4 * 3 * 1 + 25 = 29.2 m is the most progress one fix may add.
    const r = advanceProgress({ ...base, point: N3, previousProgressM: 0, observedAtMs: 11_000, previousObservedAtMs: 10_000 });
    expect(r.progressM).toBeCloseTo(29.2, 6);
  });

  describe('a route that folds back beside itself (production-scale review 2026-11-10)', () => {
    // Out 200 m north, 25 m east, back 200 m south.
    const A = { lat: 38.7, lng: -9.14 };
    const u: RouteLine = { points: [A, offset(A, 200, 0), offset(A, 200, 25), offset(A, 0, 25)], cumulativeM: [0, 200, 225, 425], totalM: 425 };
    const walkNoisy = (trueNorthM: (i: number) => number, eastM: (i: number) => number, fixes: number): number => {
      let previousProgressM = trueNorthM(0);
      for (let i = 1; i <= fixes; i += 1) {
        previousProgressM = advanceProgress({
          line: u, speedMps: 1.4, point: offset(A, trueNorthM(i), eastM(i)), previousProgressM,
          observedAtMs: 10_000 + i * 1000, previousObservedAtMs: 9_000 + i * 1000, accuracyM: 24,
        }).progressM;
      }
      return previousProgressM;
    };
    it('noisy fixes nearer the far leg cannot ratchet progress ahead of a walker on the near leg', () => {
      // Standing 60 m up the out-leg; every other fix lands 30 m east: 5 m from the return leg, 30 m from the walker's own leg.
      expect(walkNoisy(() => 60, (i) => (i % 2 ? 30 : 0), 20)).toBeCloseTo(60, 0); // it used to end about 290 m ahead, on the return leg
      // Walking north at 1.4 m/s with the same noise: progress follows the walker.
      expect(walkNoisy((i) => 60 + i * 1.4, (i) => (i % 2 ? 30 : 0), 40)).toBeCloseTo(116, 0);
    });
    it('the reported snap and distance-to-route are those of the reachable leg, so the far leg cannot hide being off the route', () => {
      const r = advanceProgress({ line: u, speedMps: 1.4, point: offset(A, 60, 30), previousProgressM: 60, observedAtMs: 11_000, previousObservedAtMs: 10_000, accuracyM: 24 });
      expect(r.progressM).toBeCloseTo(60, 0);
      expect(r.distanceToRouteM).toBeCloseTo(30, 0);
    });
    it('a fix beyond the off-route tolerance of the reachable part still advances by the bound, as before', () => {
      // 5 m accuracy: tolerance 30 m. A fix 40 m east of the out-leg is 15 m beyond the return leg and belongs to neither window.
      const r = advanceProgress({ line: u, speedMps: 1.4, point: offset(A, 60, 40), previousProgressM: 60, observedAtMs: 11_000, previousObservedAtMs: 10_000, accuracyM: 5 });
      expect(r.progressM).toBeCloseTo(89.2, 1);
    });
  });

  it('a long gap widens the bound, so a real walk while backgrounded is not clipped', () => {
    const r = advanceProgress({ ...base, point: N3, previousProgressM: 0, observedAtMs: 70_000, previousObservedAtMs: 10_000 });
    expect(r.progressM).toBeCloseTo(117, 0);
  });

  it('without timestamps on both sides the forward jump is uncapped', () => {
    expect(advanceProgress({ ...base, point: N3, previousProgressM: 0 }).progressM).toBeCloseTo(117, 0);
    expect(advanceProgress({ ...base, point: N3, previousProgressM: 0, observedAtMs: 5_000 }).progressM).toBeCloseTo(117, 0);
  });

  it('ignores a backwards jump of more than 15 m but accepts ordinary jitter', () => {
    const at = (m: number) => offset(N1, m, 0);
    expect(advanceProgress({ ...base, point: at(40), previousProgressM: 56 }).progressM).toBeCloseTo(56, 6); // 16 m back
    const jitter = advanceProgress({ ...base, point: at(45), previousProgressM: 56 }); // ~10.6 m back
    expect(jitter.progressM).toBeLessThan(46);
    expect(jitter.progressM).toBeGreaterThan(44);
  });

  it('keeps the previous ETA when the new one differs by a minute or less, but zero distance is zero ETA', () => {
    const steady = advanceProgress({ ...base, point: offset(N1, 28, 0), previousProgressM: 28, previousEtaMinutes: 3 });
    expect(steady.etaMinutes).toBe(3); // computed 2, previous 3: within a minute, so no flicker
    const jumped = advanceProgress({ ...base, point: offset(N1, 28, 0), previousProgressM: 28, previousEtaMinutes: 9 });
    expect(jumped.etaMinutes).toBe(2);
    const done = advanceProgress({ ...base, point: N3, previousProgressM: 117, previousEtaMinutes: 1 });
    expect(done.remainingM).toBe(0);
    expect(done.etaMinutes).toBe(0);
  });
});

describe('off-route and reroute evidence', () => {
  it('threshold is 30 m, grows to 1.5x the GPS accuracy and never exceeds 80 m', () => {
    expect(offRouteThresholdM()).toBe(30);
    expect(offRouteThresholdM(10)).toBe(30);
    expect(offRouteThresholdM(40)).toBe(60);
    expect(offRouteThresholdM(49)).toBe(74);
    expect(offRouteThresholdM(500)).toBe(80);
  });

  const evidence = { consecutiveOffRouteCount: 3, offRouteDurationMs: 0, cooldownRemainingMs: 0, movedDistanceM: 20 };
  it('needs three consecutive fixes or nine seconds, real movement and no cooldown', () => {
    expect(shouldTriggerReroute(evidence)).toBe(true);
    expect(shouldTriggerReroute({ ...evidence, consecutiveOffRouteCount: 2 })).toBe(false);
    expect(shouldTriggerReroute({ ...evidence, consecutiveOffRouteCount: 1, offRouteDurationMs: 9_000 })).toBe(true);
    expect(shouldTriggerReroute({ ...evidence, movedDistanceM: 11.9 })).toBe(false);
    expect(shouldTriggerReroute({ ...evidence, cooldownRemainingMs: 1 })).toBe(false);
  });

  it('exposes the host cooldown and arrival constants', () => {
    expect(REROUTE_COOLDOWN_MS).toBe(25_000);
    expect(ARRIVAL_THRESHOLD_M).toBe(20);
  });
});

describe('locateStep', () => {
  const steps = buildRouteSteps(route, venue.graph); // depart 56, turn_right 61, arrive 0

  it('is the first step whose end is still ahead, with the distance left to it', () => {
    expect(locateStep(steps, 0, 10)).toEqual({ stepIndex: 0, maneuverDistanceM: 46 });
    expect(locateStep(steps, 0, 56)).toEqual({ stepIndex: 1, maneuverDistanceM: 61 });
    expect(locateStep(steps, 1, 100)).toEqual({ stepIndex: 1, maneuverDistanceM: 17 });
  });

  it('only moves forward and lands on arrive with distance 0 at the end', () => {
    expect(locateStep(steps, 1, 10).stepIndex).toBe(1);
    expect(locateStep(steps, 0, 117)).toEqual({ stepIndex: 2, maneuverDistanceM: 0 });
    expect(locateStep(steps, 0, 500)).toEqual({ stepIndex: 2, maneuverDistanceM: 0 });
  });
});

describe('isArrivedAtDestination', () => {
  const steps = buildRouteSteps(route, venue.graph);
  const lastWalking = steps.length - 2;

  it('needs the final walking step and a fix within 20 m of the destination', () => {
    expect(isArrivedAtDestination({ stepIndex: lastWalking, stepCount: steps.length, point: offset(N3, 0, 15), destination: N3 })).toBe(true);
    expect(isArrivedAtDestination({ stepIndex: lastWalking, stepCount: steps.length, point: offset(N3, 0, 25), destination: N3 })).toBe(false);
  });

  it('a route that passes near the destination early has not arrived', () => {
    expect(isArrivedAtDestination({ stepIndex: 0, stepCount: steps.length, point: N3, destination: N3 })).toBe(false);
  });

  it('a single-step route can arrive', () => {
    expect(isArrivedAtDestination({ stepIndex: 0, stepCount: 1, point: N3, destination: N3 })).toBe(true);
  });
});

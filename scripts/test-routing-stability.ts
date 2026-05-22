import { strict as assert } from 'node:assert';
import { RerouteService } from '../src/services/RerouteService';

const accuracyStrong = 8;
const accuracyWeak = 60;

const strongThreshold = RerouteService.getDynamicOffRouteThresholdMeters(accuracyStrong);
const weakThreshold = RerouteService.getDynamicOffRouteThresholdMeters(accuracyWeak);

assert(strongThreshold >= 30, 'Strong GPS threshold should have a sensible minimum');
assert(weakThreshold > strongThreshold, 'Weak GPS threshold should be wider than strong GPS threshold');
assert(weakThreshold <= 80, 'Weak GPS threshold should be capped to prevent runaway tolerance');

assert(
  RerouteService.shouldHoldRouteForWeakGps(accuracyWeak),
  'Very weak GPS should hold the active route stable',
);
assert(
  !RerouteService.shouldHoldRouteForWeakGps(accuracyStrong),
  'Strong GPS should not hold rerouting unnecessarily',
);

assert(
  !RerouteService.shouldTriggerReroute({
    consecutiveOffRouteCount: 2,
    offRouteDurationMs: 4000,
    cooldownRemainingMs: 0,
    movedDistanceSinceLastAcceptedM: 25,
  }),
  'Two off-route samples should not trigger reroute yet',
);

assert(
  RerouteService.shouldTriggerReroute({
    consecutiveOffRouteCount: 3,
    offRouteDurationMs: 9000,
    cooldownRemainingMs: 0,
    movedDistanceSinceLastAcceptedM: 25,
  }),
  'Three consecutive off-route samples should trigger reroute',
);

assert(
  !RerouteService.shouldTriggerReroute({
    consecutiveOffRouteCount: 4,
    offRouteDurationMs: 12000,
    cooldownRemainingMs: 15000,
    movedDistanceSinceLastAcceptedM: 40,
  }),
  'Cooldown should suppress reroute triggers',
);

assert(
  !RerouteService.shouldTriggerReroute({
    consecutiveOffRouteCount: 4,
    offRouteDurationMs: 12000,
    cooldownRemainingMs: 0,
    movedDistanceSinceLastAcceptedM: 5,
  }),
  'Insufficient movement should suppress reroute triggers',
);

assert.equal(
  RerouteService.clampMonotonicProgress(120, 90, 15),
  120,
  'Large backward jumps should be rejected for monotonic progress',
);

assert.equal(
  RerouteService.clampMonotonicProgress(120, 118, 15),
  118,
  'Small backward drift can be accepted to avoid jitter spikes',
);

console.log('Routing stability checks passed.');

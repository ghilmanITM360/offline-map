import { strict as assert } from 'node:assert';

import { SearchService } from '../src/services/SearchService';
import { V2DirectionsService } from '../src/services/V2DirectionsService';
import { V2NavigationAdapter } from '../src/services/V2NavigationAdapter';
import {
  calculateLiveManeuverDistanceV2,
  calculateNavigationProgressV2,
  shouldIgnorePoorAccuracyMovementV2,
} from '../src/services/V2NavigationRuntimeService';

process.env.EXPO_PUBLIC_USE_IJTEMA_V2_MAP = 'true';
process.env.EXPO_PUBLIC_USE_IJTEMA_V2_ROUTING = 'true';
process.env.EXPO_PUBLIC_USE_IJTEMA_V2_NAVIGATION = 'true';

const gate21 = SearchService.search('Gate 21')[0];
const block28 = SearchService.search('Block 28')[0];
const preview = V2DirectionsService.calculatePreview({
  startPlace: gate21,
  destination: block28,
  currentLocation: null,
  walkingSpeedMs: 1.4,
});
assert.equal(preview.status, 'ready', 'Gate 21 -> Block 28 progress fixture must route');
const activeRoute = V2NavigationAdapter.fromPreview({
  previewRoute: preview.route!,
  destination: block28,
  startPlace: gate21,
});

const start = activeRoute.coordinates[0];
const forward = activeRoute.coordinates[Math.min(2, activeRoute.coordinates.length - 1)];

const initial = calculateNavigationProgressV2({
  route: activeRoute,
  coordinate: { ...start, accuracy: 8 },
  previousProgressMeters: 0,
  walkingSpeedMs: 1.4,
});
const moved = calculateNavigationProgressV2({
  route: activeRoute,
  coordinate: { ...forward, accuracy: 8 },
  previousProgressMeters: initial.progressMeters,
  walkingSpeedMs: 1.4,
});
assert(moved.progressMeters > initial.progressMeters, 'Progress projection must increase when moving forward');
assert(moved.remainingDistanceM < initial.remainingDistanceM, 'Remaining distance must decrease when moving forward');

const jitterBehind = calculateNavigationProgressV2({
  route: activeRoute,
  coordinate: {
    latitude: start.latitude + 0.00001,
    longitude: start.longitude + 0.00001,
    accuracy: 18,
  },
  previousProgressMeters: moved.progressMeters,
  previousEtaMinutes: moved.etaMinutes,
  walkingSpeedMs: 1.4,
});
assert(jitterBehind.progressMeters >= moved.progressMeters, 'GPS jitter must not reset v2 route progress');
assert(
  Math.abs(jitterBehind.etaMinutes - moved.etaMinutes) <= 1,
  'ETA must remain stable during stationary jitter',
);

// AUD-12: once remainingDistanceM is genuinely 0, etaMinutes must be exactly 0 before any
// smoothing — a stale previousEtaMinutes of 1 must not survive the "within 1 minute, keep the
// old value" stability smoothing and freeze the display at "1 min" while 0m remain.
const destinationCoord = activeRoute.coordinates[activeRoute.coordinates.length - 1];
const arrivedProgress = calculateNavigationProgressV2({
  route: activeRoute,
  coordinate: { ...destinationCoord, accuracy: 8 },
  previousProgressMeters: activeRoute.totalDistanceM,
  previousEtaMinutes: 1,
  walkingSpeedMs: 1.4,
});
assert.equal(arrivedProgress.remainingDistanceM, 0, 'Setup: remaining distance must be exactly 0 at destination');
assert.equal(
  arrivedProgress.etaMinutes,
  0,
  'AUD-12: ETA must be exactly 0 once remaining distance is 0, never a stale smoothed "1 min"',
);

assert.equal(
  shouldIgnorePoorAccuracyMovementV2({ movedDistanceM: 6, accuracyM: 65 }),
  true,
  'Poor-accuracy movement under 10m must be ignored',
);
assert.equal(
  shouldIgnorePoorAccuracyMovementV2({ movedDistanceM: 16, accuracyM: 20 }),
  false,
  'Accurate movement over 10m must be accepted',
);

// #61: live maneuver distance must count down within a step, not stay frozen at the route-
// generation instruction.distanceM.
function lerpCoord(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }, t: number) {
  return { latitude: a.latitude + (b.latitude - a.latitude) * t, longitude: a.longitude + (b.longitude - a.longitude) * t, accuracy: 8 };
}

const longLegInstruction = [...activeRoute.instructions].sort((a, b) => b.distanceM - a.distanceM)[0];
const longLegIndex = activeRoute.instructions.indexOf(longLegInstruction);
assert(longLegIndex > 0, 'Fixture must contain a real (non-start) instruction to walk through');
const legStartCoord = activeRoute.coordinates[activeRoute.instructions[longLegIndex - 1]?.routeIndex ?? 0];
const legEndCoord = activeRoute.coordinates[longLegInstruction.routeIndex];

let stepProgress = 0;
let currentStepIndex = 0;
function tickManeuver(coord: ReturnType<typeof lerpCoord>) {
  const progress = calculateNavigationProgressV2({ route: activeRoute, coordinate: coord, previousProgressMeters: stepProgress, walkingSpeedMs: 1.4 });
  stepProgress = progress.progressMeters;
  const guidance = calculateLiveManeuverDistanceV2({ route: activeRoute, currentStepIndex, progressMeters: stepProgress });
  currentStepIndex = guidance.stepIndex;
  return { progress, maneuverDistance: guidance.maneuverDistanceM };
}

const early = tickManeuver(lerpCoord(legStartCoord, legEndCoord, 0.05));
const mid = tickManeuver(lerpCoord(legStartCoord, legEndCoord, 0.35));
const late = tickManeuver(lerpCoord(legStartCoord, legEndCoord, 0.65));
const nearBoundary = tickManeuver(lerpCoord(legStartCoord, legEndCoord, 0.97));

assert(mid.maneuverDistance < early.maneuverDistance, 'D1: live maneuver distance must decrease as progress advances within the same leg');
assert(late.maneuverDistance < mid.maneuverDistance, 'D2: live maneuver distance must keep decreasing further into the leg');
assert.notEqual(mid.maneuverDistance, longLegInstruction.distanceM, 'D5: live maneuver distance must not equal the frozen original instruction distance');
assert(nearBoundary.maneuverDistance < 15, 'D4: live maneuver distance must approach 0 near the maneuver boundary');
assert(nearBoundary.maneuverDistance >= 0, 'D4: live maneuver distance must never go negative');
assert.notEqual(mid.maneuverDistance, mid.progress.remainingDistanceM, 'D3: maneuver distance must not impersonate total remaining journey distance');
assert(mid.maneuverDistance <= mid.progress.remainingDistanceM + 1, 'D3: maneuver distance must not exceed total remaining journey distance');

const firstRealInstruction = activeRoute.instructions.find((instruction) => instruction.distanceM > 0);
assert(firstRealInstruction, 'Fixture must have a real first instruction');
const atStartGuidance = calculateLiveManeuverDistanceV2({ route: activeRoute, currentStepIndex: 0, progressMeters: 0 });
assert(
  Math.abs(atStartGuidance.maneuverDistanceM - firstRealInstruction!.distanceM) <= 1,
  `D14: at route start live maneuver distance (${atStartGuidance.maneuverDistanceM}) must match the first real step's distance (${firstRealInstruction!.distanceM})`,
);
assert.equal(
  activeRoute.instructions[atStartGuidance.stepIndex].id,
  firstRealInstruction!.id,
  'D14: the guidance stepIndex at route start must point at the same instruction the distance was measured against',
);

// G2: the step the distance was measured against and the step reported as "current" must never
// disagree, including exactly at a step boundary crossing (the root-cause bug: instruction-index
// selection and distance countdown were two independent authorities).
const g2Boundaries = activeRoute.instructions.map((instruction) => {
  const coord = activeRoute.coordinates[instruction.routeIndex] ?? instruction.coordinate;
  return calculateNavigationProgressV2({ route: activeRoute, coordinate: coord, previousProgressMeters: 0, walkingSpeedMs: 1.4 }).progressMeters;
});
const g2BoundaryIndex = g2Boundaries.findIndex((b, i) => i > 0 && g2Boundaries[i + 1] - b > 20);
assert(g2BoundaryIndex > 0, 'G2 fixture must contain a boundary with a long next leg to reproduce the regression window');
const g2Boundary = g2Boundaries[g2BoundaryIndex];
for (const offset of [-5, -1, 0, 1, 5]) {
  const progress = g2Boundary + offset;
  const guidance = calculateLiveManeuverDistanceV2({ route: activeRoute, currentStepIndex: g2BoundaryIndex, progressMeters: progress });
  const expectedIndex = offset < 0 ? g2BoundaryIndex : g2BoundaryIndex + 1;
  assert.equal(
    guidance.stepIndex,
    expectedIndex,
    `G2: at progress=${progress} (boundary${offset >= 0 ? '+' : ''}${offset}), guidance stepIndex must be ${expectedIndex}, got ${guidance.stepIndex}`,
  );
  const boundaryCoord = activeRoute.coordinates[activeRoute.instructions[guidance.stepIndex].routeIndex] ?? activeRoute.instructions[guidance.stepIndex].coordinate;
  const targetBoundaryMeters = calculateNavigationProgressV2({ route: activeRoute, coordinate: boundaryCoord, previousProgressMeters: 0, walkingSpeedMs: 1.4 }).progressMeters;
  assert(
    Math.abs(guidance.maneuverDistanceM - Math.max(0, targetBoundaryMeters - progress)) <= 1,
    `G2: at progress=${progress}, distance must measure to the displayed step's own boundary`,
  );
}

console.log('Navigation progress v2 checks passed.');

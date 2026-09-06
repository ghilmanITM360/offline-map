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

// NEW-05: live maneuver distance must count down with route progress instead of staying frozen
// at the current instruction's immutable original distance. Mirrors NavigationViewModelV2's own
// (private) currentStepIndex advancement so the fixture exercises the real authoritative logic.
function instructionIndexForProgressFixture(route: typeof activeRoute, progressMeters: number): number {
  let bestIndex = 0;
  route.instructions.forEach((instruction, index) => {
    const coord = route.coordinates[instruction.routeIndex] ?? instruction.coordinate;
    const projected = calculateNavigationProgressV2({
      route,
      coordinate: coord,
      previousProgressMeters: 0,
      walkingSpeedMs: 1.4,
    });
    if (projected.progressMeters <= progressMeters + 15) bestIndex = index;
  });
  return bestIndex;
}

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
  currentStepIndex = Math.max(currentStepIndex, instructionIndexForProgressFixture(activeRoute, stepProgress));
  const maneuverDistance = calculateLiveManeuverDistanceV2({ route: activeRoute, currentStepIndex, progressMeters: stepProgress });
  return { progress, maneuverDistance };
}

const early = tickManeuver(lerpCoord(legStartCoord, legEndCoord, 0.05));
const mid = tickManeuver(lerpCoord(legStartCoord, legEndCoord, 0.35));
const late = tickManeuver(lerpCoord(legStartCoord, legEndCoord, 0.65));
const nearBoundary = tickManeuver(lerpCoord(legStartCoord, legEndCoord, 0.97));

// D1/D2 — countdown, not frozen at the original static distanceM.
assert(mid.maneuverDistance < early.maneuverDistance, 'D1: live maneuver distance must decrease as progress advances within the same leg');
assert(late.maneuverDistance < mid.maneuverDistance, 'D2: live maneuver distance must keep decreasing further into the leg');
// D5 — must not simply equal the immutable original instruction distance once progress occurs.
assert.notEqual(mid.maneuverDistance, longLegInstruction.distanceM, 'D5: live maneuver distance must not equal the frozen original instruction distance');
// D4 — trends toward 0 approaching the maneuver.
assert(nearBoundary.maneuverDistance < 15, 'D4: live maneuver distance must approach 0 near the maneuver boundary');
assert(nearBoundary.maneuverDistance >= 0, 'D4: live maneuver distance must never go negative');
// D3 — maneuver distance and total remaining journey distance are separate, non-impersonating values.
assert.notEqual(mid.maneuverDistance, mid.progress.remainingDistanceM, 'D3: maneuver distance must not impersonate total remaining journey distance');
assert(mid.maneuverDistance <= mid.progress.remainingDistanceM + 1, 'D3: maneuver distance must not exceed total remaining journey distance');

// D14 — at exact route start, live maneuver distance approximately matches the first real step's
// own original distance (the degenerate 0-distance start marker at index 0 must not be the target).
const firstRealInstruction = activeRoute.instructions.find((instruction) => instruction.distanceM > 0);
assert(firstRealInstruction, 'Fixture must have a real first instruction');
const atStart = calculateLiveManeuverDistanceV2({ route: activeRoute, currentStepIndex: 0, progressMeters: 0 });
assert(
  Math.abs(atStart - firstRealInstruction!.distanceM) <= 1,
  `D14: at route start live maneuver distance (${atStart}) must match the first real step's distance (${firstRealInstruction!.distanceM})`,
);

// D13 — outside-to-inside hybrid route: live maneuver distance must be derivable the same way
// across the gate transition (no separate outside-only code path).
const hybridPreview = V2DirectionsService.calculatePreview({
  startPlace: null,
  destination: block28,
  currentLocation: { latitude: 24.9695, longitude: 66.9968 },
  walkingSpeedMs: 1.4,
  forceOutside: true,
});
assert.equal(hybridPreview.status, 'ready', 'Hybrid outside->inside fixture must route');
const hybridRoute = V2NavigationAdapter.fromPreview({
  previewRoute: hybridPreview.route!,
  destination: block28,
  currentLocation: { latitude: 24.9695, longitude: 66.9968 },
});
const hybridStartDistance = calculateLiveManeuverDistanceV2({ route: hybridRoute, currentStepIndex: 0, progressMeters: 0 });
assert(hybridStartDistance > 0, 'D13: hybrid route must derive a positive live maneuver distance on its outside leg');
const hybridMidProgress = calculateNavigationProgressV2({
  route: hybridRoute,
  coordinate: hybridRoute.coordinates[Math.min(2, hybridRoute.coordinates.length - 1)],
  previousProgressMeters: 0,
  walkingSpeedMs: 1.4,
});
const hybridMidStepIndex = instructionIndexForProgressFixture(hybridRoute, hybridMidProgress.progressMeters);
const hybridMidDistance = calculateLiveManeuverDistanceV2({ route: hybridRoute, currentStepIndex: hybridMidStepIndex, progressMeters: hybridMidProgress.progressMeters });
assert(hybridMidDistance >= 0, 'D13: hybrid route live maneuver distance must stay non-negative while progressing');

// NEW-05 P1 — outside-origin first-maneuver distance contract. A raw GPS
// origin materially outside the street graph (here ~75m from the nearest
// street node Ps) must not have its own O->Ps connector silently folded into
// the first *topology* instruction's live countdown while that instruction's
// own displayed text/distance still only describes the Ps->boundary hop.
// The displayed instruction and the live maneuver distance must describe the
// same action at every tick — this is the invariant the confirmation review
// caught missing (the old D13 only asserted `hybridStartDistance > 0`, which
// a text/distance mismatch like "Walk 28m" + "103m" still satisfies).
const hybridInstruction0 = hybridRoute.instructions[0];
assert(
  Math.abs(hybridStartDistance - hybridInstruction0.distanceM) <= 2,
  `P1-R1: displayed instruction ("${hybridInstruction0.text}", ${hybridInstruction0.distanceM}m) must match the live maneuver distance (${hybridStartDistance}m) at route start`,
);
// The O->Ps connector (~75m in this fixture) must surface as its own
// instruction rather than vanishing — proves the connector wasn't dropped.
assert(
  hybridInstruction0.distanceM >= 50,
  `P1-R2: first hybrid instruction must carry the real O->Ps connector distance, got ${hybridInstruction0.distanceM}m`,
);

// P1-R6/R7 — once the connector is behind the pedestrian, the first real
// topology maneuver (previously instructions[0], now instructions[1]) must
// still count down correctly from its own unchanged hop distance, and later
// instructions must be unaffected by the connector fix.
const afterConnectorProgress = calculateNavigationProgressV2({
  route: hybridRoute,
  coordinate: hybridRoute.coordinates[hybridInstruction0.routeIndex],
  previousProgressMeters: 0,
  walkingSpeedMs: 1.4,
});
const firstTopologyInstruction = hybridRoute.instructions[1];
const firstTopologyDistance = calculateLiveManeuverDistanceV2({
  route: hybridRoute,
  currentStepIndex: 1,
  progressMeters: afterConnectorProgress.progressMeters,
});
assert(
  Math.abs(firstTopologyDistance - firstTopologyInstruction.distanceM) <= 2,
  `P1-R6: first real topology maneuver (${firstTopologyInstruction.text}) must count down from its own distance, got live=${firstTopologyDistance}m vs displayed=${firstTopologyInstruction.distanceM}m`,
);

// P1-R9 — NEW-06's complete-journey distance accounting (raw connector still
// charged into the total) must not regress from this guidance-only fix.
assert.equal(
  hybridRoute.totalDistanceM,
  1639,
  'P1-R9: NEW-06 total journey distance for this fixture must remain unchanged by the guidance fix',
);

console.log('Navigation progress v2 checks passed.');

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
const atStartGuidance = calculateLiveManeuverDistanceV2({ route: activeRoute, currentStepIndex: 0, progressMeters: 0 });
const atStart = atStartGuidance.maneuverDistanceM;
assert(
  Math.abs(atStart - firstRealInstruction!.distanceM) <= 1,
  `D14: at route start live maneuver distance (${atStart}) must match the first real step's distance (${firstRealInstruction!.distanceM})`,
);
assert.equal(
  activeRoute.instructions[atStartGuidance.stepIndex].id,
  firstRealInstruction!.id,
  'D14: the guidance stepIndex at route start must point at the same instruction the distance was measured against',
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
const hybridStartGuidance = calculateLiveManeuverDistanceV2({ route: hybridRoute, currentStepIndex: 0, progressMeters: 0 });
const hybridStartDistance = hybridStartGuidance.maneuverDistanceM;
assert(hybridStartDistance > 0, 'D13: hybrid route must derive a positive live maneuver distance on its outside leg');
const hybridMidProgress = calculateNavigationProgressV2({
  route: hybridRoute,
  coordinate: hybridRoute.coordinates[Math.min(2, hybridRoute.coordinates.length - 1)],
  previousProgressMeters: 0,
  walkingSpeedMs: 1.4,
});
const hybridMidGuidance = calculateLiveManeuverDistanceV2({ route: hybridRoute, currentStepIndex: 0, progressMeters: hybridMidProgress.progressMeters });
const hybridMidDistance = hybridMidGuidance.maneuverDistanceM;
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
const firstTopologyGuidance = calculateLiveManeuverDistanceV2({
  route: hybridRoute,
  currentStepIndex: 1,
  progressMeters: afterConnectorProgress.progressMeters,
});
const firstTopologyDistance = firstTopologyGuidance.maneuverDistanceM;
assert(
  Math.abs(firstTopologyDistance - firstTopologyInstruction.distanceM) <= 2,
  `P1-R6: first real topology maneuver (${firstTopologyInstruction.text}) must count down from its own distance, got live=${firstTopologyDistance}m vs displayed=${firstTopologyInstruction.distanceM}m`,
);

// NEW-05 P1 FIX #2 — G1/G3: displayed step identity and live maneuver distance target must
// always name the SAME instruction, including exactly at/around a step boundary crossing. Before
// this fix, instructionIndexForProgress (text) and calculateLiveManeuverDistanceV2 (distance) were
// two independent boundary-transition authorities: text held the old instruction on a ~15m
// anticipation tolerance while distance's forward scan had already jumped to the next instruction
// as soon as the old boundary was crossed, producing a window (e.g. progress 75-87 in this exact
// fixture) where "Walk 75m..." was shown alongside a live distance counting down the *next*
// instruction's 28m hop. Now both come from one call, so stepIndex and the instruction the
// distance was measured against can never disagree.
let g1StepIndex = 0;
for (const progress of [0, 55, 70, 74, 75, 76, 80, 87, 88, 95, 103, 104]) {
  const guidance = calculateLiveManeuverDistanceV2({ route: hybridRoute, currentStepIndex: g1StepIndex, progressMeters: progress });
  g1StepIndex = guidance.stepIndex;
  const boundaryCoord = hybridRoute.coordinates[hybridRoute.instructions[g1StepIndex].routeIndex] ?? hybridRoute.instructions[g1StepIndex].coordinate;
  const boundaryMeters = calculateNavigationProgressV2({ route: hybridRoute, coordinate: boundaryCoord, previousProgressMeters: 0, walkingSpeedMs: 1.4 }).progressMeters;
  assert(
    Math.abs(guidance.maneuverDistanceM - Math.max(0, boundaryMeters - progress)) <= 1,
    `G1: at progress=${progress}, maneuverDistanceM must measure to displayed stepIndex ${g1StepIndex}'s own boundary`,
  );
}
// Specifically prove the exact regression: right after crossing the O->Ps connector's own 75m
// boundary, the displayed step must already be the next (28m) instruction — not lag behind it.
const g1AtConnectorBoundary = calculateLiveManeuverDistanceV2({ route: hybridRoute, currentStepIndex: 0, progressMeters: 75 });
assert.equal(g1AtConnectorBoundary.stepIndex, 1, 'G1/G3: at progress=75 (the connector\'s own boundary), the guidance step must already be instructions[1]');
assert(
  Math.abs(g1AtConnectorBoundary.maneuverDistanceM - firstTopologyInstruction.distanceM) <= 2,
  'G1/G3: the distance at that same tick must match instructions[1]\'s own distance, not a leftover 0m/instructions[0] reading',
);

// G2 — same invariant on a plain internal route (Gate 21 -> Block 28), at the junction->Rasta 08
// boundary (19m in this fixture, next boundary far ahead at 193m) — the case the independent
// re-confirmation reproduced outside of any outside-street connector.
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

// P1-R9 — NEW-06's complete-journey distance accounting (raw connector still
// charged into the total) must not regress from this guidance-only fix.
assert.equal(
  hybridRoute.totalDistanceM,
  1639,
  'P1-R9: NEW-06 total journey distance for this fixture must remain unchanged by the guidance fix',
);

console.log('Navigation progress v2 checks passed.');

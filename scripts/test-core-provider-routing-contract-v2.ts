/**
 * Covers the core/provider two-phase outside-routing contract
 * (RoutingServiceV2.prepareOutsideRoutingPlan / finalizeOutsideRoutingPlan /
 * resolveOfflineOsmOutsideCandidate) added for Codex's provider track.
 *
 * Real venue data is used throughout (not synthetic gate fixtures) — the
 * fixture (outside north-east -> Block 34) is the same known
 * multi-gate-alternative scenario already established by
 * test-route-selection-total-cost-v2.ts, so results here can be
 * cross-checked against that file's independently-computed totals.
 */
import { strict as assert } from 'node:assert';

import { RoutingServiceV2 } from '../src/services/RoutingServiceV2';
import type {
  NormalizedOutsideCandidate,
  OutsideRouteCandidateSet,
} from '../src/models/outsideRouting';

process.env.EXPO_PUBLIC_USE_IJTEMA_V2_MAP = 'true';
process.env.EXPO_PUBLIC_USE_IJTEMA_V2_ROUTING = 'true';
process.env.EXPO_PUBLIC_USE_IJTEMA_OUTSIDE_STREET_GRAPH = 'true';

const OUTSIDE_NORTH_EAST = { latitude: 24.9762, longitude: 67.011 };
const DESTINATION = { type: 'block' as const, blockId: 'B34' };

const normalizedCandidate = (
  gateId: string,
  distanceM: number,
  candidateId = `core-contract:offline-osm:${gateId}:0`,
  coordinates = [OUTSIDE_NORTH_EAST, OUTSIDE_NORTH_EAST],
): NormalizedOutsideCandidate => ({
  schemaVersion: 1,
  candidateId,
  requestId: 'core-contract',
  requestVersion: 1,
  provider: 'offline-osm',
  gateId,
  distanceM,
  durationSeconds: null,
  coordinates,
  steps: [],
  roadFollowing: true,
  distanceKind: 'walking-route',
  warnings: [],
  fallbackReason: null,
  fallbackHistory: [],
});

const candidateSet = (routes: NormalizedOutsideCandidate[]): OutsideRouteCandidateSet => ({
  requestId: 'core-contract',
  requestVersion: 1,
  provider: 'offline-osm',
  outcomes: routes.map((route) => ({ status: 'routed', gateId: route.gateId, routes: [route] })),
});

const fromOsmCandidate = (
  gateId: string,
  candidate: NonNullable<ReturnType<typeof RoutingServiceV2.resolveOfflineOsmOutsideCandidate>>,
): NormalizedOutsideCandidate => normalizedCandidate(
  gateId,
  candidate.outsideDistanceM,
  `core-contract:offline-osm:${gateId}:0`,
  candidate.outsideCoordinates ?? [OUTSIDE_NORTH_EAST, OUTSIDE_NORTH_EAST],
);

// ─── Plan preparation returns eligible gate targets ─────────────────────────
const plan = RoutingServiceV2.prepareOutsideRoutingPlan({ userCoordinate: OUTSIDE_NORTH_EAST, destination: DESTINATION });
assert(plan, 'prepareOutsideRoutingPlan must produce a plan for a normal outside coordinate + reachable destination');
assert(plan.candidates.length > 1, 'fixture must have multiple eligible candidate gates');
assert(
  plan.candidates.every((candidate) => candidate.candidateId === candidate.gateId),
  'candidateId must equal gateId (stable identity, no invented ID scheme)',
);
assert(
  plan.candidates.every((candidate) => Number.isFinite(candidate.internalCostM) && candidate.internalCostM >= 0),
  'every candidate must carry a valid, non-negative internal cost (internal-path-exists filter must have run)',
);
assert(
  plan.candidates.every((candidate) => candidate.connectorCostM === 0),
  'connectorCostM must be 0 for every candidate — provider route target is the gate’s own coordinate, no invented offset',
);
assert(
  plan.candidates.every((candidate) => candidate.penaltyM === 0),
  'no current gate carries a needs_verification penalty after the Gate 13/14 fix',
);
assert(plan.candidates.some((candidate) => candidate.gateId === 'GATE_03'), 'owner-supplied Gate03/R2-06/R2-07 ground truth must make Gate03 an eligible candidate');
for (const disconnected of ['GATE_18', 'GATE_19']) {
  assert(!plan.candidates.some((candidate) => candidate.gateId === disconnected), `disconnected ${disconnected} must be excluded from eligible candidates`);
}
assert.equal(plan.requestId, RoutingServiceV2.prepareOutsideRoutingPlan({ userCoordinate: OUTSIDE_NORTH_EAST, destination: DESTINATION })!.requestId, 'requestId must be stable/deterministic for identical inputs');

// ─── Gate 12 must be a normal, fully eligible candidate ─────────────────────
const gate12Candidate = plan.candidates.find((candidate) => candidate.gateId === 'GATE_12');
assert(gate12Candidate, 'Gate 12 must be an eligible outside-routing candidate for this destination');
assert.deepEqual(
  gate12Candidate.providerRouteTargetCoordinate,
  { latitude: 24.963676, longitude: 67.006339 },
  'Gate 12 provider route-target coordinate must be its exact official coordinate',
);
assert.equal(gate12Candidate.connectorCostM, 0, 'Gate 12 connector cost must be 0 (provider targets the literal gate coordinate)');
assert.equal(gate12Candidate.penaltyM, 0, 'Gate 12 must carry no verification penalty');

const gate12OsmCandidate = RoutingServiceV2.resolveOfflineOsmOutsideCandidate(OUTSIDE_NORTH_EAST, 'GATE_12');
assert(gate12OsmCandidate, 'offline OSM candidate resolver must produce a result for Gate 12');
assert(gate12OsmCandidate.outsideDistanceM > 0, 'Gate 12 OSM outside distance must be a real positive distance');
assert.equal(gate12OsmCandidate.candidateId, 'GATE_12');

// ─── Narrow per-gate offline OSM candidate resolver ─────────────────────────
assert.equal(
  RoutingServiceV2.resolveOfflineOsmOutsideCandidate(OUTSIDE_NORTH_EAST, 'GATE_06'),
  null,
  'resolver must return null for a gate that does not exist',
);
assert.equal(
  RoutingServiceV2.resolveOfflineOsmOutsideCandidate({ latitude: 0, longitude: 0 }, 'GATE_01'),
  null,
  'resolver must return null outside the bundled street graph radius',
);

// ─── Finalization selects by complete journey, not raw outside distance ────
{
  const nearOutsideFarInternalGateId = 'GATE_20'; // known fixture: near-outside, far-internal to B34 (test-route-selection-total-cost-v2.ts)
  const farOutsideNearInternalGateId = 'GATE_15'; // known fixture: beeline-mode complete-journey winner for B34
  const candidateA = plan.candidates.find((candidate) => candidate.gateId === nearOutsideFarInternalGateId);
  const candidateB = plan.candidates.find((candidate) => candidate.gateId === farOutsideNearInternalGateId);
  assert(candidateA && candidateB, 'fixture requires both GATE_20 and GATE_15 as eligible plan candidates for B34');

  const totalCoreCostA = candidateA.connectorCostM + candidateA.penaltyM + candidateA.internalCostM;
  const totalCoreCostB = candidateB.connectorCostM + candidateB.penaltyM + candidateB.internalCostM;

  // Deliberately invert raw outside distance: A gets an unrealistically tiny
  // outside distance ("nearest by outside leg alone"), B gets just enough
  // outside distance that its complete-journey total still undercuts A's by
  // exactly 1m — proving the winner is chosen by total cost, not by which
  // candidate's outsideDistanceM is smallest.
  const fakeOutsideA = 1;
  const fakeOutsideB = totalCoreCostA + fakeOutsideA - totalCoreCostB - 1;
  assert(fakeOutsideB > fakeOutsideA, 'fixture sanity: B’s fake outside distance must be far larger than A’s to make this a real test of the policy');

  const result = RoutingServiceV2.finalizeOutsideRoutingPlan({
    plan,
    outsideCandidates: candidateSet([
      normalizedCandidate(candidateA.gateId, fakeOutsideA, 'candidate-near-outside'),
      normalizedCandidate(candidateB.gateId, fakeOutsideB, 'candidate-complete-journey-winner'),
    ]),
    walkingSpeedMs: 1.4,
  });

  assert(result, 'finalizeOutsideRoutingPlan must produce a route');
  assert.equal(
    result.startResolution?.gate?.id,
    farOutsideNearInternalGateId,
    'must select by complete-journey cost, not by raw outside distance alone (A had the smaller outsideDistanceM but the larger total)',
  );
  assert.equal(result.selectedOutsideCandidateId, 'candidate-complete-journey-winner', 'selectedOutsideCandidateId must echo the winning provider candidate exactly');
  assert.equal(
    result.startResolution?.candidateNodes[0],
    farOutsideNearInternalGateId,
    'internal route must start from the same gate the outside leg ended at',
  );

  // No double counting: routeCostM must equal exactly outsideDistance +
  // connectorCost + penalty + internalCost — no extra term, no missing term.
  const expectedRouteCostM = Math.round(fakeOutsideB + candidateB.connectorCostM + candidateB.penaltyM + candidateB.internalCostM);
  assert.equal(
    result.routeCostM,
    expectedRouteCostM,
    `routeCostM must equal outsideDistance + connectorCost + penalty + internalCost exactly (no double counting); expected ${expectedRouteCostM}, got ${result.routeCostM}`,
  );
  assert.equal(
    result.startConnectorDistanceM,
    Math.round(fakeOutsideB + candidateB.connectorCostM),
    'startConnectorDistanceM must equal outsideDistance + connectorCost only (not penalty/internal)',
  );
}

// ─── Manual gate override remains authoritative ─────────────────────────────
{
  const manualPlan = RoutingServiceV2.prepareOutsideRoutingPlan({
    userCoordinate: OUTSIDE_NORTH_EAST,
    destination: DESTINATION,
    manualGateId: 'GATE_15',
  });
  assert(manualPlan, 'manual gate plan must be producible');
  assert.equal(manualPlan.candidates.length, 1, 'manual gate plan must contain exactly one candidate');
  assert.equal(manualPlan.candidates[0].gateId, 'GATE_15');

  const manualResult = RoutingServiceV2.finalizeOutsideRoutingPlan({
    plan: manualPlan,
    outsideCandidates: candidateSet([
      normalizedCandidate('GATE_15', 500, 'manual-gate-15'),
      // A candidate for a gate outside the manual plan must be ignored —
      // the provider layer must never be able to override a manual choice
      // by supplying an alternative, even a cheaper-looking one.
      normalizedCandidate('GATE_01', 1, 'provider-cannot-override-manual'),
    ]),
    walkingSpeedMs: 1.4,
  });
  assert(manualResult, 'manual override finalize must produce a route');
  assert.equal(manualResult.startResolution?.gate?.id, 'GATE_15', 'manual gate override must remain authoritative');
  assert.equal(manualResult.startResolution?.startType, 'selected_official_gate');
  assert.equal(manualResult.selectedOutsideCandidateId, 'manual-gate-15');

  assert.equal(
    RoutingServiceV2.prepareOutsideRoutingPlan({ userCoordinate: OUTSIDE_NORTH_EAST, destination: DESTINATION, manualGateId: 'GATE_18' }),
    null,
    'manual selection of a disconnected gate must not produce a plan',
  );
  assert.equal(
    RoutingServiceV2.prepareOutsideRoutingPlan({ userCoordinate: OUTSIDE_NORTH_EAST, destination: DESTINATION, manualGateId: 'GATE_06' }),
    null,
    'manual selection of a nonexistent gate must not produce a plan',
  );
}

// ─── Stale or incomplete candidate sets are rejected safely ────────────────
{
  assert.equal(
    RoutingServiceV2.finalizeOutsideRoutingPlan({ plan, outsideCandidates: candidateSet([]), walkingSpeedMs: 1.4 }),
    null,
    'empty outsideCandidates must return null, not throw',
  );
  assert.equal(
    RoutingServiceV2.finalizeOutsideRoutingPlan({
      plan,
      outsideCandidates: candidateSet([normalizedCandidate('GATE_99', 5, 'unknown-candidate')]),
      walkingSpeedMs: 1.4,
    }),
    null,
    'a candidate set containing only unknown candidate ids must return null, not throw',
  );

  assert(plan.candidates.length >= 3, 'fixture requires at least 3 eligible candidates for the partial-validity check');
  const partiallyValid = RoutingServiceV2.finalizeOutsideRoutingPlan({
    plan,
    outsideCandidates: candidateSet([
      normalizedCandidate(plan.candidates[0].gateId, -5, 'invalid-negative'),
      normalizedCandidate(plan.candidates[1].gateId, Number.NaN, 'invalid-non-finite'),
      normalizedCandidate(plan.candidates[2].gateId, 100, 'remaining-valid'),
    ]),
    walkingSpeedMs: 1.4,
  });
  assert(partiallyValid, 'a partially-invalid candidate set must still produce a route from the remaining valid candidate');
  assert.equal(partiallyValid.selectedOutsideCandidateId, 'remaining-valid', 'the one valid candidate must be the one selected');
}

// ─── Initial routing / rerouting parity, cross-checked against calculateRoute ──
{
  const scenarios: Array<{ label: string; coordinate: { latitude: number; longitude: number } }> = [
    { label: 'initial', coordinate: OUTSIDE_NORTH_EAST },
    { label: 'reroute', coordinate: { latitude: 24.9745, longitude: 67.0105 } },
  ];

  for (const scenario of scenarios) {
    const scenarioPlan = RoutingServiceV2.prepareOutsideRoutingPlan({ userCoordinate: scenario.coordinate, destination: DESTINATION });
    assert(scenarioPlan, `${scenario.label}: plan must be producible`);

    const outsideCandidates = scenarioPlan.candidates.flatMap((planCandidate) => {
      const resolved = RoutingServiceV2.resolveOfflineOsmOutsideCandidate(scenario.coordinate, planCandidate.gateId);
      return resolved ? [fromOsmCandidate(planCandidate.gateId, resolved)] : [];
    });
    assert(outsideCandidates.length > 0, `${scenario.label}: at least one offline OSM candidate must resolve`);

    const finalized = RoutingServiceV2.finalizeOutsideRoutingPlan({ plan: scenarioPlan, outsideCandidates: candidateSet(outsideCandidates), walkingSpeedMs: 1.4 });
    assert(finalized, `${scenario.label}: finalize must produce a route`);

    const directRoute = RoutingServiceV2.calculateRoute({
      start: { type: 'outside_coordinate', coordinate: scenario.coordinate },
      destination: DESTINATION,
    });
    assert(directRoute, `${scenario.label}: direct calculateRoute must also succeed`);

    assert.equal(
      finalized.startResolution?.gate?.id,
      directRoute.startResolution?.gate?.id,
      `${scenario.label}: prepare/finalize (fed by the offline OSM resolver) must select the same gate as calculateRoute's own street-graph path — got ${finalized.startResolution?.gate?.id} vs ${directRoute.startResolution?.gate?.id}`,
    );
    assert.equal(finalized.startResolution?.gate?.id, finalized.outsideRoute?.gateId, `${scenario.label}: outside and internal legs must agree on the same gate`);
  }

  console.log('Initial routing and rerouting selected the same gate as calculateRoute in both scenarios.');
}

delete process.env.EXPO_PUBLIC_USE_IJTEMA_OUTSIDE_STREET_GRAPH;

console.log('Core provider routing contract v2 checks passed.');

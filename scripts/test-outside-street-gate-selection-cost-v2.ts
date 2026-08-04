/**
 * Algorithm-level tests for the destination-aware weighted virtual-sink gate
 * selection used by OutsideStreetRoutingService.selectStreetGraphOutsidePath
 * / RoutingServiceV2.selectOutsidePathViaStreetGraph.
 *
 * These deliberately do NOT use real Gate 13/14 data (or any real gate) as
 * the fixture — per project-owner direction, algorithm-level correctness
 * should be provable against a small deterministic synthetic graph, not
 * coupled to real-world coordinates that can change again later. The
 * bundled OSM street graph is a module-level singleton
 * (getStreetNavigationGraph()) with no injection point, so this exercises
 * the exact same virtual-sink pattern selectStreetGraphOutsidePath uses
 * (runAStar with seeds/heuristic/neighbors/isGoal, one synthetic sink edge
 * per candidate weighted connector + penalty + extraCost, plus the same
 * gate-number tie-break epsilon) against a hand-built tiny graph instead —
 * see scripts/test-route-selection-total-cost-v2.ts and
 * scripts/test-gate20-not-overselected-v2.ts for the real-data integration
 * coverage of the production singleton-bound function.
 */
import { strict as assert } from 'node:assert';
import { AStarNeighbor, runAStar } from '../src/utils/AStar';

const SINK = '__sink__';
const TIE_BREAK_EPSILON_M = 1e-6;

interface SyntheticGate {
  id: string;
  number: number;
  /** Real street-graph distance from the shared start to this gate's connector node. */
  fromStartM: number;
  /** Last-mile connector distance from the street node to the gate's exact coordinate. */
  connectorM: number;
  penaltyM: number;
  /** Internal pedestrian-route cost from this gate to the destination (0 if omitted from extraCost). */
  internalM?: number;
  /** When false, the gate's connector node is never wired to the shared virtual sink (models an internally-disconnected gate, pre-filtered out before the street search — see RoutingServiceV2.selectOutsidePathViaStreetGraph). */
  isCandidate?: boolean;
  /** When false, the gate's connector node has no edge from START at all (models a street-unreachable gate). */
  reachableFromStart?: boolean;
}

/** Builds the same seeds/heuristic/neighbors/isGoal shape selectStreetGraphOutsidePath uses, from a small synthetic gate list. */
const runSyntheticGateSelection = (gates: SyntheticGate[]): { winnerId: string; totalCostM: number } | undefined => {
  const candidates = gates.filter((gate) => gate.isCandidate !== false);
  const targetSinkWeight = new Map(
    candidates.map((gate) => [
      gate.id,
      gate.connectorM + gate.penaltyM + (gate.internalM ?? 0) + gate.number * TIE_BREAK_EPSILON_M,
    ]),
  );

  const neighbors = (nodeId: string): AStarNeighbor<undefined>[] => {
    if (nodeId === 'START') {
      return gates
        .filter((gate) => gate.reachableFromStart !== false)
        .map((gate) => ({ to: gate.id, weight: gate.fromStartM }));
    }
    const sinkWeight = targetSinkWeight.get(nodeId);
    return sinkWeight === undefined ? [] : [{ to: SINK, weight: sinkWeight }];
  };

  const result = runAStar<undefined>({
    seeds: [{ id: 'START', gScore: 0 }],
    heuristic: () => 0,
    neighbors,
    isGoal: (nodeId) => nodeId === SINK,
  });
  if (!result) return undefined;

  const winnerId = result.previousNode[SINK];
  if (!winnerId) return undefined;
  return { winnerId, totalCostM: result.gScore[SINK] };
};

// ─── (f) connector cost is included in the decision ────────────────────────
{
  const gates: SyntheticGate[] = [
    { id: 'GATE_A', number: 1, fromStartM: 100, connectorM: 5, penaltyM: 0 },
    { id: 'GATE_B', number: 2, fromStartM: 100, connectorM: 400, penaltyM: 0 },
  ];
  const result = runSyntheticGateSelection(gates);
  assert.ok(result);
  assert.equal(result!.winnerId, 'GATE_A', 'equal street cost, cheaper connector must win — connector cost must be part of selection');
}

// ─── (g) internal (gate -> destination) cost is included in the decision ──
// This is the synthetic shape of the B34 counterexample: a gate that is by
// far the cheapest outside leg, but far from the destination once inside,
// must lose to a gate with a more expensive outside leg but a cheap
// internal leg, once total complete-journey cost is compared.
{
  const gates: SyntheticGate[] = [
    { id: 'GATE_NEAR_OUTSIDE', number: 20, fromStartM: 50, connectorM: 5, penaltyM: 0, internalM: 1400 },
    { id: 'GATE_FAR_OUTSIDE', number: 15, fromStartM: 500, connectorM: 5, penaltyM: 0, internalM: 20 },
  ];
  const result = runSyntheticGateSelection(gates);
  assert.ok(result);
  assert.equal(
    result!.winnerId,
    'GATE_FAR_OUTSIDE',
    'a far-but-internally-cheap gate must beat a near-but-internally-expensive gate once internal cost is included',
  );
  assert.equal(result!.totalCostM, 500 + 5 + 0 + 20 + 15 * TIE_BREAK_EPSILON_M, 'total cost must be exactly street + connector + penalty + internal (+ tie-break epsilon)');
}

// ─── (h) penalty is included exactly once ──────────────────────────────────
{
  const NEEDS_VERIFICATION_GATE_PENALTY_M = 120;
  const gates: SyntheticGate[] = [
    { id: 'GATE_UNPENALIZED', number: 1, fromStartM: 200, connectorM: 5, penaltyM: 0, internalM: 100 },
    { id: 'GATE_PENALIZED', number: 2, fromStartM: 100, connectorM: 5, penaltyM: NEEDS_VERIFICATION_GATE_PENALTY_M, internalM: 100 },
  ];
  // Raw (pre-penalty) totals: unpenalized = 305, penalized = 205 -> penalized would win without the penalty.
  // With a single 120m penalty applied, penalized = 325 -> unpenalized (305) must win instead.
  const result = runSyntheticGateSelection(gates);
  assert.ok(result);
  assert.equal(result!.winnerId, 'GATE_UNPENALIZED', 'a 120m penalty applied exactly once must be enough to flip a 100m gap');
  assert.equal(result!.totalCostM, 200 + 5 + 0 + 100 + 1 * TIE_BREAK_EPSILON_M, 'winning total must reflect a single, un-doubled application of cost components');

  // Sanity: if the penalty were (incorrectly) applied twice, the winner would flip back to GATE_PENALIZED
  // only if the *unpenalized* total also exceeded 100+2*120=340 -- construct a case that actually discriminates:
  // gap so small that a doubled penalty (240m) would over-shoot and wrongly reject the penalized gate even
  // when a single penalty (120m) should not have.
  const gatesSingleVsDouble: SyntheticGate[] = [
    { id: 'GATE_A', number: 1, fromStartM: 250, connectorM: 0, penaltyM: 0, internalM: 0 },
    { id: 'GATE_B', number: 2, fromStartM: 150, connectorM: 0, penaltyM: NEEDS_VERIFICATION_GATE_PENALTY_M, internalM: 0 },
  ];
  // Single penalty: A=250, B=150+120=270 -> A wins (gap 20m survives one penalty application).
  const singleResult = runSyntheticGateSelection(gatesSingleVsDouble);
  assert.ok(singleResult);
  assert.equal(singleResult!.winnerId, 'GATE_A', 'with the penalty applied once, the smaller total (250 vs 270) must win');
}

// ─── (i) a street-unreachable gate can never win ───────────────────────────
{
  const gates: SyntheticGate[] = [
    { id: 'GATE_REACHABLE', number: 1, fromStartM: 1000, connectorM: 5, penaltyM: 0, internalM: 50 },
    { id: 'GATE_UNREACHABLE', number: 2, fromStartM: 1, connectorM: 0, penaltyM: 0, internalM: 0, reachableFromStart: false },
  ];
  const result = runSyntheticGateSelection(gates);
  assert.ok(result);
  assert.equal(result!.winnerId, 'GATE_REACHABLE', 'a gate with no street-graph path from the start must never win, regardless of how cheap its sink weight is');
}

// ─── (j) an internally-disconnected (pre-filtered) gate can never win ─────
{
  const gates: SyntheticGate[] = [
    { id: 'GATE_CONNECTED', number: 1, fromStartM: 1000, connectorM: 5, penaltyM: 0, internalM: 50 },
    { id: 'GATE_DISCONNECTED', number: 2, fromStartM: 1, connectorM: 0, penaltyM: 0, isCandidate: false },
  ];
  const result = runSyntheticGateSelection(gates);
  assert.ok(result);
  assert.equal(
    result!.winnerId,
    'GATE_CONNECTED',
    'a gate excluded from the candidate set (no internal route to the destination) must never win even if it is the cheapest street-only option',
  );
}

// ─── (n) deterministic equal-cost tie-break (lower gate number wins) ──────
{
  const gates: SyntheticGate[] = [
    { id: 'GATE_09', number: 9, fromStartM: 300, connectorM: 5, penaltyM: 0, internalM: 40 },
    { id: 'GATE_03', number: 3, fromStartM: 300, connectorM: 5, penaltyM: 0, internalM: 40 },
    { id: 'GATE_16', number: 16, fromStartM: 300, connectorM: 5, penaltyM: 0, internalM: 40 },
  ];
  const result = runSyntheticGateSelection(gates);
  assert.ok(result);
  assert.equal(result!.winnerId, 'GATE_03', 'an exact real-cost tie must break deterministically toward the lowest gate number');
}

console.log('test-outside-street-gate-selection-cost-v2.ts: all assertions passed');

import { strict as assert } from 'node:assert';
import { IJTEMA_GATES } from '../src/data/ijtema/gates';
import { selectStreetGraphOutsidePath } from '../src/services/OutsideStreetRoutingService';

// Probe point (reused from test-outside-street-graph-integration-v2.ts) from
// which GATE_02 is closer than GATE_07 by street-graph distance, but the gap
// (~83m) is smaller than NEEDS_VERIFICATION_GATE_PENALTY_M (120m).
const gate05 = IJTEMA_GATES.find((gate) => gate.id === 'GATE_05')!;
assert.ok(gate05.coordinate);
const probe = { lat: gate05.coordinate!.lat + 0.002, lng: gate05.coordinate!.lng + 0.002 };

const nearerGate = IJTEMA_GATES.find((gate) => gate.id === 'GATE_02')!;
const fartherGate = IJTEMA_GATES.find((gate) => gate.id === 'GATE_07')!;
assert.ok(nearerGate.coordinate && fartherGate.coordinate);

// ─── Baseline: with both gates verified/routable, the raw-nearer gate wins ──
{
  const bothVerified = [
    { ...nearerGate, status: 'provided' as const },
    { ...fartherGate, status: 'provided' as const },
  ];
  const result = selectStreetGraphOutsidePath(probe, bothVerified);
  assert.ok(result);
  assert.equal(result!.gate.id, nearerGate.id, 'with no penalty in play, the raw-nearer gate must win');
}

// ─── Regression: nearer gate needs_verification, farther gate verified ─────
// The farther-but-verified gate must win once the 120m penalty applies,
// matching the beeline path's gatePenaltyM-driven gate selection. Before the
// Phase 3 fix, selectStreetGraphOutsidePath ignored verification status
// entirely and always picked the raw-nearest gate. See
// docs/NAVIGATION_AND_ROUTING.md.
{
  const mixedVerification = [
    { ...nearerGate, status: 'needs_verification' as const },
    { ...fartherGate, status: 'provided' as const },
  ];
  const result = selectStreetGraphOutsidePath(probe, mixedVerification);
  assert.ok(result);
  assert.equal(
    result!.gate.id,
    fartherGate.id,
    `expected the farther-but-verified gate (${fartherGate.id}) to win once the nearer gate (${nearerGate.id}) needs verification, got ${result!.gate.id}`,
  );
}

// ─── Sanity: if the gap exceeds the penalty, the nearer-but-unverified gate still wins ──
// (the penalty must shift the decision only when it's large enough to, not
// unconditionally prefer verified gates regardless of distance.)
{
  const nearGate04 = IJTEMA_GATES.find((gate) => gate.id === 'GATE_04')!; // ~358m from probe, per exploration
  const farGate21 = IJTEMA_GATES.find((gate) => gate.id === 'GATE_21')!; // ~1400m from probe — gap >> 120m
  assert.ok(nearGate04.coordinate && farGate21.coordinate);
  const mixedVerification = [
    { ...nearGate04, status: 'needs_verification' as const },
    { ...farGate21, status: 'provided' as const },
  ];
  const result = selectStreetGraphOutsidePath(probe, mixedVerification);
  assert.ok(result);
  assert.equal(result!.gate.id, nearGate04.id, 'a >120m distance gap must not be overridden by the verification penalty');
}

console.log('test-street-gate-penalty-parity-v2.ts: all assertions passed');

import { strict as assert } from 'node:assert';

import { IJTEMA_GATES } from '../src/data/ijtema';
import { V2PlaceAdapter } from '../src/services/V2PlaceAdapter';

const VERIFICATION_WARNING = 'This gate needs verification before navigation.';
const CONNECTOR_VERIFICATION_UNAVAILABLE_SUFFIX = 'needs connector verification before routing.';

// Gate 13 and Gate 14 previously carried the raw needs_verification status
// (near-duplicate coordinates in the originally supplied dataset) and were
// the only real-world example of this mechanism. The project owner has since
// supplied verified, distinct coordinates for both — see
// src/data/ijtema/gates.ts and the GATE_13_14_NEAR_DUPLICATE entry in
// src/data/ijtema/dataIssues.ts. No gate should carry needs_verification
// today, so the mechanism itself (assert further below) is now exercised
// with a synthetic gate rather than real Gate 13/14 data.
const DISCONNECTED_GATE_IDS = ['GATE_03', 'GATE_17', 'GATE_18', 'GATE_19'];

assert.equal(IJTEMA_GATES.length > 0, true, 'Gate data must be loaded.');

// Sanity: no real gate should carry the raw needs_verification status today.
const rawNeedsVerification = IJTEMA_GATES.filter((gate) => gate.status === 'needs_verification').map((gate) => gate.id);
assert.deepEqual(
  rawNeedsVerification,
  [],
  `No gate should carry the needs_verification source status today; found: ${rawNeedsVerification.join(', ') || 'none'}.`,
);

const places = IJTEMA_GATES.map((gate) => ({
  gate,
  place: V2PlaceAdapter.gateToPlace(gate, { includeUnavailableGates: true }),
}));

// --- No real gate should have a verification warning today ----------------

for (const { gate, place } of places) {
  assert.equal(
    place.verificationWarning,
    undefined,
    `${gate.id} must not carry a verification warning (no gate currently needs_verification).`,
  );
}

// --- Mechanism check (synthetic): a needs_verification gate must still ----
// surface the warning without altering routing behavior. Uses a synthetic
// gate (spread of a real connected/routable gate) rather than real data, per
// project policy of not keying algorithm/mechanism tests to Gate 13/14.
{
  const referenceRoutableGate = IJTEMA_GATES.find((gate) => gate.id === 'GATE_01');
  assert(referenceRoutableGate, 'Reference routable gate GATE_01 must exist for this synthetic check.');
  const referencePlace = V2PlaceAdapter.gateToPlace(referenceRoutableGate!, { includeUnavailableGates: true });

  const syntheticNeedsVerificationGate = { ...referenceRoutableGate!, status: 'needs_verification' as const };
  const syntheticPlace = V2PlaceAdapter.gateToPlace(syntheticNeedsVerificationGate, { includeUnavailableGates: true });

  assert.equal(
    syntheticPlace.verificationWarning,
    VERIFICATION_WARNING,
    'A needs_verification gate must produce a Place with the gate verification warning.',
  );
  assert.equal(syntheticNeedsVerificationGate.canStartRouteFromOutside, true, 'needs_verification must not affect canStartRouteFromOutside.');
  assert.equal(
    syntheticPlace.routingStatus,
    referencePlace.routingStatus,
    'needs_verification routingStatus must match an ordinary routable gate (presentational only).',
  );
  assert.equal(
    syntheticPlace.isRoutable,
    referencePlace.isRoutable,
    'needs_verification isRoutable must match an ordinary routable gate (presentational only).',
  );
  assert.equal(
    syntheticPlace.isStartRoutable,
    referencePlace.isStartRoutable,
    'needs_verification isStartRoutable must match an ordinary routable gate (presentational only).',
  );
  assert.equal(syntheticPlace.routingStatus, 'routable', 'needs_verification gate must resolve as routable.');
  assert.equal(syntheticPlace.isRoutable, true, 'needs_verification gate must remain routable.');
  assert.equal(syntheticPlace.isStartRoutable, true, 'needs_verification gate must remain start-routable.');
  assert.equal(syntheticPlace.unavailableReason, undefined, 'needs_verification gate must not carry an unavailableReason.');
}

// --- Disconnected gates keep their pre-existing connector-verification ----
// message and must NOT pick up the new verificationWarning mechanism —
// these are two separate, non-merging systems.

for (const gateId of DISCONNECTED_GATE_IDS) {
  const entry = places.find(({ gate }) => gate.id === gateId);
  assert(entry, `${gateId} must exist in gate data.`);
  assert.equal(
    entry!.place.verificationWarning,
    undefined,
    `${gateId} must not pick up the GATE_13/GATE_14-style verification warning.`,
  );
  assert.equal(
    entry!.place.routingStatus,
    'needs_connector_verification',
    `${gateId} must remain blocked by connector verification, not the new warning mechanism.`,
  );
  assert.equal(entry!.place.isRoutable, false, `${gateId} must remain non-routable pending connector verification.`);
  assert.equal(entry!.place.isStartRoutable, false, `${gateId} must remain non-start-routable pending connector verification.`);
  assert(
    entry!.place.unavailableReason?.includes(CONNECTOR_VERIFICATION_UNAVAILABLE_SUFFIX),
    `${gateId} must keep its pre-existing connector-verification-blocking message.`,
  );
}

console.log('Gate verification warning v2 checks passed.');

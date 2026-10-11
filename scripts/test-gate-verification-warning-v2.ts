import { strict as assert } from 'node:assert';

import { IJTEMA_GATES } from '../src/data/ijtema';
import { V2PlaceAdapter } from '../src/services/V2PlaceAdapter';

const VERIFICATION_WARNING = 'Directions to this gate may be less exact.';
const CONNECTOR_VERIFICATION_UNAVAILABLE_SUFFIX = 'are not ready yet.';

// Gate 13 and Gate 14 previously carried the raw needs_verification status
// (near-duplicate coordinates in the originally supplied dataset) and were
// the only real-world example of this mechanism. The project owner has since
// supplied verified, distinct coordinates for both — see
// src/data/ijtema/gates.ts and the GATE_13_14_NEAR_DUPLICATE entry in
// src/data/ijtema/dataIssues.ts. Gate 19 is now the sole current example: its
// physical connector is deliberately deferred pending ground truth, so it
// carries both a source-verification warning and a connector-routing block.
// Gate 03 was resolved by owner-supplied Gate03/R2-06/R2-07 ground truth and
// is no longer in this set.
const DISCONNECTED_GATE_IDS = ['GATE_18', 'GATE_19'];

assert.equal(IJTEMA_GATES.length > 0, true, 'Gate data must be loaded.');

// Sanity: only the explicitly deferred Gate 19 may carry the raw status.
const rawNeedsVerification = IJTEMA_GATES.filter((gate) => gate.status === 'needs_verification').map((gate) => gate.id);
assert.deepEqual(
  rawNeedsVerification,
  ['GATE_19'],
  `Only Gate 19 should carry needs_verification pending connector ground truth; found: ${rawNeedsVerification.join(', ') || 'none'}.`,
);

const places = IJTEMA_GATES.map((gate) => ({
  gate,
  place: V2PlaceAdapter.gateToPlace(gate, { includeUnavailableGates: true }),
}));

// --- Only Gate 19 should have a current verification warning ---------------

for (const { gate, place } of places) {
  assert.equal(
    place.verificationWarning,
    gate.id === 'GATE_19' ? VERIFICATION_WARNING : undefined,
    `${gate.id} verification warning must reflect its source status.`,
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
// message. Gate 19 also keeps its source-verification warning; the two
// signals describe different evidence and must not silently cancel each other.

for (const gateId of DISCONNECTED_GATE_IDS) {
  const entry = places.find(({ gate }) => gate.id === gateId);
  assert(entry, `${gateId} must exist in gate data.`);
  assert.equal(
    entry!.place.verificationWarning,
    gateId === 'GATE_19' ? VERIFICATION_WARNING : undefined,
    `${gateId} source-verification warning must remain independent of connector routing status.`,
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

import { strict as assert } from 'node:assert';

import { IJTEMA_GATES } from '../src/data/ijtema';
import { V2PlaceAdapter } from '../src/services/V2PlaceAdapter';

const VERIFICATION_WARNING = 'This gate needs verification before navigation.';
const CONNECTOR_VERIFICATION_UNAVAILABLE_SUFFIX = 'needs connector verification before routing.';

const NEEDS_VERIFICATION_GATE_IDS = ['GATE_13', 'GATE_14'];
const DISCONNECTED_GATE_IDS = ['GATE_03', 'GATE_17', 'GATE_18', 'GATE_19'];

assert.equal(IJTEMA_GATES.length > 0, true, 'Gate data must be loaded.');

// Sanity: exactly GATE_13/GATE_14 carry the raw needs_verification status.
const rawNeedsVerification = IJTEMA_GATES.filter((gate) => gate.status === 'needs_verification').map((gate) => gate.id);
assert.deepEqual(
  rawNeedsVerification.sort(),
  [...NEEDS_VERIFICATION_GATE_IDS].sort(),
  'Only GATE_13 and GATE_14 should carry the needs_verification source status.',
);

const places = IJTEMA_GATES.map((gate) => ({
  gate,
  place: V2PlaceAdapter.gateToPlace(gate, { includeUnavailableGates: true }),
}));

// --- GATE_13 / GATE_14 must surface the verification warning --------------

for (const gateId of NEEDS_VERIFICATION_GATE_IDS) {
  const entry = places.find(({ gate }) => gate.id === gateId);
  assert(entry, `${gateId} must exist in gate data.`);
  assert.equal(
    entry!.place.verificationWarning,
    VERIFICATION_WARNING,
    `${gateId} must produce a Place with the gate verification warning.`,
  );
}

// --- Every other gate must NOT have a verification warning ----------------

for (const { gate, place } of places) {
  if (NEEDS_VERIFICATION_GATE_IDS.includes(gate.id)) continue;
  assert.equal(
    place.verificationWarning,
    undefined,
    `${gate.id} must not carry a verification warning (only GATE_13/GATE_14 do).`,
  );
}

// --- The warning must not alter routing behavior for GATE_13/GATE_14 ------
// Expected per docs/OUTSIDE_IJTEMA_ROUTING_RULE.md: hasCoordinate + connected
// graph node => routable. GATE_13/GATE_14 both have coordinates and are not
// in the disconnected-gate set, so routing fields must be identical to any
// other ordinary connected/routable gate (e.g. GATE_01), independent of the
// presentational verificationWarning.
const referenceRoutableGate = places.find(({ gate }) => gate.id === 'GATE_01');
assert(referenceRoutableGate, 'Reference routable gate GATE_01 must exist for comparison.');

for (const gateId of NEEDS_VERIFICATION_GATE_IDS) {
  const entry = places.find(({ gate }) => gate.id === gateId)!;
  assert.equal(entry.gate.canStartRouteFromOutside, true, `${gateId} canStartRouteFromOutside must be unaffected (true).`);
  assert.equal(
    entry.place.routingStatus,
    referenceRoutableGate!.place.routingStatus,
    `${gateId} routingStatus must match an ordinary routable gate (unaffected by the verification warning).`,
  );
  assert.equal(
    entry.place.isRoutable,
    referenceRoutableGate!.place.isRoutable,
    `${gateId} isRoutable must match an ordinary routable gate (unaffected by the verification warning).`,
  );
  assert.equal(
    entry.place.isStartRoutable,
    referenceRoutableGate!.place.isStartRoutable,
    `${gateId} isStartRoutable must match an ordinary routable gate (unaffected by the verification warning).`,
  );
  assert.equal(entry.place.routingStatus, 'routable', `${gateId} must resolve as routable.`);
  assert.equal(entry.place.isRoutable, true, `${gateId} must remain routable.`);
  assert.equal(entry.place.isStartRoutable, true, `${gateId} must remain start-routable.`);
  assert.equal(entry.place.unavailableReason, undefined, `${gateId} must not carry an unavailableReason.`);
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

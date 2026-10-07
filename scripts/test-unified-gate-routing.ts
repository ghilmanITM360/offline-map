import { strict as assert } from 'node:assert';
import { EntryGateRoutingService } from '../src/services/EntryGateRoutingService';
import { RoutingServiceV2 } from '../src/services/RoutingServiceV2';
import { IJTEMA_GATES } from '../src/data/ijtema';

// Pinned to beeline mode: this is specifically a beeline-era regression test
// (the exact expected gate, GATE_16, was computed under straight-line
// distances). Real street-graph distances legitimately differ per gate, so
// the complete-journey-cost argmin can differ between beeline and street
// mode for the same point+destination without that being a bug — see
// test-route-selection-total-cost-v2.ts / test-outside-street-gate-selection-cost-v2.ts
// for street-mode destination-aware-selection coverage. The invariant this
// file actually protects (recommendOutsideEntryGate == calculateRoute's
// chosen gate) holds by construction regardless of mode, since both call the
// same selectOutsidePath internally.
process.env.EXPO_PUBLIC_USE_IJTEMA_OUTSIDE_STREET_GRAPH = 'false';

// Phase 4 (unify Gate 08/14/15/16 routing): the Home outside-venue banner
// picked the nearest gate by straight-line distance only, ignoring any
// destination already selected in the place-detail sheet. Actual routing
// (RoutingServiceV2) picks the gate that minimises total cost to the
// destination. For a point at GATE_08 with a destination near the
// GATE_14/15/16 cluster, these disagreed: banner said GATE_08, routing said
// GATE_16 — reproduced live and recorded in the retired audit notes (repo history) as the
// "Gate 08 vs Gate 15/14 dual-implementation mismatch".
const gate08Coordinate = IJTEMA_GATES.find((gate) => gate.id === 'GATE_08')!.coordinate!;
const pointAtGate08 = { latitude: gate08Coordinate.lat, longitude: gate08Coordinate.lng };
const destinationNearEastCluster = { type: 'block' as const, blockId: 'B32' };

const nearestOnly = EntryGateRoutingService.findNearestOfficialEntryGateForOutsideUser(pointAtGate08);
assert.equal(nearestOnly?.id, 'GATE_08', 'sanity check: nearest-only selection for this point is GATE_08');

const routedGate = RoutingServiceV2.calculateRoute({
  start: { type: 'outside_coordinate', coordinate: pointAtGate08 },
  destination: destinationNearEastCluster,
})?.startResolution?.gate;
assert.equal(routedGate?.id, 'GATE_16', 'sanity check: destination-aware routing for B32 picks GATE_16, not GATE_08');

// The fix: a single shared entry point that both the banner and Directions
// call, so they can never disagree for the same position + destination.
const recommendedWithDestination = RoutingServiceV2.recommendOutsideEntryGate(pointAtGate08, destinationNearEastCluster);
assert.equal(
  recommendedWithDestination?.id,
  routedGate?.id,
  'recommendOutsideEntryGate must return the exact same gate RoutingServiceV2.calculateRoute would actually route through',
);

const recommendedWithoutDestination = RoutingServiceV2.recommendOutsideEntryGate(pointAtGate08, null);
assert.equal(
  recommendedWithoutDestination?.id,
  'GATE_08',
  'with no destination known, recommendOutsideEntryGate must fall back to nearest-gate (nothing to optimise against yet)',
);

console.log('Unified gate routing checks passed.');

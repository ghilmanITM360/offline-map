import { strict as assert } from 'node:assert';

import { distanceMeters } from '../src/data/ijtema/graphBuilder';
import { RoutingServiceV2 } from '../src/services/RoutingServiceV2';

process.env.EXPO_PUBLIC_USE_IJTEMA_V2_MAP = 'true';
process.env.EXPO_PUBLIC_USE_IJTEMA_V2_ROUTING = 'true';
// Pinned to beeline mode: this test is specifically about the single
// "Walk N meters to enter through Gate Y" beeline approach instruction
// (RoutingServiceV2.prependOutsideApproachInstruction's fallback branch).
// Under street-graph mode, instructions[0] is real street turn-by-turn
// instead (see test-street-instructions-v2.ts /
// test-outside-street-graph-integration-v2.ts for that coverage).
process.env.EXPO_PUBLIC_USE_IJTEMA_OUTSIDE_STREET_GRAPH = 'false';

const start = { latitude: 24.9762, longitude: 67.011 };
const route = RoutingServiceV2.calculateRoute({
  start: { type: 'outside_coordinate', coordinate: start },
  destination: { type: 'block', blockId: 'B34' },
});

assert(route, 'Outside route preview must be calculable.');
assert((route.startConnectorDistanceM ?? 0) > 0, 'Outside route must include current-location-to-entry connector distance.');

const first = route.coordinates[0];
const firstDistanceM = distanceMeters(
  { lat: start.latitude, lng: start.longitude },
  { lat: first.latitude, lng: first.longitude },
);

assert(
  firstDistanceM <= 2,
  `First route coordinate must be current/start location within tolerance. Got ${Math.round(firstDistanceM)}m away.`,
);
// Which specific gate wins is an algorithm-selection concern covered
// elsewhere (test-route-selection-total-cost-v2.ts,
// test-outside-street-gate-selection-cost-v2.ts) and can legitimately differ
// between beeline and street-graph mode (real street distances differ from
// straight-line per gate) — this test only checks that the first
// instruction correctly names whichever gate was actually selected.
const selectedGateLabel = route.startResolution?.gate?.name.en;
assert.ok(selectedGateLabel, 'Outside route must resolve a selected entry gate.');
assert.match(
  route.instructions[0]?.text ?? '',
  new RegExp(`enter through ${selectedGateLabel}`, 'i'),
  'Outside route first instruction must guide user from current location to the actually-selected entry gate.',
);

console.log('Current location polyline v2 checks passed.');

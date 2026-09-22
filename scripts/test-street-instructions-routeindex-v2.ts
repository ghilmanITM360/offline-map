import { strict as assert } from 'node:assert';
import { getDistance } from 'geolib';
import { IJTEMA_GATES } from '../src/data/ijtema/gates';
import { Place } from '../src/models/types';
import { RoutingServiceV2 } from '../src/services/RoutingServiceV2';
import { V2NavigationAdapter } from '../src/services/V2NavigationAdapter';

// MapFeatureFlagsService.readFlag() re-reads process.env on every call, so
// this is enough to force the street-graph outside-leg path on.
process.env.EXPO_PUBLIC_USE_IJTEMA_OUTSIDE_STREET_GRAPH = 'true';

const gate05 = IJTEMA_GATES.find((gate) => gate.id === 'GATE_05')!;
assert.ok(gate05.coordinate);
assert.ok(gate05.name.ur, 'Gate 05 fixture must have an Urdu name to exercise the bilingual regression check');
const gate05NameUr = gate05.name.ur!;
const probe = { latitude: gate05.coordinate!.lat + 0.0015, longitude: gate05.coordinate!.lng + 0.0015 };

const preview = RoutingServiceV2.calculateRoute({
  start: { type: 'outside_coordinate', coordinate: probe },
  destination: { type: 'block', blockId: 'B2' },
});
assert.ok(preview, 'expected a street-graph-routed preview for the routeIndex regression fixture');
assert.ok((preview!.outsideLegCoordinateCount ?? 0) > 1, 'fixture must exercise a real (multi-point) street-graph outside leg');

const destinationPlace: Place = {
  id: 'B2',
  name: 'Block 2',
  category: 'Block',
  description: 'Block 2',
  coordinate: preview!.coordinates[preview!.coordinates.length - 1],
  sourceVersion: 'v2',
  sourceKind: 'block',
};

const activeRoute = V2NavigationAdapter.fromPreview({
  previewRoute: preview!,
  destination: destinationPlace,
  currentLocation: probe,
});

// Regression: routeIndex used to be the instruction's position in the
// instructions array, unrelated to its actual position in
// activeRoute.coordinates. Every instruction must resolve to a coordinate
// close to its own `coordinate` field, and the sequence must never regress
// backward (each instruction happens later on the route than the last).
// See docs/OFFLINE_NAVIGATION_AND_ROUTING.md Phase 2.
let previousRouteIndex = -1;
activeRoute.instructions.forEach((instruction, index) => {
  assert.ok(
    instruction.routeIndex >= previousRouteIndex,
    `instruction ${index} (${instruction.id}) routeIndex=${instruction.routeIndex} regressed behind previous ${previousRouteIndex}`,
  );
  assert.ok(instruction.routeIndex >= 0 && instruction.routeIndex < activeRoute.coordinates.length, `instruction ${index} routeIndex out of bounds`);

  const resolvedCoordinate = activeRoute.coordinates[instruction.routeIndex];
  const distanceM = getDistance(resolvedCoordinate, instruction.coordinate);
  assert.ok(
    distanceM <= 5,
    `instruction ${index} (${instruction.id}) routeIndex points ${distanceM}m away from its own coordinate, expected <=5m`,
  );

  previousRouteIndex = instruction.routeIndex;
});

// The street-graph leg contributes far more rendering coordinates than
// instructions — confirms this fixture actually exercises the case where the
// old instruction-array-index shortcut broke down.
assert.ok(
  activeRoute.coordinates.length > activeRoute.instructions.length,
  'fixture must have more coordinates than instructions to be a meaningful regression check',
);

// Bilingual gate-name regression: the entry instruction's urduText must use
// Gate 05's authoritative Urdu name (gate05.name.ur), never the Latin label
// interpolated into Urdu copy.
const entryInstruction = activeRoute.instructions.find(
  (instruction) => instruction.id === 'v2-entry-start' || instruction.id === 'v2-outside-approach',
);
assert.ok(entryInstruction, 'expected an entry/outside-approach instruction naming the gate');
assert.ok(
  entryInstruction!.urduText?.includes(gate05NameUr),
  `entry instruction urduText must include the authoritative Urdu gate name "${gate05NameUr}", got: ${entryInstruction!.urduText}`,
);
assert.ok(
  !entryInstruction!.urduText?.includes(gate05.name.en),
  'entry instruction urduText must not embed the Latin gate label',
);

console.log(
  `test-street-instructions-routeindex-v2.ts: ${activeRoute.instructions.length} instructions resolved across ${activeRoute.coordinates.length} coordinates, all monotonic and within tolerance`,
);

delete process.env.EXPO_PUBLIC_USE_IJTEMA_OUTSIDE_STREET_GRAPH;
console.log('test-street-instructions-routeindex-v2.ts: all assertions passed');

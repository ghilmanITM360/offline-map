import { strict as assert } from 'node:assert';
import { IJTEMA_BLOCKS } from '../src/data/ijtema/blocks';
import { IJTEMA_GATES } from '../src/data/ijtema/gates';
import { RoutingServiceV2 } from '../src/services/RoutingServiceV2';
import { V2MapRenderingService } from '../src/services/V2MapRenderingService';

// MapFeatureFlagsService.readFlag() re-reads process.env on every call (no
// caching), so toggling the env var between calls below is enough — no
// module-cache-busting needed.
delete process.env.EXPO_PUBLIC_USE_IJTEMA_OUTSIDE_STREET_GRAPH;

// Probe point: near GATE_05, well inside the bundled street-graph radius.
const gate05 = IJTEMA_GATES.find((gate) => gate.id === 'GATE_05')!;
assert.ok(gate05.coordinate);
const probe = { latitude: gate05.coordinate!.lat + 0.0015, longitude: gate05.coordinate!.lng + 0.0015 };

// ─── Flag OFF (default): must stay a plain 2-point beeline outside leg, matching pre-street-graph behavior ──
{
  const route = RoutingServiceV2.calculateRoute({
    start: { type: 'outside_coordinate', coordinate: probe },
    destination: { type: 'block', blockId: 'B2' },
  });
  assert.ok(route, 'expected a route with the flag off');
  // outsideLegCoordinateCount=1 means the outside leg is exactly
  // [startCoordinate, gateCoordinate] — a straight beeline segment, per the
  // FINAL_SPEC UX flow ("applies to both street-graph and beeline outside
  // legs") — it is still a real, renderable outside leg, just a straight one.
  assert.equal(route!.outsideLegCoordinateCount ?? 0, 1, 'flag off must still mark a 1-point (beeline) outside leg for the two-color split');
  assert.equal(route!.outsideLegSanityCapExceeded, false);
  console.log(`Flag OFF: outsideLegCoordinateCount=${route!.outsideLegCoordinateCount ?? 0}, startLabel=${route!.startLabel}, totalDistance=${route!.totalDistance}m`);
}

// ─── Flag ON: must produce a road-following outside leg with more than the bare 2 endpoints ──
process.env.EXPO_PUBLIC_USE_IJTEMA_OUTSIDE_STREET_GRAPH = 'true';
{
  const route = RoutingServiceV2.calculateRoute({
    start: { type: 'outside_coordinate', coordinate: probe },
    destination: { type: 'block', blockId: 'B2' },
  });
  assert.ok(route, 'expected a route with the flag on');
  assert.ok(
    (route!.outsideLegCoordinateCount ?? 0) > 1,
    `flag on must produce a road-following outside leg with multiple points, got ${route!.outsideLegCoordinateCount}`,
  );
  assert.ok(route!.coordinates.length > (route!.outsideLegCoordinateCount ?? 0), 'route must still continue into the internal venue graph after the outside leg');

  // Real turn-by-turn: more than the single "walk to gate" blob the beeline case produces.
  const instructions = route!.instructions ?? [];
  const streetSteps = instructions.filter((instruction) => instruction.id.startsWith('v2-street-step-'));
  assert.ok(streetSteps.length >= 1, 'expected at least one street-graph turn-by-turn instruction');
  assert.ok(
    instructions.some((instruction) => instruction.text.includes('Gate 05')),
    'expected the entry instruction to reference the selected gate',
  );

  // Regression: outsideLegCoordinateCount must point at the actual shared
  // gate coordinate — not one node past it into the venue interior. See
  // docs/ROUTING_NAVIGATION_FIX_REPORT.md Phase 1.
  const boundaryCoordinate = route!.coordinates[route!.outsideLegCoordinateCount!];
  assert.ok(boundaryCoordinate, 'expected a coordinate at the outside/inside boundary index');
  assert.equal(boundaryCoordinate.latitude, gate05.coordinate!.lat, 'boundary coordinate must be the entry gate, not a node past it');
  assert.equal(boundaryCoordinate.longitude, gate05.coordinate!.lng, 'boundary coordinate must be the entry gate, not a node past it');

  const { outside, inside } = V2MapRenderingService.splitOutsideInsideCoordinates(route!.coordinates, route!.outsideLegCoordinateCount);
  assert.deepEqual(outside[outside.length - 1], inside[0], 'outside and inside polylines must share exactly one boundary point');
  assert.equal(outside[outside.length - 1].latitude, gate05.coordinate!.lat, 'shared boundary point must be the entry gate');
  assert.equal(outside[outside.length - 1].longitude, gate05.coordinate!.lng, 'shared boundary point must be the entry gate');

  console.log(`Flag ON: outsideLegCoordinateCount=${route!.outsideLegCoordinateCount}, totalCoordinates=${route!.coordinates.length}, streetSteps=${streetSteps.length}, startLabel=${route!.startLabel}, totalDistance=${route!.totalDistance}m, sanityCapExceeded=${route!.outsideLegSanityCapExceeded}`);
}

// ─── Flag ON but destination point is far outside the bundled radius: must fall back to beeline ──
{
  const farAway = { latitude: gate05.coordinate!.lat + 0.2, longitude: gate05.coordinate!.lng };
  const route = RoutingServiceV2.calculateRoute({
    start: { type: 'outside_coordinate', coordinate: farAway },
    destination: { type: 'block', blockId: 'B2' },
  });
  assert.ok(route, 'expected a beeline-fallback route for a point far beyond the bundled radius');
  assert.equal(route!.outsideLegCoordinateCount ?? 0, 1, 'beyond the radius must fall back to a plain (1-point) beeline even with the flag on');
  console.log(`Flag ON, beyond radius: outsideLegCoordinateCount=${route!.outsideLegCoordinateCount ?? 0} (beeline fallback confirmed)`);
}

// ─── inside_coordinate starts must never be marked as an outside leg ──────
// (they carry a leading startCoordinate too — "you're inside, walk to the
// graph" — a different concept from the outside/inside venue split.)
{
  // A block's own center is unambiguously inside the venue, unlike a small
  // offset from a gate (gates sit right at the perimeter, so a nearby offset
  // can easily land just outside it).
  const block20Center = IJTEMA_BLOCKS.find((block) => block.id === 'B20')!.center;
  const insideCoordinate = { latitude: block20Center.lat, longitude: block20Center.lng };
  const route = RoutingServiceV2.calculateRoute({
    start: { type: 'inside_coordinate', coordinate: insideCoordinate },
    destination: { type: 'block', blockId: 'B2' },
  });
  assert.ok(route, 'expected a route for an inside_coordinate start');
  assert.equal(route!.outsideLegCoordinateCount ?? 0, 0, 'inside_coordinate starts must not be marked as having an outside leg');
  console.log(`inside_coordinate start: outsideLegCoordinateCount=${route!.outsideLegCoordinateCount ?? 0} (correctly not an outside leg)`);
}

delete process.env.EXPO_PUBLIC_USE_IJTEMA_OUTSIDE_STREET_GRAPH;
console.log('test-outside-street-graph-integration-v2.ts: all assertions passed');

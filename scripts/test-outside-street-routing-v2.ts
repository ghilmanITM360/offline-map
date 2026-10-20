import { strict as assert } from 'node:assert';
import { IJTEMA_GATES } from '../src/data/ijtema/gates';
import { getIjtemaStreetRoutingGraph } from '../src/data/ijtema/streetAdapter';
import { getStreetNavigationGraph } from '../src/data/ijtema/streetGraphBuilder';
import {
  DISTANCE_SANITY_CAP_RATIO,
  isWithinStreetGraphRadius,
  selectStreetGraphOutsidePath,
} from '../src/services/OutsideStreetRoutingService';
import { haversineM } from '../src/utils/SpatialGrid';

const ijtemaStreet = getIjtemaStreetRoutingGraph();
const routableGates = IJTEMA_GATES.filter(
  (gate) => gate.coordinate && gate.routingStatus === 'routable' && gate.canStartRouteFromOutside,
);

// ─── isWithinStreetGraphRadius ──────────────────────────────────────────────
{
  const { metadata } = getStreetNavigationGraph();
  assert.equal(isWithinStreetGraphRadius({ lat: metadata.centerLat, lng: metadata.centerLng }, ijtemaStreet), true);

  // A point far outside the radius (roughly 20km north) must be outside.
  assert.equal(isWithinStreetGraphRadius({ lat: metadata.centerLat + 0.2, lng: metadata.centerLng }, ijtemaStreet), false);
}

// ─── Basic pathfinding: a point near a known gate should route to a nearby gate ──
{
  const gate05 = IJTEMA_GATES.find((gate) => gate.id === 'GATE_05')!;
  assert.ok(gate05.coordinate, 'GATE_05 must have a coordinate for this test to be meaningful');

  // Nudge slightly off the gate's exact coordinate (still well within the street graph).
  const nearGate05 = { lat: gate05.coordinate!.lat + 0.0015, lng: gate05.coordinate!.lng + 0.0015 };
  assert.equal(isWithinStreetGraphRadius(nearGate05, ijtemaStreet), true, 'test point must be within the bundled radius');

  const result = selectStreetGraphOutsidePath(nearGate05, routableGates);
  assert.ok(result, 'expected a street-graph path to be found near a known gate');
  assert.ok(result!.coordinates.length >= 2, 'expected at least a start and end coordinate');
  assert.ok(result!.totalDistanceM > 0, 'expected a positive total distance');
  assert.ok(result!.totalDistanceM < 5000, `distance to a gate from a point ~230m away is implausibly large: ${result!.totalDistanceM}m`);

  const lastCoord = result!.coordinates[result!.coordinates.length - 1];
  assert.ok(
    haversineM(lastCoord.lat, lastCoord.lng, result!.gate.coordinate!.lat, result!.gate.coordinate!.lng) < 1,
    'path must end exactly at the selected gate coordinate',
  );
  console.log(`Near-GATE_05 probe routed to ${result!.gate.id}, ${result!.totalDistanceM.toFixed(1)}m total, graph-routed ${result!.graphRoutedDistanceM.toFixed(1)}m, sanityCapExceeded=${result!.sanityCapExceeded}`);
}

// ─── Every routable gate is reachable from a point near itself ────────────
{
  let checked = 0;
  let sanityCapFlagged = 0;
  for (const gate of routableGates) {
    const probe = { lat: gate.coordinate!.lat + 0.001, lng: gate.coordinate!.lng + 0.001 };
    if (!isWithinStreetGraphRadius(probe, ijtemaStreet)) continue; // some gates may sit near the radius edge

    const result = selectStreetGraphOutsidePath(probe, routableGates);
    assert.ok(result, `expected a street-graph path to be found near ${gate.id}`);
    checked += 1;
    if (result!.sanityCapExceeded) sanityCapFlagged += 1;
  }
  assert.ok(checked >= routableGates.length - 2, `expected nearly all ${routableGates.length} gates to be probeable, only checked ${checked}`);
  console.log(`Reachability: ${checked}/${routableGates.length} gates probed successfully (${sanityCapFlagged} flagged over the ${DISTANCE_SANITY_CAP_RATIO}x sanity cap).`);
}

// ─── Ratio math sanity: a straight, unobstructed short probe should not trip the cap ──
{
  const gate01 = IJTEMA_GATES.find((gate) => gate.id === 'GATE_01')!;
  const probe = { lat: gate01.coordinate!.lat + 0.0008, lng: gate01.coordinate!.lng };
  const result = selectStreetGraphOutsidePath(probe, routableGates);
  assert.ok(result);
  assert.equal(result!.sanityCapExceeded, false, 'a short, direct probe near GATE_01 should not exceed the sanity cap');
}

console.log('test-outside-street-routing-v2.ts: all assertions passed');

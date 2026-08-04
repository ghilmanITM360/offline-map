import { strict as assert } from 'node:assert';

import { IJTEMA_GATES } from '../src/data/ijtema/gates';
import { distanceMeters } from '../src/data/ijtema/graphBuilder';
import { RoutingServiceV2 } from '../src/services/RoutingServiceV2';
import { selectStreetGraphOutsidePath } from '../src/services/OutsideStreetRoutingService';

process.env.EXPO_PUBLIC_USE_IJTEMA_V2_MAP = 'true';
process.env.EXPO_PUBLIC_USE_IJTEMA_V2_ROUTING = 'true';

const toV2 = (coordinate: { latitude: number; longitude: number }) => ({
  lat: coordinate.latitude,
  lng: coordinate.longitude,
});

const outsideNorthEast = { latitude: 24.9762, longitude: 67.011 };

interface GateTotal {
  gateId: string;
  externalM: number;
  internalM: number;
  totalM: number;
}

// ─── Beeline mode: complete-journey (outside + internal) cost must win ──────
// Pinned OFF regardless of the OSM street-graph flag's own default, since
// this block specifically asserts beeline-mode policy is unchanged by the
// street-graph work below (project-owner requirement: "beeline policy
// unchanged").
process.env.EXPO_PUBLIC_USE_IJTEMA_OUTSIDE_STREET_GRAPH = 'false';
{
  const bestGateTotals: GateTotal[] = [];

  for (const gate of IJTEMA_GATES.filter((item) => item.coordinate && item.canStartRouteFromOutside)) {
    const internal = RoutingServiceV2.calculateRoute({
      start: { type: 'gate', gateId: gate.id },
      destination: { type: 'block', blockId: 'B34' },
    });
    if (!internal || !gate.coordinate) continue;
    const externalM = Math.round(distanceMeters(toV2(outsideNorthEast), gate.coordinate));
    bestGateTotals.push({
      gateId: gate.id,
      externalM,
      internalM: internal.totalDistance,
      totalM: externalM + internal.totalDistance,
    });
  }

  bestGateTotals.sort((left, right) => left.totalM - right.totalM);

  const route = RoutingServiceV2.calculateRoute({
    start: { type: 'outside_coordinate', coordinate: outsideNorthEast },
    destination: { type: 'block', blockId: 'B34' },
  });

  assert(route, 'Outside north-east start must route to Block 34.');
  assert(bestGateTotals.length > 1, 'Fixture must have multiple official gate alternatives.');
  assert.equal(bestGateTotals[0].gateId, 'GATE_15', 'Fixture expects Gate 15 to be lowest total-cost official entry.');
  assert.notEqual(bestGateTotals[0].gateId, 'GATE_20', 'Gate 20 must not be best total-cost entry for this fixture.');
  assert.equal(
    route.startResolution?.gate?.id,
    bestGateTotals[0].gateId,
    `Outside routing must choose lowest total cost gate; expected ${bestGateTotals[0].gateId}, got ${route.startResolution?.gate?.id ?? 'none'}.`,
  );
  assert(
    route.totalDistance <= bestGateTotals[0].totalM + 2,
    `Route distance must include start-to-entry + internal path. Expected <= ${bestGateTotals[0].totalM + 2}m, got ${route.totalDistance}m.`,
  );

  console.log(`Beeline mode: chose ${route.startResolution?.gate?.id}, ${route.totalDistance}m (expected ${bestGateTotals[0].gateId}, ${bestGateTotals[0].totalM}m).`);
}

// ─── OSM street-graph mode: same complete-journey objective, same fixture ──
// This is the project owner's known counterexample
// (24.9762,67.011 -> B34) under street mode: Gate 20 sits ~115m from the
// start (by far the nearest gate outside), but ~1.4km from B34 once inside.
// A destination-blind selector (street-cost + penalty only) picks Gate 20;
// a destination-aware selector must not, because Gate 20's complete-journey
// cost is much higher than a gate with a longer outside walk but a short
// internal leg to B34 (e.g. Gate 15, the beeline winner above).
//
// Expected totals are computed independently of the code under test: each
// candidate gate's outside leg comes from a single-gate call to
// selectStreetGraphOutsidePath (forcing that one gate as the only
// candidate, so its real street-graph distance is measured directly, not
// re-derived from the multi-gate selection logic being verified), and its
// internal leg from a plain gate->block route.
process.env.EXPO_PUBLIC_USE_IJTEMA_OUTSIDE_STREET_GRAPH = 'true';
{
  const bestGateTotals: GateTotal[] = [];

  for (const gate of IJTEMA_GATES.filter((item) => item.coordinate && item.canStartRouteFromOutside)) {
    const internal = RoutingServiceV2.calculateRoute({
      start: { type: 'gate', gateId: gate.id },
      destination: { type: 'block', blockId: 'B34' },
    });
    if (!internal || !gate.coordinate) continue;

    const streetLeg = selectStreetGraphOutsidePath(toV2(outsideNorthEast), [gate]);
    if (!streetLeg) continue; // gate not reachable via the street graph from this point

    const externalM = Math.round(streetLeg.totalDistanceM);
    bestGateTotals.push({
      gateId: gate.id,
      externalM,
      internalM: internal.totalDistance,
      totalM: externalM + internal.totalDistance,
    });
  }

  bestGateTotals.sort((left, right) => left.totalM - right.totalM);

  const route = RoutingServiceV2.calculateRoute({
    start: { type: 'outside_coordinate', coordinate: outsideNorthEast },
    destination: { type: 'block', blockId: 'B34' },
  });

  assert(route, 'Outside north-east start must route to Block 34 under street-graph mode.');
  assert(bestGateTotals.length > 1, 'Street-graph fixture must have multiple official gate alternatives.');
  assert.notEqual(bestGateTotals[0].gateId, 'GATE_20', 'Gate 20 must not be the lowest complete-journey-cost entry for this fixture even under street-graph mode.');
  assert.notEqual(
    route.startResolution?.gate?.id,
    'GATE_20',
    `Street-graph outside routing must not pick Gate 20 (destination-blind selection) for this fixture; got ${route.startResolution?.gate?.id ?? 'none'}.`,
  );
  assert.equal(
    route.startResolution?.gate?.id,
    bestGateTotals[0].gateId,
    `Street-graph outside routing must choose the lowest complete-journey-cost gate; expected ${bestGateTotals[0].gateId}, got ${route.startResolution?.gate?.id ?? 'none'}.`,
  );

  console.log(`Street-graph mode: chose ${route.startResolution?.gate?.id}, ${route.totalDistance}m (expected ${bestGateTotals[0].gateId}, ${bestGateTotals[0].totalM}m).`);
}
delete process.env.EXPO_PUBLIC_USE_IJTEMA_OUTSIDE_STREET_GRAPH;

console.log('Route selection total cost v2 checks passed.');

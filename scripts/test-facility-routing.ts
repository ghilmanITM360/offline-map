import { strict as assert } from 'node:assert';
import { RoutingService } from '../src/services/RoutingService';
import { LANDMARK_PLACES, IJTEMA_DATA } from '../src/constants/data';

process.env.EXPO_PUBLIC_USE_IJTEMA_V2_MAP = 'false';
process.env.EXPO_PUBLIC_USE_IJTEMA_V2_ROUTING = 'false';
process.env.EXPO_PUBLIC_USE_IJTEMA_V2_NAVIGATION = 'false';

// P0-1: facilities (LANDMARK_PLACES) are now rendered as tappable map markers
// (FacilityLayer) and route through the same universal handlePlaceSelect chain
// as blocks/gates. This confirms every facility is actually reachable via the
// existing v1 routing engine (RoutingService + LANDMARK_NEAREST_NODE) — no new
// routing code, so a route must exist from a fixed origin node to every one.
const origin = IJTEMA_DATA.nodes['T1'] ?? Object.values(IJTEMA_DATA.nodes)[0];
assert(origin, 'Expected at least one graph node to use as a test origin');
const originCoord = { latitude: origin.lat, longitude: origin.lng };
const originNodeId = RoutingService.findNearestNode(originCoord);

assert(LANDMARK_PLACES.length > 0, 'LANDMARK_PLACES must not be empty');

const failures: string[] = [];
for (const place of LANDMARK_PLACES) {
  const destNodeIds = RoutingService.resolveDestinationNodesFromPlace(place, originCoord);
  if (destNodeIds.length === 0) {
    failures.push(`${place.id}: no destination nodes resolved`);
    continue;
  }
  // Origin already at the resolved destination node — trivially reachable,
  // not a routing failure (aStar rightly refuses a zero-length same-node route).
  if (destNodeIds.includes(originNodeId)) continue;
  const route = RoutingService.calculateRoute(originCoord, destNodeIds);
  if (!route || route.totalDistance <= 0 || route.nodes.length < 2) {
    failures.push(`${place.id}: no usable route from origin`);
  }
}

assert(failures.length === 0, `Facility routing failed for: ${failures.join(', ')}`);

console.log(`Facility routing smoke test passed: ${LANDMARK_PLACES.length} facilities all routable.`);

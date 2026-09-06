/**
 * NEW-06 — outside-provider routes may start/end away from the exact
 * requested origin/gate (within OutsideRouteValidation's 100m endpoint
 * tolerance). Core composes the displayed polyline with join segments
 * (exact origin -> provider start, provider end -> exact gate) — this file
 * guards that the reported journey distance/cost/ETA/selection actually
 * include those joins for providers whose own distanceM doesn't already
 * fold them in (google, direct-guide), while offline-osm (whose distanceM
 * already folds its own connector in) is never double-counted.
 *
 * Uses the real core/provider contract (OutsideRouteValidation +
 * RoutingServiceV2.prepareOutsideRoutingPlan/finalizeOutsideRoutingPlan) —
 * same fixture (GATE_12 / Block B34) as test-core-provider-routing-contract-v2.ts.
 */
import { strict as assert } from 'node:assert';

import { RoutingServiceV2 } from '../src/services/RoutingServiceV2';
import { assertCompleteCandidateSet, assertOutsideWalkingRouteRequest } from '../src/services/outsideRouting/OutsideRouteValidation';
import type {
  NormalizedOutsideCandidate,
  OutsideRouteCandidateSet,
  OutsideRouteProviderId,
  OutsideWalkingRouteRequest,
} from '../src/models/outsideRouting';
import type { Coordinate } from '../src/models/types';

process.env.EXPO_PUBLIC_USE_IJTEMA_V2_MAP = 'true';
process.env.EXPO_PUBLIC_USE_IJTEMA_V2_ROUTING = 'true';

const DESTINATION = { type: 'block' as const, blockId: 'B34' };
const GATE_ID = 'GATE_12';
const GATE_COORDINATE: Coordinate = { latitude: 24.963676, longitude: 67.006339 };
const WALKING_SPEED_MS = 1.4;

function distanceMeters(from: Coordinate, to: Coordinate): number {
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const earthRadiusM = 6_371_000;
  const deltaLat = radians(to.latitude - from.latitude);
  const deltaLng = radians(to.longitude - from.longitude);
  const fromLat = radians(from.latitude);
  const toLat = radians(to.latitude);
  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(fromLat) * Math.cos(toLat) * Math.sin(deltaLng / 2) ** 2;
  return earthRadiusM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Shift a coordinate due north by metersNorth (negative = south). */
function shiftNorth(coordinate: Coordinate, metersNorth: number): Coordinate {
  const metersPerDegreeLat = 111_320;
  return { latitude: coordinate.latitude + metersNorth / metersPerDegreeLat, longitude: coordinate.longitude };
}

function buildRequest(origin: Coordinate): OutsideWalkingRouteRequest {
  return {
    token: { requestId: 'new-06', requestVersion: 1 },
    origin,
    gates: [{ gateId: GATE_ID, gateCoordinate: GATE_COORDINATE, routeTargetCoordinate: GATE_COORDINATE }],
    signal: new AbortController().signal,
  };
}

function buildRoute(
  provider: OutsideRouteProviderId,
  distanceM: number,
  coordinates: Coordinate[],
  request: OutsideWalkingRouteRequest,
): NormalizedOutsideCandidate {
  return {
    schemaVersion: 1,
    candidateId: `new-06:${provider}:${GATE_ID}:0`,
    requestId: request.token.requestId,
    requestVersion: request.token.requestVersion,
    provider,
    gateId: GATE_ID,
    distanceM,
    durationSeconds: null,
    coordinates,
    steps: [],
    roadFollowing: provider !== 'direct-guide',
    distanceKind: provider === 'direct-guide' ? 'direct-distance' : 'walking-route',
    warnings: provider === 'direct-guide' ? [{ code: 'direct-guide-not-road-route' }] : [],
    fallbackReason: null,
    fallbackHistory: [],
  };
}

function buildCandidateSet(request: OutsideWalkingRouteRequest, route: NormalizedOutsideCandidate): OutsideRouteCandidateSet {
  return {
    requestId: request.token.requestId,
    requestVersion: request.token.requestVersion,
    provider: route.provider,
    outcomes: [{ status: 'routed', gateId: GATE_ID, routes: [route] }],
  };
}

function finalizeSingle(request: OutsideWalkingRouteRequest, route: NormalizedOutsideCandidate) {
  const candidateSet = buildCandidateSet(request, route);
  assertCompleteCandidateSet(request, candidateSet); // must not throw — proves acceptance stage
  const plan = RoutingServiceV2.prepareOutsideRoutingPlan({ userCoordinate: request.origin, destination: DESTINATION, manualGateId: GATE_ID });
  assert(plan, 'plan must be producible for GATE_12 -> B34');
  const preview = RoutingServiceV2.finalizeOutsideRoutingPlan({ plan, outsideCandidates: candidateSet, walkingSpeedMs: WALKING_SPEED_MS });
  assert(preview, 'finalize must produce a route from an accepted response');
  assert(typeof preview.startConnectorDistanceM === 'number', 'preview must carry startConnectorDistanceM');
  assert(typeof preview.routeCostM === 'number', 'preview must carry routeCostM');
  return preview as typeof preview & { startConnectorDistanceM: number; routeCostM: number };
}

// ─── C4 — both connectors (historical-style case): full journey now agrees ──
{
  const requestedOrigin = shiftNorth(GATE_COORDINATE, -300);
  const providerStart = shiftNorth(requestedOrigin, 89);
  const providerEnd = shiftNorth(GATE_COORDINATE, -89);
  const originJoinM = distanceMeters(requestedOrigin, providerStart);
  const gateJoinM = distanceMeters(providerEnd, GATE_COORDINATE);
  assert(originJoinM > 80 && originJoinM < 95, `fixture sanity: origin join must be 80-95m, got ${originJoinM}`);
  assert(gateJoinM > 80 && gateJoinM < 95, `fixture sanity: gate join must be 80-95m, got ${gateJoinM}`);
  const providerDistanceM = Math.round(distanceMeters(providerStart, providerEnd));

  const request = buildRequest(requestedOrigin);
  assertOutsideWalkingRouteRequest(request);
  const route = buildRoute('google', providerDistanceM, [providerStart, providerEnd], request);
  const preview = finalizeSingle(request, route);

  const composedOutsideDistanceM = originJoinM + providerDistanceM + gateJoinM;

  assert(
    Math.abs(preview.startConnectorDistanceM - composedOutsideDistanceM) <= 1,
    `C4: reported outside distance must match composed join geometry within 1m; expected ~${composedOutsideDistanceM.toFixed(1)}, got ${preview.startConnectorDistanceM}`,
  );
  assert(
    Math.abs(preview.routeCostM - preview.totalDistance) < 10_000, // sanity: routeCostM/totalDistance both derived, not asserting equality (routeCostM includes internal path cost too)
    'C4: routeCostM must be finite and derived from the same composed figures',
  );
  console.log(`C4 OK: composed=${composedOutsideDistanceM.toFixed(1)}m reported=${preview.startConnectorDistanceM}m`);
}

// ─── C2 — origin connector only (provider start displaced, end exact) ──────
{
  const requestedOrigin = shiftNorth(GATE_COORDINATE, -300);
  const providerStart = shiftNorth(requestedOrigin, 89);
  const originJoinM = distanceMeters(requestedOrigin, providerStart);
  const providerDistanceM = Math.round(distanceMeters(providerStart, GATE_COORDINATE));

  const request = buildRequest(requestedOrigin);
  const route = buildRoute('google', providerDistanceM, [providerStart, GATE_COORDINATE], request);
  const preview = finalizeSingle(request, route);

  const expected = Math.round(originJoinM + providerDistanceM);
  assert(
    Math.abs(preview.startConnectorDistanceM - expected) <= 1,
    `C2: expected ~${expected}, got ${preview.startConnectorDistanceM}`,
  );
  console.log(`C2 OK: origin-only connector reported=${preview.startConnectorDistanceM}m`);
}

// ─── C3 — gate connector only (provider start exact, end displaced) ────────
{
  const requestedOrigin = shiftNorth(GATE_COORDINATE, -300);
  const providerEnd = shiftNorth(GATE_COORDINATE, -89);
  const gateJoinM = distanceMeters(providerEnd, GATE_COORDINATE);
  const providerDistanceM = Math.round(distanceMeters(requestedOrigin, providerEnd));

  const request = buildRequest(requestedOrigin);
  const route = buildRoute('google', providerDistanceM, [requestedOrigin, providerEnd], request);
  const preview = finalizeSingle(request, route);

  const expected = Math.round(providerDistanceM + gateJoinM);
  assert(
    Math.abs(preview.startConnectorDistanceM - expected) <= 1,
    `C3: expected ~${expected}, got ${preview.startConnectorDistanceM}`,
  );
  console.log(`C3 OK: gate-only connector reported=${preview.startConnectorDistanceM}m`);
}

// ─── C5 — exact endpoints: no connector cost/distance added ────────────────
{
  const requestedOrigin = shiftNorth(GATE_COORDINATE, -300);
  const providerDistanceM = Math.round(distanceMeters(requestedOrigin, GATE_COORDINATE));
  const request = buildRequest(requestedOrigin);
  const route = buildRoute('google', providerDistanceM, [requestedOrigin, GATE_COORDINATE], request);
  const preview = finalizeSingle(request, route);
  assert.equal(preview.startConnectorDistanceM, providerDistanceM, 'C5: exact endpoints must add no connector distance');
  console.log('C5 OK: exact endpoints — no regression.');
}

// ─── C6 — tolerance boundary: just inside vs just outside 100m must accept/reject ──
{
  const requestedOrigin = shiftNorth(GATE_COORDINATE, -300);
  const insideOffset = shiftNorth(requestedOrigin, 99.9);
  const outsideOffset = shiftNorth(requestedOrigin, 100.5);
  const request = buildRequest(requestedOrigin);

  const insideRoute = buildRoute('google', Math.round(distanceMeters(insideOffset, GATE_COORDINATE)), [insideOffset, GATE_COORDINATE], request);
  assertCompleteCandidateSet(request, buildCandidateSet(request, insideRoute)); // must not throw

  const outsideRoute = buildRoute('google', Math.round(distanceMeters(outsideOffset, GATE_COORDINATE)), [outsideOffset, GATE_COORDINATE], request);
  assert.throws(
    () => assertCompleteCandidateSet(request, buildCandidateSet(request, outsideRoute)),
    'C6: offset beyond MAX_ROUTE_ENDPOINT_OFFSET_M must be rejected',
  );
  console.log('C6 OK: tolerance boundary holds (99.9m accepted, 100.5m rejected).');
}

// ─── C7 — excessive drift fails safely (no misleading route reaches finalize) ──
{
  const requestedOrigin = shiftNorth(GATE_COORDINATE, -300);
  const wildOffset = shiftNorth(requestedOrigin, 5000);
  const request = buildRequest(requestedOrigin);
  const wildRoute = buildRoute('google', Math.round(distanceMeters(wildOffset, GATE_COORDINATE)), [wildOffset, GATE_COORDINATE], request);
  assert.throws(
    () => assertCompleteCandidateSet(request, buildCandidateSet(request, wildRoute)),
    'C7: excessive endpoint drift must be rejected, not silently composed into a route',
  );
  console.log('C7 OK: excessive drift rejected before it can reach route composition.');
}

// ─── C8 — route selection compares FULL composed journey cost, not raw distance ──
{
  const requestedOrigin = shiftNorth(GATE_COORDINATE, -300);
  const otherGateId = 'GATE_15';
  const plan = RoutingServiceV2.prepareOutsideRoutingPlan({ userCoordinate: requestedOrigin, destination: DESTINATION });
  assert(plan, 'C8: plan must be producible');
  const candidateA = plan.candidates.find((c) => c.gateId === GATE_ID);
  const candidateB = plan.candidates.find((c) => c.gateId === otherGateId);
  assert(candidateA && candidateB, 'C8: fixture requires both GATE_12 and GATE_15 as eligible candidates');

  // Candidate A: tiny declared provider distance but a large (89m) hidden gate connector.
  const providerEndA = shiftNorth(GATE_COORDINATE, -89);
  const startA = shiftNorth(providerEndA, -1); // ~1m provider leg
  const routeA = buildRoute('google', 1, [startA, providerEndA], { ...buildRequest(requestedOrigin) });
  // Candidate B: exact-endpoint provider route, slightly longer declared distance, no hidden connector.
  const gateBCoordinate = candidateB.providerRouteTargetCoordinate;
  const providerDistanceB = 50;
  const routeB = buildRoute('google', providerDistanceB, [requestedOrigin, gateBCoordinate], { ...buildRequest(requestedOrigin) });

  const outsideCandidates: OutsideRouteCandidateSet = {
    requestId: plan.requestId.length > 0 ? 'core-contract' : 'core-contract', // requestId not checked by finalize
    requestVersion: 1,
    provider: 'google',
    outcomes: [
      { status: 'routed', gateId: GATE_ID, routes: [{ ...routeA, requestId: 'core-contract' }] },
      { status: 'routed', gateId: otherGateId, routes: [{ ...routeB, requestId: 'core-contract' }] },
    ],
  };

  const result = RoutingServiceV2.finalizeOutsideRoutingPlan({ plan, outsideCandidates, walkingSpeedMs: WALKING_SPEED_MS });
  assert(result, 'C8: finalize must produce a route');
  assert.equal(
    result.selectedOutsideCandidateId,
    routeB.candidateId,
    `C8: selection must weigh the full composed journey (A's hidden 89m gate connector must lose to B's exact-endpoint route), got ${result.selectedOutsideCandidateId}`,
  );
  console.log('C8 OK: route selection uses full composed cost, not raw declared distance.');
}

// ─── C9/C10 — offline-osm distance already folds its own connector; no double count ──
{
  const requestedOrigin = shiftNorth(GATE_COORDINATE, -300);
  const request = buildRequest(requestedOrigin);
  const osmCandidate = RoutingServiceV2.resolveOfflineOsmOutsideCandidate(requestedOrigin, GATE_ID);
  if (osmCandidate?.outsideCoordinates) {
    const route = buildRoute('offline-osm', osmCandidate.outsideDistanceM, osmCandidate.outsideCoordinates as Coordinate[], request);
    const preview = finalizeSingle(request, route);
    assert.equal(
      preview.startConnectorDistanceM,
      Math.round(osmCandidate.outsideDistanceM),
      'C9/C10: offline-osm distance (which already folds in its own connector) must not be charged an extra connector on top',
    );
    console.log('C9/C10 OK: offline-osm distance not double-counted.');
  } else {
    console.log('C9/C10 SKIPPED: fixture origin outside bundled street-graph radius for GATE_12.');
  }
}

console.log('NEW-06 provider endpoint / connector distance checks passed.');

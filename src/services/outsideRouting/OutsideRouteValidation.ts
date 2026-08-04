import type { Coordinate } from '../../models/types';
import type {
  NormalizedOutsideCandidate,
  OutsideRouteCandidateSet,
  OutsideWalkingRouteRequest,
} from '../../models/outsideRouting';

const OFFICIAL_GATE_ID = /^GATE_\d{2}$/;
// Providers may snap walking geometry to a nearby public path, but geometry
// farther than this cannot safely prove origin/gate identity on mobile.
const MAX_ROUTE_ENDPOINT_OFFSET_M = 100;
const GATE_IDENTITY_MARGIN_M = 2;

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

function assertCoordinate(coordinate: Coordinate, label: string): void {
  if (
    !Number.isFinite(coordinate.latitude) ||
    !Number.isFinite(coordinate.longitude) ||
    coordinate.latitude < -90 ||
    coordinate.latitude > 90 ||
    coordinate.longitude < -180 ||
    coordinate.longitude > 180
  ) {
    throw new Error(`${label} coordinate is invalid.`);
  }
}

export function assertOutsideWalkingRouteRequest(request: OutsideWalkingRouteRequest): void {
  if (!request.token.requestId.trim() || !Number.isSafeInteger(request.token.requestVersion) || request.token.requestVersion < 1) {
    throw new Error('Request identity is invalid.');
  }
  assertCoordinate(request.origin, 'origin');
  if (request.gates.length === 0) throw new Error('At least one gate target is required.');

  const gateIds = new Set<string>();
  for (const gate of request.gates) {
    if (!OFFICIAL_GATE_ID.test(gate.gateId)) throw new Error(`Invalid gate ID: ${gate.gateId}`);
    if (gateIds.has(gate.gateId)) throw new Error(`Duplicate gate target: ${gate.gateId}`);
    gateIds.add(gate.gateId);
    assertCoordinate(gate.gateCoordinate, `${gate.gateId} gate`);
    assertCoordinate(gate.routeTargetCoordinate, `${gate.gateId} route target`);
  }
}

function assertNormalizedRoute(
  request: OutsideWalkingRouteRequest,
  candidateSet: OutsideRouteCandidateSet,
  route: NormalizedOutsideCandidate,
): void {
  if (!route.candidateId.trim()) throw new Error('Route candidate identity is invalid.');
  if (route.requestId !== request.token.requestId || route.requestVersion !== request.token.requestVersion) {
    throw new Error('Route request identity does not match request.');
  }
  if (route.provider !== candidateSet.provider) throw new Error('Route provider does not match candidate-set provider.');
  if (!Number.isFinite(route.distanceM) || route.distanceM < 0) throw new Error('Route distance is invalid.');
  if (route.durationSeconds !== null && (!Number.isFinite(route.durationSeconds) || route.durationSeconds < 0)) {
    throw new Error('Route duration is invalid.');
  }
  if (route.coordinates.length < 2) throw new Error('Route geometry requires at least two coordinates.');
  route.coordinates.forEach((coordinate, index) => assertCoordinate(coordinate, `route coordinate ${index}`));
  const routeStart = route.coordinates[0];
  const routeEnd = route.coordinates[route.coordinates.length - 1];
  if (distanceMeters(routeStart, request.origin) > MAX_ROUTE_ENDPOINT_OFFSET_M) {
    throw new Error('Route geometry origin does not match request origin.');
  }
  const declaredGate = request.gates.find((gate) => gate.gateId === route.gateId);
  if (!declaredGate) throw new Error('Route gate has no matching request target.');
  const declaredGateOffsetM = distanceMeters(routeEnd, declaredGate.routeTargetCoordinate);
  if (declaredGateOffsetM > MAX_ROUTE_ENDPOINT_OFFSET_M) {
    throw new Error('Route geometry endpoint does not match gate target.');
  }
  const closerOtherGate = request.gates.some((gate) =>
    gate.gateId !== route.gateId &&
    distanceMeters(routeEnd, gate.routeTargetCoordinate) + GATE_IDENTITY_MARGIN_M < declaredGateOffsetM,
  );
  if (closerOtherGate) throw new Error('Route geometry endpoint matches another gate target.');

  if (route.provider === 'direct-guide') {
    if (route.roadFollowing) throw new Error('Direct guide must set roadFollowing=false.');
    if (route.distanceKind !== 'direct-distance') throw new Error('Direct guide must use direct-distance.');
    if (route.durationSeconds !== null) throw new Error('Direct guide duration must be null.');
    if (route.steps.length > 0) throw new Error('Direct guide cannot include road instructions.');
    if (!route.warnings.some((warning) => warning.code === 'direct-guide-not-road-route')) {
      throw new Error('Direct guide requires not-road-route warning.');
    }
  } else if (!route.roadFollowing || route.distanceKind !== 'walking-route') {
    throw new Error(`${route.provider} routes must be road-following walking routes.`);
  }
}

export function assertCompleteCandidateSet(
  request: OutsideWalkingRouteRequest,
  candidateSet: OutsideRouteCandidateSet,
): void {
  if (
    candidateSet.requestId !== request.token.requestId ||
    candidateSet.requestVersion !== request.token.requestVersion
  ) {
    throw new Error('Candidate-set request identity does not match request identity.');
  }

  const requestedGateIds = new Set(request.gates.map((gate) => gate.gateId));
  const outcomeGateIds = new Set<string>();
  const candidateIds = new Set<string>();
  for (const outcome of candidateSet.outcomes) {
    if (!requestedGateIds.has(outcome.gateId)) throw new Error(`Unexpected gate outcome: ${outcome.gateId}`);
    if (outcomeGateIds.has(outcome.gateId)) throw new Error(`Duplicate gate outcome: ${outcome.gateId}`);
    outcomeGateIds.add(outcome.gateId);
    if (outcome.status === 'routed') {
      if (outcome.routes.length === 0) throw new Error(`Routed gate ${outcome.gateId} has no routes.`);
      for (const route of outcome.routes) {
        if (candidateIds.has(route.candidateId)) throw new Error(`Duplicate route candidate: ${route.candidateId}`);
        candidateIds.add(route.candidateId);
        if (route.gateId !== outcome.gateId) throw new Error('Route gate does not match outcome gate.');
        assertNormalizedRoute(request, candidateSet, route);
      }
    }
  }
  if (outcomeGateIds.size !== requestedGateIds.size) {
    throw new Error('Candidate set must account for every requested gate.');
  }
}

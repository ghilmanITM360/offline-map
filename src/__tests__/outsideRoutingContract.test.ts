import {
  assertCompleteCandidateSet,
  assertOutsideWalkingRouteRequest,
} from '../services/outsideRouting/OutsideRouteValidation';
import type {
  NormalizedOutsideCandidate,
  OutsideRouteCandidateSet,
  OutsideWalkingRouteRequest,
} from '../models/outsideRouting';
import { getDistance } from 'geolib';

const request: OutsideWalkingRouteRequest = {
  token: { requestId: 'outside-1', requestVersion: 1 },
  origin: { latitude: 24.96, longitude: 67.01 },
  gates: [
    {
      gateId: 'GATE_05',
      gateCoordinate: { latitude: 24.961, longitude: 67.011 },
      routeTargetCoordinate: { latitude: 24.9609, longitude: 67.0109 },
    },
  ],
  signal: new AbortController().signal,
};

const approvedGateTargets = {
  GATE_12: { latitude: 24.963676, longitude: 67.006339 },
  GATE_13: { latitude: 24.963718, longitude: 67.006862 },
  GATE_14: { latitude: 24.965516, longitude: 67.007675 },
} as const;

const realGateRequest: OutsideWalkingRouteRequest = {
  token: { requestId: 'real-gate-identity', requestVersion: 4 },
  origin: { latitude: 24.97, longitude: 67.01 },
  gates: Object.entries(approvedGateTargets).map(([gateId, coordinate]) => ({
    gateId,
    gateCoordinate: coordinate,
    routeTargetCoordinate: coordinate,
  })),
  signal: new AbortController().signal,
};

function route(overrides: Partial<NormalizedOutsideCandidate> = {}): NormalizedOutsideCandidate {
  return {
    schemaVersion: 1,
    candidateId: 'outside-1:google:GATE_05:0',
    requestId: 'outside-1',
    requestVersion: 1,
    provider: 'google',
    gateId: 'GATE_05',
    distanceM: 125,
    durationSeconds: 90,
    coordinates: [request.origin, request.gates[0].routeTargetCoordinate],
    steps: [],
    roadFollowing: true,
    distanceKind: 'walking-route',
    warnings: [],
    fallbackReason: null,
    fallbackHistory: [],
    ...overrides,
  };
}

function candidateSet(routes: readonly NormalizedOutsideCandidate[]): OutsideRouteCandidateSet {
  return {
    requestId: 'outside-1',
    requestVersion: 1,
    provider: routes[0]?.provider ?? 'google',
    outcomes: [{ status: 'routed', gateId: 'GATE_05', routes }],
  };
}

function realGateRoute(
  gateId: keyof typeof approvedGateTargets,
  endpoint = approvedGateTargets[gateId],
): NormalizedOutsideCandidate {
  return {
    schemaVersion: 1,
    candidateId: `${realGateRequest.token.requestId}:google:${gateId}:0`,
    requestId: realGateRequest.token.requestId,
    requestVersion: realGateRequest.token.requestVersion,
    provider: 'google',
    gateId,
    distanceM: 800,
    durationSeconds: 600,
    coordinates: [realGateRequest.origin, endpoint],
    steps: [],
    roadFollowing: true,
    distanceKind: 'walking-route',
    warnings: [],
    fallbackReason: null,
    fallbackHistory: [],
  };
}

function realGateCandidateSet(
  routes: Partial<Record<keyof typeof approvedGateTargets, NormalizedOutsideCandidate>>,
): OutsideRouteCandidateSet {
  return {
    requestId: realGateRequest.token.requestId,
    requestVersion: realGateRequest.token.requestVersion,
    provider: 'google',
    outcomes: realGateRequest.gates.map(({ gateId }) => {
      const routeForGate = routes[gateId as keyof typeof approvedGateTargets];
      return routeForGate
        ? { status: 'routed' as const, gateId, routes: [routeForGate] }
        : { status: 'unreachable' as const, gateId, reason: 'no-route' as const };
    }),
  };
}

describe('outside routing contract validation', () => {
  test('accepts a finite request with unique official gate targets', () => {
    expect(() => assertOutsideWalkingRouteRequest(request)).not.toThrow();
  });

  test.each([
    [{ latitude: Number.NaN, longitude: 67.01 }],
    [{ latitude: 91, longitude: 67.01 }],
    [{ latitude: 24.96, longitude: 181 }],
  ])('rejects malformed origin coordinates', (origin) => {
    expect(() => assertOutsideWalkingRouteRequest({ ...request, origin })).toThrow('origin');
  });

  test('rejects duplicate and malformed gate IDs', () => {
    expect(() => assertOutsideWalkingRouteRequest({ ...request, gates: [...request.gates, request.gates[0]] })).toThrow(/duplicate/i);
    expect(() => assertOutsideWalkingRouteRequest({
      ...request,
      gates: [{ ...request.gates[0], gateId: 'gate-five' }],
    })).toThrow('gate ID');
  });

  test('accepts a complete provider candidate set matching request identity', () => {
    expect(() => assertCompleteCandidateSet(request, candidateSet([route()]))).not.toThrow();
  });

  test('rejects missing gate outcomes and identity mismatches', () => {
    expect(() => assertCompleteCandidateSet(request, { ...candidateSet([route()]), outcomes: [] })).toThrow('every requested gate');
    expect(() => assertCompleteCandidateSet(request, {
      ...candidateSet([route()]),
      requestVersion: 2,
    })).toThrow('identity');
  });

  test('rejects provider mislabelling and invalid direct-guide semantics', () => {
    expect(() => assertCompleteCandidateSet(request, {
      ...candidateSet([route()]),
      outcomes: [{ status: 'routed', gateId: 'GATE_05', routes: [route({ provider: 'offline-osm' })] }],
    })).toThrow('provider');

    const direct = route({
      provider: 'direct-guide',
      roadFollowing: true,
      distanceKind: 'direct-distance',
      durationSeconds: null,
      warnings: [{ code: 'direct-guide-not-road-route' }],
    });
    expect(() => assertCompleteCandidateSet(
      request,
      { ...candidateSet([direct]), provider: 'direct-guide' },
    )).toThrow('roadFollowing');
  });

  test('rejects geometry that starts away from request origin or ends at another gate target', () => {
    expect(() => assertCompleteCandidateSet(request, candidateSet([route({
      coordinates: [
        { latitude: 24.97, longitude: 67.02 },
        request.gates[0].routeTargetCoordinate,
      ],
    })]))).toThrow(/origin/i);

    const nearbyOtherGate = {
      gateId: 'GATE_12',
      gateCoordinate: { latitude: 24.9611, longitude: 67.0111 },
      routeTargetCoordinate: { latitude: 24.9611, longitude: 67.0111 },
    };
    const multiGateRequest = { ...request, gates: [...request.gates, nearbyOtherGate] };
    const swappedSet: OutsideRouteCandidateSet = {
      requestId: request.token.requestId,
      requestVersion: request.token.requestVersion,
      provider: 'google',
      outcomes: [
        {
          status: 'routed',
          gateId: 'GATE_05',
          routes: [route({ coordinates: [request.origin, nearbyOtherGate.routeTargetCoordinate] })],
        },
        { status: 'unreachable', gateId: 'GATE_12', reason: 'no-route' },
      ],
    };
    expect(() => assertCompleteCandidateSet(multiGateRequest, swappedSet)).toThrow(/another gate target/i);
  });

  test('real Gate 12 and Gate 13 remain distinct inside the 100m endpoint tolerance', () => {
    expect(getDistance(approvedGateTargets.GATE_12, approvedGateTargets.GATE_13)).toBeLessThan(100);

    expect(() => assertCompleteCandidateSet(realGateRequest, realGateCandidateSet({
      GATE_12: realGateRoute('GATE_12', approvedGateTargets.GATE_13),
    }))).toThrow(/another gate target/i);

    expect(() => assertCompleteCandidateSet(realGateRequest, realGateCandidateSet({
      GATE_13: realGateRoute('GATE_13', approvedGateTargets.GATE_12),
    }))).toThrow(/another gate target/i);
  });

  test('accepts correct real Gate 12 and Gate 13 endpoints with distinct candidate IDs', () => {
    const gate12Route = realGateRoute('GATE_12');
    const gate13Route = realGateRoute('GATE_13');

    expect(gate12Route.candidateId).not.toBe(gate13Route.candidateId);
    expect(() => assertCompleteCandidateSet(realGateRequest, realGateCandidateSet({
      GATE_12: gate12Route,
      GATE_13: gate13Route,
    }))).not.toThrow();
  });

  test('single manual Gate 12 plan cannot apply competing-gate identity check', () => {
    const singleGateRequest = {
      ...realGateRequest,
      gates: realGateRequest.gates.filter(({ gateId }) => gateId === 'GATE_12'),
    };
    const routeEndingAtGate13 = realGateRoute('GATE_12', approvedGateTargets.GATE_13);
    const singleGateSet: OutsideRouteCandidateSet = {
      requestId: singleGateRequest.token.requestId,
      requestVersion: singleGateRequest.token.requestVersion,
      provider: 'google',
      outcomes: [{ status: 'routed', gateId: 'GATE_12', routes: [routeEndingAtGate13] }],
    };

    expect(getDistance(approvedGateTargets.GATE_12, approvedGateTargets.GATE_13)).toBeLessThan(100);
    expect(() => assertCompleteCandidateSet(singleGateRequest, singleGateSet)).not.toThrow();
  });
});

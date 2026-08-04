import {
  assertCompleteCandidateSet,
  assertOutsideWalkingRouteRequest,
} from '../services/outsideRouting/OutsideRouteValidation';
import type {
  NormalizedOutsideCandidate,
  OutsideRouteCandidateSet,
  OutsideWalkingRouteRequest,
} from '../models/outsideRouting';

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
});

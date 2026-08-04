import type {
  NormalizedOutsideRoute,
  OutsideRouteCandidateSource,
  OutsideWalkingRouteRequest,
} from '../models/outsideRouting';
import type { Place } from '../models/types';
import { V2DirectionsService } from '../services/V2DirectionsService';

process.env.EXPO_PUBLIC_USE_IJTEMA_V2_ROUTING = 'true';

const origin = { latitude: 24.9762, longitude: 67.011 };
const destination: Place = {
  id: 'B34',
  name: 'Block 34',
  category: 'Block',
  description: 'Block 34',
  coordinate: { latitude: 24.966, longitude: 67.004 },
  sourceVersion: 'v2',
};

function routeFor(request: OutsideWalkingRouteRequest, gateId: string): NormalizedOutsideRoute {
  const gate = request.gates.find((candidate) => candidate.gateId === gateId)!;
  return {
    schemaVersion: 1,
    candidateId: `${request.token.requestId}:google:${gateId}:preferred`,
    requestId: request.token.requestId,
    requestVersion: request.token.requestVersion,
    provider: 'google',
    gateId,
    distanceM: gateId === 'GATE_12' ? 1 : 50_000,
    durationSeconds: gateId === 'GATE_12' ? 60 : 50_000,
    coordinates: [request.origin, gate.routeTargetCoordinate],
    steps: gateId === 'GATE_12' ? [{
      id: 'google-step-12',
      maneuver: 'turn-right',
      distanceM: 1,
      durationSeconds: 60,
      coordinate: gate.routeTargetCoordinate,
      instruction: 'Turn right toward Gate 12',
      roadName: 'Public Road',
    }] : [],
    roadFollowing: true,
    distanceKind: 'walking-route',
    warnings: [],
    fallbackReason: null,
    fallbackHistory: [],
  };
}

describe('V2DirectionsService hybrid core integration', () => {
  test('uses real core plan/finalize APIs and attaches exact selected provider candidate', async () => {
    const routeToGates = jest.fn(async (request: OutsideWalkingRouteRequest) => ({
      status: 'success' as const,
      candidateSet: {
        requestId: request.token.requestId,
        requestVersion: request.token.requestVersion,
        provider: 'google' as const,
        outcomes: request.gates.map(({ gateId }) => ({
          status: 'routed' as const,
          gateId,
          routes: [routeFor(request, gateId)],
        })),
      },
    }));
    const outsideProvider: OutsideRouteCandidateSource = { routeToGates };

    const result = await V2DirectionsService.calculateHybridPreview({
      request: {
        startPlace: null,
        destination,
        currentLocation: origin,
        forceOutside: true,
      },
      token: { requestId: 'hybrid-directions', requestVersion: 7 },
      signal: new AbortController().signal,
      outsideProvider,
    });

    expect(result.status).toBe('ready');
    expect(routeToGates).toHaveBeenCalledTimes(1);
    const providerRequest = routeToGates.mock.calls[0][0];
    expect(providerRequest.gates).toHaveLength(14);
    expect(providerRequest.gates).toContainEqual(expect.objectContaining({
      gateId: 'GATE_12',
      routeTargetCoordinate: { latitude: 24.963676, longitude: 67.006339 },
    }));
    expect(result.route?.startResolution?.gate?.id).toBe('GATE_12');
    expect(result.route?.selectedOutsideCandidateId).toBe('hybrid-directions:google:GATE_12:preferred');
    expect(result.route?.outsideRoute).toMatchObject({
      candidateId: 'hybrid-directions:google:GATE_12:preferred',
      gateId: 'GATE_12',
      provider: 'google',
    });
    expect(result.instructions[0]).toMatchObject({
      id: 'outside-google-step-12',
      text: 'Turn right toward Gate 12',
      roadName: 'Public Road',
    });
  });

  test('rejects incomplete provider sets before core finalization', async () => {
    const outsideProvider: OutsideRouteCandidateSource = {
      routeToGates: jest.fn(async (request) => ({
        status: 'success',
        candidateSet: {
          requestId: request.token.requestId,
          requestVersion: request.token.requestVersion,
          provider: 'google',
          outcomes: request.gates.slice(0, 1).map(({ gateId }) => ({
            status: 'routed' as const,
            gateId,
            routes: [routeFor(request, gateId)],
          })),
        },
      })),
    };

    const result = await V2DirectionsService.calculateHybridPreview({
      request: { startPlace: null, destination, currentLocation: origin, forceOutside: true },
      token: { requestId: 'hybrid-incomplete', requestVersion: 1 },
      signal: new AbortController().signal,
      outsideProvider,
    });

    expect(result).toMatchObject({
      status: 'unavailable',
      route: null,
      message: 'Outside route provider returned an invalid candidate set.',
    });
  });
});

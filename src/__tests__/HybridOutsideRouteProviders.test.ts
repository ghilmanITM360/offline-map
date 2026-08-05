import { DirectDirectionGuideProvider } from '../services/outsideRouting/DirectDirectionGuideProvider';
import { HybridOutsideRouteOrchestrator } from '../services/outsideRouting/HybridOutsideRouteOrchestrator';
import { OfflineOsmWalkingRouteProvider } from '../services/outsideRouting/OfflineOsmWalkingRouteProvider';
import * as outsideRouteValidation from '../services/outsideRouting/OutsideRouteValidation';
import type {
  NormalizedOutsideCandidate,
  OutsideProviderAttempt,
  OutsideRouteProviderId,
  OutsideWalkingRouteProvider,
  OutsideWalkingRouteRequest,
} from '../models/outsideRouting';

const request: OutsideWalkingRouteRequest = {
  token: { requestId: 'hybrid-1', requestVersion: 1 },
  origin: { latitude: 24.96, longitude: 67.01 },
  gates: [
    {
      gateId: 'GATE_05',
      gateCoordinate: { latitude: 24.961, longitude: 67.011 },
      routeTargetCoordinate: { latitude: 24.9609, longitude: 67.0109 },
    },
    {
      gateId: 'GATE_08',
      gateCoordinate: { latitude: 24.962, longitude: 67.012 },
      routeTargetCoordinate: { latitude: 24.9619, longitude: 67.0119 },
    },
  ],
  signal: new AbortController().signal,
};

function normalized(provider: Exclude<OutsideRouteProviderId, 'direct-guide'>, gateId: string): NormalizedOutsideCandidate {
  const gateTarget = request.gates.find((gate) => gate.gateId === gateId)?.routeTargetCoordinate;
  if (!gateTarget) throw new Error(`Missing test gate target: ${gateId}`);
  return {
    schemaVersion: 1,
    candidateId: `hybrid-1:${provider}:${gateId}:0`,
    requestId: 'hybrid-1',
    requestVersion: 1,
    provider,
    gateId,
    distanceM: 210,
    durationSeconds: 160,
    coordinates: [request.origin, { latitude: 24.9605, longitude: 67.0105 }, gateTarget],
    steps: [{
      id: 'osm-step-1',
      maneuver: 'turn-right',
      distanceM: 80,
      durationSeconds: 55,
      coordinate: { latitude: 24.9605, longitude: 67.0105 },
      instruction: 'Turn right',
      roadName: 'Public Road',
    }],
    roadFollowing: true,
    distanceKind: 'walking-route',
    warnings: [],
    fallbackReason: null,
    fallbackHistory: [],
  };
}

class FakeProvider implements OutsideWalkingRouteProvider {
  calls = 0;
  constructor(readonly id: OutsideRouteProviderId, private readonly attempt: OutsideProviderAttempt) {}
  async routeToGates(): Promise<OutsideProviderAttempt> {
    this.calls += 1;
    return this.attempt;
  }
}

function completeAttempt(provider: Exclude<OutsideRouteProviderId, 'direct-guide'>): OutsideProviderAttempt {
  return {
    status: 'success',
    candidateSet: {
      requestId: 'hybrid-1',
      requestVersion: 1,
      provider,
      outcomes: request.gates.map(({ gateId }) => ({ status: 'routed' as const, gateId, routes: [normalized(provider, gateId)] })),
    },
  };
}

describe('hybrid outside route providers', () => {
  test('Google success stops fallback providers', async () => {
    const google = new FakeProvider('google', completeAttempt('google'));
    const osm = new FakeProvider('offline-osm', completeAttempt('offline-osm'));
    const direct = new DirectDirectionGuideProvider();
    const directSpy = jest.spyOn(direct, 'routeToGates');

    const result = await new HybridOutsideRouteOrchestrator({ google, osm, direct }).routeToGates(request);

    expect(result.status).toBe('success');
    expect(google.calls).toBe(1);
    expect(osm.calls).toBe(0);
    expect(directSpy).not.toHaveBeenCalled();
  });

  test('Google failure falls back once to OSM and preserves failure reason', async () => {
    const google = new FakeProvider('google', {
      status: 'failure',
      failure: { provider: 'google', code: 'timed-out', retryable: true },
    });
    const osm = new FakeProvider('offline-osm', completeAttempt('offline-osm'));

    const result = await new HybridOutsideRouteOrchestrator({
      google,
      osm,
      direct: new DirectDirectionGuideProvider(),
    }).routeToGates(request);

    expect(google.calls).toBe(1);
    expect(osm.calls).toBe(1);
    expect(result.status).toBe('success');
    if (result.status === 'success') {
      const outcome = result.candidateSet.outcomes[0];
      expect(outcome.status).toBe('routed');
      if (outcome.status === 'routed') {
        expect(outcome.routes[0]).toMatchObject({
          provider: 'offline-osm',
          fallbackReason: 'timed-out',
          fallbackHistory: [{ provider: 'google', code: 'timed-out', retryable: true }],
        });
      }
    }
  });

  test('synchronous OSM adapter preserves per-gate routes without scheduling a fake interrupt timer', async () => {
    const timeoutSpy = jest.spyOn(global, 'setTimeout');
    const resolver = jest.fn((_request, gate) => ({
      status: 'routed' as const,
      distanceM: 250,
      durationSeconds: 180,
      coordinates: [request.origin, { latitude: 24.9604, longitude: 67.0104 }, gate.routeTargetCoordinate],
      steps: normalized('offline-osm', gate.gateId).steps,
      warnings: [{ code: 'distance-sanity-cap-exceeded' as const }],
    }));
    const provider = new OfflineOsmWalkingRouteProvider({ resolveGateRoute: resolver });

    const result = await provider.routeToGates(request);

    expect(resolver).toHaveBeenCalledTimes(2);
    expect(timeoutSpy).not.toHaveBeenCalled();
    expect(result.status).toBe('success');
    if (result.status === 'success') {
      expect(result.candidateSet.outcomes).toHaveLength(2);
      expect(result.candidateSet).not.toHaveProperty('selectedGate');
      const first = result.candidateSet.outcomes[0];
      if (first.status === 'routed') {
        expect(first.routes[0]).toMatchObject({ provider: 'offline-osm', roadFollowing: true, distanceM: 250 });
        expect(first.routes[0].coordinates).toHaveLength(3);
        expect(first.routes[0].steps[0].roadName).toBe('Public Road');
      }
    }
    timeoutSpy.mockRestore();
  });

  test('Google and OSM failures produce direct guides for every approved gate', async () => {
    const google = new FakeProvider('google', {
      status: 'failure',
      failure: { provider: 'google', code: 'proxy-unavailable', retryable: true },
    });
    const osm = new FakeProvider('offline-osm', {
      status: 'failure',
      failure: { provider: 'offline-osm', code: 'outside-coverage', retryable: false },
    });

    const result = await new HybridOutsideRouteOrchestrator({
      google,
      osm,
      direct: new DirectDirectionGuideProvider(),
    }).routeToGates(request);

    expect(result.status).toBe('success');
    if (result.status === 'success') {
      expect(result.candidateSet.provider).toBe('direct-guide');
      expect(result.candidateSet.outcomes).toHaveLength(2);
      for (const outcome of result.candidateSet.outcomes) {
        expect(outcome.status).toBe('routed');
        if (outcome.status === 'routed') {
          expect(outcome.routes[0]).toMatchObject({
            provider: 'direct-guide',
            roadFollowing: false,
            durationSeconds: null,
            steps: [],
            fallbackReason: 'outside-coverage',
          });
          expect(outcome.routes[0].coordinates).toEqual([
            request.origin,
            request.gates.find((gate) => gate.gateId === outcome.gateId)?.routeTargetCoordinate,
          ]);
        }
      }
    }
  });

  test('direct guide returns safe failure when its generated candidate set fails validation', async () => {
    const validationSpy = jest
      .spyOn(outsideRouteValidation, 'assertCompleteCandidateSet')
      .mockImplementationOnce(() => { throw new Error('generated candidate invalid'); });
    const provider = new DirectDirectionGuideProvider();

    await expect(provider.routeToGates(request)).resolves.toEqual({
      status: 'failure',
      failure: { provider: 'direct-guide', code: 'unknown', retryable: false },
    });
    validationSpy.mockRestore();
  });

  test('cancellation terminates fallback chain', async () => {
    const google = new FakeProvider('google', {
      status: 'failure',
      failure: { provider: 'google', code: 'cancelled', retryable: false },
    });
    const osm = new FakeProvider('offline-osm', completeAttempt('offline-osm'));
    const result = await new HybridOutsideRouteOrchestrator({
      google,
      osm,
      direct: new DirectDirectionGuideProvider(),
    }).routeToGates(request);
    expect(result).toEqual({
      status: 'failure',
      failure: { provider: 'google', code: 'cancelled', retryable: false },
    });
    expect(osm.calls).toBe(0);
  });

  test('abort during a provider attempt cannot commit its later success', async () => {
    const controller = new AbortController();
    const google: OutsideWalkingRouteProvider = {
      id: 'google',
      routeToGates: jest.fn(async () => {
        controller.abort();
        return completeAttempt('google');
      }),
    };
    const osm = new FakeProvider('offline-osm', completeAttempt('offline-osm'));
    const orchestrator = new HybridOutsideRouteOrchestrator({
      google,
      osm,
      direct: new DirectDirectionGuideProvider(),
    });

    expect(orchestrator).not.toHaveProperty('id');
    await expect(orchestrator.routeToGates({ ...request, signal: controller.signal })).resolves.toEqual({
      status: 'failure',
      failure: { provider: 'google', code: 'cancelled', retryable: false },
    });
    expect(osm.calls).toBe(0);
  });

  test('OSM cancellation before gate calculation stops all resolver work', async () => {
    const controller = new AbortController();
    controller.abort();
    const resolver = jest.fn(() => ({ status: 'unreachable' as const, reason: 'no-route' as const }));
    const osm = new OfflineOsmWalkingRouteProvider({
      resolveGateRoute: resolver,
    });

    await expect(osm.routeToGates({ ...request, signal: controller.signal })).resolves.toEqual({
      status: 'failure',
      failure: { provider: 'offline-osm', code: 'cancelled', retryable: false },
    });
    expect(resolver).not.toHaveBeenCalled();
  });

  test('OSM cancellation between gate calculations stops remaining gates', async () => {
    const controller = new AbortController();
    const resolver = jest.fn((_request, gate) => {
      controller.abort();
      return {
        status: 'routed' as const,
        distanceM: 250,
        durationSeconds: null,
        coordinates: [request.origin, gate.routeTargetCoordinate],
        steps: [],
        warnings: [],
      };
    });
    const osm = new OfflineOsmWalkingRouteProvider({ resolveGateRoute: resolver });

    await expect(osm.routeToGates({ ...request, signal: controller.signal })).resolves.toEqual({
      status: 'failure',
      failure: { provider: 'offline-osm', code: 'cancelled', retryable: false },
    });
    expect(resolver).toHaveBeenCalledTimes(1);
  });
});

import type { OutsideWalkingRouteRequest } from '../models/outsideRouting';
import { createProductionOutsideRouteSource } from '../services/outsideRouting/ProductionOutsideRouteSource';

const gate12 = {
  gateId: 'GATE_12',
  gateCoordinate: { latitude: 24.963676, longitude: 67.006339 },
  routeTargetCoordinate: { latitude: 24.963676, longitude: 67.006339 },
};

function request(origin = { latitude: 24.9762, longitude: 67.011 }): OutsideWalkingRouteRequest {
  return {
    token: { requestId: 'production-source', requestVersion: 1 },
    origin,
    gates: [gate12],
    signal: new AbortController().signal,
  };
}

describe('production outside route source', () => {
  test('uses Claude per-gate OSM resolver when Google proxy is unconfigured', async () => {
    const result = await createProductionOutsideRouteSource({ googleProxyBaseUrl: undefined }).routeToGates(request());

    expect(result.status).toBe('success');
    if (result.status !== 'success') return;
    expect(result.candidateSet.provider).toBe('offline-osm');
    const outcome = result.candidateSet.outcomes[0];
    expect(outcome.status).toBe('routed');
    if (outcome.status !== 'routed') return;
    expect(outcome.routes[0]).toMatchObject({
      gateId: 'GATE_12',
      provider: 'offline-osm',
      roadFollowing: true,
      fallbackHistory: [{ provider: 'google', code: 'proxy-unconfigured', retryable: true }],
    });
    expect(outcome.routes[0].coordinates.length).toBeGreaterThan(2);
    expect(outcome.routes[0].steps.length).toBeGreaterThan(0);
  });

  test('falls through to direct guide outside bundled graph coverage', async () => {
    const result = await createProductionOutsideRouteSource({ googleProxyBaseUrl: undefined }).routeToGates(
      request({ latitude: 0, longitude: 0 }),
    );

    expect(result.status).toBe('success');
    if (result.status !== 'success') return;
    expect(result.candidateSet.provider).toBe('direct-guide');
    const outcome = result.candidateSet.outcomes[0];
    expect(outcome.status).toBe('routed');
    if (outcome.status !== 'routed') return;
    expect(outcome.routes[0]).toMatchObject({
      provider: 'direct-guide',
      gateId: 'GATE_12',
      roadFollowing: false,
      durationSeconds: null,
      steps: [],
      fallbackReason: 'outside-coverage',
    });
  });
});

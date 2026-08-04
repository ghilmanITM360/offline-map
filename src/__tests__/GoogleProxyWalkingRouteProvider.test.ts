import { GoogleProxyWalkingRouteProvider } from '../services/outsideRouting/GoogleProxyWalkingRouteProvider';
import type { OutsideWalkingRouteRequest } from '../models/outsideRouting';

const request: OutsideWalkingRouteRequest = {
  token: { requestId: 'req-google-1', requestVersion: 3 },
  origin: { latitude: 24.96, longitude: 67.01 },
  gates: [{
    gateId: 'GATE_05',
    gateCoordinate: { latitude: 24.961, longitude: 67.011 },
    routeTargetCoordinate: { latitude: 24.9609, longitude: 67.0109 },
  }],
  signal: new AbortController().signal,
};

const successBody = {
  schemaVersion: 1,
  requestId: 'req-google-1',
  requestVersion: 3,
  outcomes: [{
    status: 'routed',
    gateId: 'GATE_05',
    routes: [{
      routeId: 'google-route-1',
      distanceM: 180,
      durationSeconds: 140,
      coordinates: [
        { latitude: 24.96, longitude: 67.01 },
        { latitude: 24.9605, longitude: 67.0105 },
        { latitude: 24.9609, longitude: 67.0109 },
      ],
      steps: [{
        id: 'step-1',
        maneuver: 'turn-left',
        distanceM: 80,
        durationSeconds: 60,
        coordinate: { latitude: 24.9605, longitude: 67.0105 },
        instruction: 'Turn left',
        roadName: 'Public Road',
      }],
      warnings: ['Use pedestrian crossing'],
    }],
  }],
};

function response(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(),
    json: jest.fn(async () => body),
  } as unknown as Response;
}

describe('GoogleProxyWalkingRouteProvider', () => {
  test('sends walking-only request and returns normalized Google candidates', async () => {
    const fetchImpl = jest.fn(async () => response(successBody));
    const provider = new GoogleProxyWalkingRouteProvider({
      baseUrl: 'https://routing.example.test',
      fetchImpl,
      timeoutMs: 1_000,
    });

    const attempt = await provider.routeToGates(request);

    expect(attempt.status).toBe('success');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://routing.example.test/v1/outside-walking-routes:compute');
    expect(init.headers).toEqual({ Accept: 'application/json', 'Content-Type': 'application/json' });
    const body = JSON.parse(String(init.body));
    expect(body.mode).toBe('WALK');
    expect(body).not.toHaveProperty('apiKey');
    if (attempt.status === 'success') {
      const outcome = attempt.candidateSet.outcomes[0];
      expect(outcome.status).toBe('routed');
      if (outcome.status === 'routed') {
        expect(outcome.routes[0]).toMatchObject({
          provider: 'google',
          roadFollowing: true,
          gateId: 'GATE_05',
          requestId: 'req-google-1',
        });
        expect(outcome.routes[0]).not.toHaveProperty('routeId');
        expect(JSON.stringify(outcome.routes[0])).not.toMatch(/api.?key|credential/i);
      }
    }
  });

  test('does not call fetch when proxy URL is missing or request is malformed', async () => {
    const fetchImpl = jest.fn();
    const unconfigured = new GoogleProxyWalkingRouteProvider({ fetchImpl });
    expect(await unconfigured.routeToGates(request)).toEqual({
      status: 'failure',
      failure: { provider: 'google', code: 'proxy-unconfigured', retryable: true },
    });

    const configured = new GoogleProxyWalkingRouteProvider({ baseUrl: 'https://routing.example.test', fetchImpl });
    const malformed = { ...request, origin: { latitude: Number.NaN, longitude: 67.01 } };
    expect(await configured.routeToGates(malformed)).toEqual({
      status: 'failure',
      failure: { provider: 'google', code: 'invalid-request', retryable: false },
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test.each([
    [429, 'rate-limited', true],
    [500, 'provider-server-error', true],
    [400, 'invalid-request', false],
  ] as const)('maps HTTP %s to safe failure %s', async (status, code, retryable) => {
    const provider = new GoogleProxyWalkingRouteProvider({
      baseUrl: 'https://routing.example.test',
      fetchImpl: jest.fn(async () => response({}, status)),
    });
    expect(await provider.routeToGates(request)).toEqual({
      status: 'failure',
      failure: { provider: 'google', code, retryable },
    });
  });

  test('maps malformed successful response without leaking raw data', async () => {
    const provider = new GoogleProxyWalkingRouteProvider({
      baseUrl: 'https://routing.example.test',
      fetchImpl: jest.fn(async () => response({ ...successBody, requestId: 'stale-request' })),
    });
    expect(await provider.routeToGates(request)).toEqual({
      status: 'failure',
      failure: { provider: 'google', code: 'malformed-response', retryable: false },
    });
  });

  test('times out one request and reports external cancellation separately', async () => {
    jest.useFakeTimers();
    const hangingFetch = jest.fn((_url: string, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
    }));
    const provider = new GoogleProxyWalkingRouteProvider({
      baseUrl: 'https://routing.example.test',
      fetchImpl: hangingFetch,
      timeoutMs: 50,
    });

    const timedOutPromise = provider.routeToGates(request);
    await jest.advanceTimersByTimeAsync(50);
    await expect(timedOutPromise).resolves.toEqual({
      status: 'failure',
      failure: { provider: 'google', code: 'timed-out', retryable: true },
    });

    const controller = new AbortController();
    const cancelledPromise = provider.routeToGates({ ...request, signal: controller.signal });
    controller.abort();
    await expect(cancelledPromise).resolves.toEqual({
      status: 'failure',
      failure: { provider: 'google', code: 'cancelled', retryable: false },
    });
    jest.useRealTimers();
  });
});

import type {
  NormalizedOutsideRoute,
  OutsideRouteCandidateSet,
  OutsideWalkingRouteProvider,
} from '../models/outsideRouting';
import type { Place } from '../models/types';
import {
  V2DirectionsService,
  type HybridCoreOutsideRoutingAdapter,
} from '../services/V2DirectionsService';

process.env.EXPO_PUBLIC_USE_IJTEMA_V2_ROUTING = 'true';

const destination: Place = {
  id: 'B2',
  name: 'Block 2',
  category: 'Block',
  description: 'Block 2',
  coordinate: { latitude: 24.965, longitude: 67.015 },
  sourceVersion: 'v2',
};

function outsideRoute(gateId: string): NormalizedOutsideRoute {
  return {
    schemaVersion: 1,
    candidateId: `hybrid-directions:google:${gateId}:0`,
    requestId: 'hybrid-directions',
    requestVersion: 1,
    provider: 'google',
    gateId,
    distanceM: gateId === 'GATE_08' ? 200 : 150,
    durationSeconds: 120,
    coordinates: [
      { latitude: 24.96, longitude: 67.01 },
      { latitude: 24.961, longitude: 67.011 },
    ],
    steps: [],
    roadFollowing: true,
    distanceKind: 'walking-route',
    warnings: [],
    fallbackReason: null,
    fallbackHistory: [],
  };
}

const candidateSet: OutsideRouteCandidateSet = {
  requestId: 'hybrid-directions',
  requestVersion: 1,
  provider: 'google',
  outcomes: ['GATE_05', 'GATE_08'].map((gateId) => ({
    status: 'routed' as const,
    gateId,
    routes: [outsideRoute(gateId)],
  })),
};

describe('V2DirectionsService hybrid core seam', () => {
  test('passes per-gate provider candidates unchanged and attaches only core-selected gate route', async () => {
    const outsideProvider: OutsideWalkingRouteProvider = {
      id: 'google',
      routeToGates: jest.fn(async () => ({ status: 'success', candidateSet })),
    };
    const finalizeOutsideRoutingPlan = jest.fn(() => ({
      id: 'core-selected-route',
      sourceVersion: 'v2' as const,
      coordinates: [
        { latitude: 24.96, longitude: 67.01 },
        { latitude: 24.965, longitude: 67.015 },
      ],
      nodes: ['GATE_08', 'B2_C1'],
      totalDistance: 500,
      estimatedTimeMin: 6,
      segments: [],
      instructions: [],
      startLabel: 'Gate 08',
      destinationLabel: 'Block 2',
      startResolution: {
        mode: 'outside' as const,
        startType: 'nearest_official_gate' as const,
        coordinate: { latitude: 24.961, longitude: 67.011 },
        candidateNodes: ['GATE_08'],
        gate: { id: 'GATE_08' },
      },
    }));
    const core: HybridCoreOutsideRoutingAdapter = {
      prepareOutsideRoutingPlan: jest.fn(() => ({
        planId: 'plan-1',
        origin: { latitude: 24.96, longitude: 67.01 },
        providerGateTargets: [
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
      })),
      finalizeOutsideRoutingPlan,
    };

    const result = await V2DirectionsService.calculateHybridPreview({
      request: {
        startPlace: null,
        destination,
        currentLocation: { latitude: 24.96, longitude: 67.01 },
        forceOutside: true,
      },
      token: { requestId: 'hybrid-directions', requestVersion: 1 },
      signal: new AbortController().signal,
      outsideProvider,
      core,
    });

    expect(result.status).toBe('ready');
    expect(finalizeOutsideRoutingPlan).toHaveBeenCalledWith(expect.objectContaining({
      outsideCandidates: candidateSet,
    }));
    expect(result.route?.startResolution?.gate?.id).toBe('GATE_08');
    expect(result.route?.outsideRoute?.gateId).toBe('GATE_08');
    expect(result.route?.outsideRoute?.distanceM).toBe(200);
    expect(candidateSet).not.toHaveProperty('selectedGate');
  });

  test('fails safely when core-selected gate has no matching provider route', async () => {
    const outsideProvider: OutsideWalkingRouteProvider = {
      id: 'google',
      routeToGates: jest.fn(async () => ({ status: 'success', candidateSet })),
    };
    const core: HybridCoreOutsideRoutingAdapter = {
      prepareOutsideRoutingPlan: jest.fn(() => ({
        planId: 'plan-2',
        origin: { latitude: 24.96, longitude: 67.01 },
        providerGateTargets: [
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
      })),
      finalizeOutsideRoutingPlan: jest.fn(() => ({
        id: 'bad-core-route',
        sourceVersion: 'v2',
        coordinates: [],
        nodes: [],
        totalDistance: 1,
        estimatedTimeMin: 1,
        segments: [],
        instructions: [],
        startLabel: 'Gate 22',
        destinationLabel: 'Block 2',
        startResolution: {
          mode: 'outside',
          startType: 'nearest_official_gate',
          coordinate: { latitude: 24.961, longitude: 67.011 },
          candidateNodes: ['GATE_22'],
          gate: { id: 'GATE_22' },
        },
      })),
    };
    const result = await V2DirectionsService.calculateHybridPreview({
      request: {
        startPlace: null,
        destination,
        currentLocation: { latitude: 24.96, longitude: 67.01 },
        forceOutside: true,
      },
      token: { requestId: 'hybrid-directions', requestVersion: 1 },
      signal: new AbortController().signal,
      outsideProvider,
      core,
    });
    expect(result).toMatchObject({
      status: 'unavailable',
      route: null,
      message: 'Core-selected gate has no matching outside provider route.',
    });
  });
});

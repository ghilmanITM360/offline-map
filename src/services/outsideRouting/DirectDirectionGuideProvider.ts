import { getDistance } from 'geolib';

import type {
  OutsideProviderAttempt,
  OutsideWalkingRouteProvider,
  OutsideWalkingRouteRequest,
} from '../../models/outsideRouting';
import { assertCompleteCandidateSet, assertOutsideWalkingRouteRequest } from './OutsideRouteValidation';

export class DirectDirectionGuideProvider implements OutsideWalkingRouteProvider {
  readonly id = 'direct-guide' as const;

  async routeToGates(request: OutsideWalkingRouteRequest): Promise<OutsideProviderAttempt> {
    try {
      assertOutsideWalkingRouteRequest(request);
    } catch {
      return {
        status: 'failure',
        failure: { provider: this.id, code: 'invalid-request', retryable: false },
      };
    }
    if (request.signal.aborted) {
      return {
        status: 'failure',
        failure: { provider: this.id, code: 'cancelled', retryable: false },
      };
    }

    const candidateSet = {
      requestId: request.token.requestId,
      requestVersion: request.token.requestVersion,
      provider: this.id,
      outcomes: request.gates.map((gate) => ({
        status: 'routed' as const,
        gateId: gate.gateId,
        routes: [{
          schemaVersion: 1 as const,
          candidateId: `${request.token.requestId}:${this.id}:${gate.gateId}:0`,
          requestId: request.token.requestId,
          requestVersion: request.token.requestVersion,
          provider: this.id,
          gateId: gate.gateId,
          distanceM: getDistance(request.origin, gate.routeTargetCoordinate),
          durationSeconds: null,
          coordinates: [request.origin, gate.routeTargetCoordinate],
          steps: [],
          roadFollowing: false,
          distanceKind: 'direct-distance' as const,
          warnings: [{ code: 'direct-guide-not-road-route' as const }],
          fallbackReason: null,
          fallbackHistory: [],
        }],
      })),
    };
    try {
      assertCompleteCandidateSet(request, candidateSet);
    } catch {
      return {
        status: 'failure',
        failure: { provider: this.id, code: 'unknown', retryable: false },
      };
    }
    return { status: 'success', candidateSet };
  }
}

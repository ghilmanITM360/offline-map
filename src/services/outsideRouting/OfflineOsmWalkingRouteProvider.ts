import type {
  GateRouteOutcome,
  NormalizedWalkingStep,
  OutsideProviderAttempt,
  OutsideRouteFailureCode,
  OutsideRouteWarning,
  OutsideWalkingRouteProvider,
  OutsideWalkingRouteRequest,
} from '../../models/outsideRouting';
import type { Coordinate } from '../../models/types';
import { assertCompleteCandidateSet, assertOutsideWalkingRouteRequest } from './OutsideRouteValidation';

export type OfflineOsmGateRouteResult =
  | {
      status: 'routed';
      distanceM: number;
      durationSeconds: number | null;
      coordinates: readonly Coordinate[];
      steps: readonly NormalizedWalkingStep[];
      warnings: readonly OutsideRouteWarning[];
    }
  | { status: 'unreachable'; reason: 'no-route' }
  | {
      status: 'failure';
      reason: Extract<OutsideRouteFailureCode, 'outside-coverage' | 'graph-unavailable' | 'unknown'>;
      retryable: boolean;
    };

export type OfflineOsmGateRouteResolver = (
  request: OutsideWalkingRouteRequest,
  gate: OutsideWalkingRouteRequest['gates'][number],
) => Promise<OfflineOsmGateRouteResult> | OfflineOsmGateRouteResult;

export interface OfflineOsmWalkingRouteProviderOptions {
  resolveGateRoute: OfflineOsmGateRouteResolver;
}

export class OfflineOsmWalkingRouteProvider implements OutsideWalkingRouteProvider {
  readonly id = 'offline-osm' as const;
  private readonly resolveGateRoute: OfflineOsmGateRouteResolver;

  constructor(options: OfflineOsmWalkingRouteProviderOptions) {
    this.resolveGateRoute = options.resolveGateRoute;
  }

  async routeToGates(request: OutsideWalkingRouteRequest): Promise<OutsideProviderAttempt> {
    try {
      assertOutsideWalkingRouteRequest(request);
    } catch {
      return { status: 'failure', failure: { provider: this.id, code: 'invalid-request', retryable: false } };
    }

    const outcomes: GateRouteOutcome[] = [];
    try {
      for (const [index, gate] of request.gates.entries()) {
        if (request.signal.aborted) {
          return { status: 'failure', failure: { provider: this.id, code: 'cancelled', retryable: false } };
        }
        const result = await this.resolveGateRoute(request, gate);
        if (request.signal.aborted) {
          return { status: 'failure', failure: { provider: this.id, code: 'cancelled', retryable: false } };
        }
        if (result.status === 'failure') {
          return { status: 'failure', failure: { provider: this.id, code: result.reason, retryable: result.retryable } };
        }
        if (result.status === 'unreachable') {
          outcomes.push({ status: 'unreachable', gateId: gate.gateId, reason: 'no-route' });
          continue;
        }
        outcomes.push({
          status: 'routed',
          gateId: gate.gateId,
          routes: [{
            schemaVersion: 1,
            candidateId: `${request.token.requestId}:${this.id}:${gate.gateId}:${index}`,
            requestId: request.token.requestId,
            requestVersion: request.token.requestVersion,
            provider: this.id,
            gateId: gate.gateId,
            distanceM: result.distanceM,
            durationSeconds: result.durationSeconds,
            coordinates: result.coordinates,
            steps: result.steps,
            roadFollowing: true,
            distanceKind: 'walking-route',
            warnings: result.warnings,
            fallbackReason: null,
            fallbackHistory: [],
          }],
        });
      }
    } catch {
      return { status: 'failure', failure: { provider: this.id, code: 'graph-unavailable', retryable: false } };
    }

    if (!outcomes.some((outcome) => outcome.status === 'routed')) {
      return { status: 'failure', failure: { provider: this.id, code: 'no-route', retryable: false } };
    }
    const candidateSet = {
      requestId: request.token.requestId,
      requestVersion: request.token.requestVersion,
      provider: this.id,
      outcomes,
    };
    try {
      assertCompleteCandidateSet(request, candidateSet);
    } catch {
      return { status: 'failure', failure: { provider: this.id, code: 'graph-unavailable', retryable: false } };
    }
    return { status: 'success', candidateSet };
  }
}

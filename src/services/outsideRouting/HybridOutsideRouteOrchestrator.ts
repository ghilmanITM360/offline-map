import type {
  NormalizedOutsideRoute,
  OutsideProviderAttempt,
  OutsideRouteCandidateSet,
  OutsideWalkingRouteProvider,
  OutsideWalkingRouteRequest,
  SafeOutsideRouteFailure,
} from '../../models/outsideRouting';
import { assertCompleteCandidateSet } from './OutsideRouteValidation';

export interface HybridOutsideRouteOrchestratorProviders {
  google: OutsideWalkingRouteProvider;
  osm: OutsideWalkingRouteProvider;
  direct: OutsideWalkingRouteProvider;
}

function withFallbackHistory(
  candidateSet: OutsideRouteCandidateSet,
  history: readonly SafeOutsideRouteFailure[],
): OutsideRouteCandidateSet {
  if (history.length === 0) return candidateSet;
  const fallbackReason = history[history.length - 1].code;
  return {
    ...candidateSet,
    outcomes: candidateSet.outcomes.map((outcome) => outcome.status === 'unreachable'
      ? outcome
      : {
          ...outcome,
          routes: outcome.routes.map((route): NormalizedOutsideRoute => ({
            ...route,
            fallbackReason,
            fallbackHistory: [...history],
          })),
        }),
  };
}

export class HybridOutsideRouteOrchestrator implements OutsideWalkingRouteProvider {
  readonly id = 'google' as const;
  private readonly providers: readonly OutsideWalkingRouteProvider[];

  constructor(providers: HybridOutsideRouteOrchestratorProviders) {
    if (providers.google.id !== 'google' || providers.osm.id !== 'offline-osm' || providers.direct.id !== 'direct-guide') {
      throw new Error('Hybrid provider order must be Google, offline OSM, then direct guide.');
    }
    this.providers = [providers.google, providers.osm, providers.direct];
  }

  async routeToGates(request: OutsideWalkingRouteRequest): Promise<OutsideProviderAttempt> {
    const history: SafeOutsideRouteFailure[] = [];
    for (const provider of this.providers) {
      if (request.signal.aborted) {
        return { status: 'failure', failure: { provider: provider.id, code: 'cancelled', retryable: false } };
      }
      const attempt = await provider.routeToGates(request);
      if (attempt.status === 'failure') {
        if (attempt.failure.code === 'cancelled') return attempt;
        history.push(attempt.failure);
        continue;
      }
      const candidateSet = withFallbackHistory(attempt.candidateSet, history);
      try {
        assertCompleteCandidateSet(request, candidateSet);
      } catch {
        history.push({ provider: provider.id, code: 'malformed-response', retryable: false });
        continue;
      }
      if (!candidateSet.outcomes.some((outcome) => outcome.status === 'routed')) {
        history.push({ provider: provider.id, code: 'no-route', retryable: false });
        continue;
      }
      return { status: 'success', candidateSet };
    }
    return {
      status: 'failure',
      failure: history[history.length - 1] ?? { provider: 'direct-guide', code: 'unknown', retryable: false },
    };
  }
}

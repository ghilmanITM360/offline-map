import type {
  NormalizedWalkingStep,
  OutsideRouteCandidateSource,
  OutsideWalkingManeuver,
} from '../../models/outsideRouting';
import { RoutingServiceV2 } from '../RoutingServiceV2';
import { generateStreetInstructions } from '../StreetInstructionService';
import { isWithinStreetGraphRadius } from '../OutsideStreetRoutingService';
import { DirectDirectionGuideProvider } from './DirectDirectionGuideProvider';
import { GoogleProxyWalkingRouteProvider } from './GoogleProxyWalkingRouteProvider';
import { HybridOutsideRouteOrchestrator } from './HybridOutsideRouteOrchestrator';
import { OfflineOsmWalkingRouteProvider } from './OfflineOsmWalkingRouteProvider';

export interface ProductionOutsideRouteSourceOptions {
  googleProxyBaseUrl?: string;
  googleTimeoutMs?: number;
  osmTimeoutMs?: number;
}

function maneuver(type: string): OutsideWalkingManeuver {
  switch (type) {
    case 'slight_left': return 'slight-left';
    case 'slight_right': return 'slight-right';
    case 'left':
    case 'sharp_left': return 'turn-left';
    case 'right':
    case 'sharp_right': return 'turn-right';
    case 'u_turn': return 'u-turn';
    case 'arrival': return 'arrive';
    default: return 'continue';
  }
}

function normalizedSteps(
  candidate: NonNullable<ReturnType<typeof RoutingServiceV2.resolveOfflineOsmOutsideCandidate>>,
  gateLabel: string,
): NormalizedWalkingStep[] {
  return generateStreetInstructions(
    candidate.topologyCoordinates,
    candidate.topologyEdgeDistancesM,
    candidate.topologyEdgeNames,
    gateLabel,
  ).map((step) => ({
    id: step.id,
    maneuver: maneuver(step.maneuver),
    distanceM: step.distanceM,
    durationSeconds: null,
    coordinate: step.coordinate,
    instruction: step.text,
    roadName: step.roadName,
  }));
}

export function createProductionOutsideRouteSource(
  options: ProductionOutsideRouteSourceOptions = {},
): OutsideRouteCandidateSource {
  const google = new GoogleProxyWalkingRouteProvider({
    baseUrl: options.googleProxyBaseUrl,
    timeoutMs: options.googleTimeoutMs,
  });
  const osm = new OfflineOsmWalkingRouteProvider({
    timeoutMs: options.osmTimeoutMs,
    resolveGateRoute: (request, gate) => {
      const v2Origin = { lat: request.origin.latitude, lng: request.origin.longitude };
      if (!isWithinStreetGraphRadius(v2Origin)) {
        return { status: 'failure', reason: 'outside-coverage', retryable: false };
      }
      const candidate = RoutingServiceV2.resolveOfflineOsmOutsideCandidate(request.origin, gate.gateId);
      if (!candidate?.outsideCoordinates) return { status: 'unreachable', reason: 'no-route' };
      return {
        status: 'routed',
        distanceM: candidate.outsideDistanceM,
        durationSeconds: null,
        coordinates: candidate.outsideCoordinates,
        steps: normalizedSteps(candidate, gate.gateId.replace('GATE_', 'Gate ')),
        warnings: candidate.sanityCapExceeded
          ? [{ code: 'distance-sanity-cap-exceeded' }]
          : [],
      };
    },
  });
  return new HybridOutsideRouteOrchestrator({
    google,
    osm,
    direct: new DirectDirectionGuideProvider(),
  });
}

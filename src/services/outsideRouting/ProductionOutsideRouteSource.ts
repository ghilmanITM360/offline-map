import type {
  NormalizedWalkingStep,
  OutsideRouteCandidateSource,
  OutsideWalkingManeuver,
} from '../../models/outsideRouting';
import { IJTEMA_GATES } from '../../data/ijtema';
import { RoutingServiceV2 } from '../RoutingServiceV2';
import { generateStreetInstructions } from '../StreetInstructionService';
import { isWithinStreetGraphRadius } from '../OutsideStreetRoutingService';
import { DirectDirectionGuideProvider } from './DirectDirectionGuideProvider';
import { GoogleProxyWalkingRouteProvider } from './GoogleProxyWalkingRouteProvider';
import { HybridOutsideRouteOrchestrator } from './HybridOutsideRouteOrchestrator';
import { OfflineOsmWalkingRouteProvider } from './OfflineOsmWalkingRouteProvider';
import { resolveOutsideRouteMobileConfig } from './OutsideRouteConfigService';

export interface ProductionOutsideRouteSourceOptions {
  googleProxyBaseUrl?: string;
  googleTimeoutMs?: number;
  enableGoogleDiagnosticProxy?: boolean;
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
  gateLabel: { en: string; ur: string },
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
    semantic: step.semantic,
    roadName: step.roadName,
  }));
}

export function createProductionOutsideRouteSource(
  options: ProductionOutsideRouteSourceOptions = {},
): OutsideRouteCandidateSource {
  const mobileConfig = resolveOutsideRouteMobileConfig({
    EXPO_PUBLIC_IJTEMA_ROUTING_PROXY_BASE_URL: process.env.EXPO_PUBLIC_IJTEMA_ROUTING_PROXY_BASE_URL,
    EXPO_PUBLIC_ENABLE_GOOGLE_ROUTING_DIAGNOSTIC: process.env.EXPO_PUBLIC_ENABLE_GOOGLE_ROUTING_DIAGNOSTIC,
  });
  const google = new GoogleProxyWalkingRouteProvider({
    baseUrl: options.googleProxyBaseUrl ?? mobileConfig.googleProxyBaseUrl,
    timeoutMs: options.googleTimeoutMs ?? mobileConfig.googleProxyTimeoutMs,
  });
  const osm = new OfflineOsmWalkingRouteProvider({
    resolveGateRoute: (request, gate) => {
      const v2Origin = { lat: request.origin.latitude, lng: request.origin.longitude };
      if (!isWithinStreetGraphRadius(v2Origin)) {
        return { status: 'failure', reason: 'outside-coverage', retryable: false };
      }
      const candidate = RoutingServiceV2.resolveOfflineOsmOutsideCandidate(request.origin, gate.gateId);
      if (!candidate?.outsideCoordinates) return { status: 'unreachable', reason: 'no-route' };
      const gateRecord = IJTEMA_GATES.find((entry) => entry.id === gate.gateId);
      const gateLabelEn = gateRecord?.name.en ?? gate.gateId.replace('GATE_', 'Gate ');
      const gateLabel = { en: gateLabelEn, ur: gateRecord?.name.ur ?? gateLabelEn };
      return {
        status: 'routed',
        distanceM: candidate.outsideDistanceM,
        durationSeconds: null,
        coordinates: candidate.outsideCoordinates,
        steps: normalizedSteps(candidate, gateLabel),
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
    enableGoogleDiagnosticProxy:
      options.enableGoogleDiagnosticProxy ?? mobileConfig.enableGoogleDiagnosticProxy,
  });
}

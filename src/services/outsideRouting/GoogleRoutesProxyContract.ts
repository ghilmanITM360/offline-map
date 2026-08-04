import type { Coordinate } from '../../models/types';
import type { OutsideWalkingManeuver } from '../../models/outsideRouting';

export const GOOGLE_ROUTES_PROXY_PATH = '/v1/outside-walking-routes:compute';

export interface GoogleRoutesProxyRequestBody {
  schemaVersion: 1;
  requestId: string;
  requestVersion: number;
  mode: 'WALK';
  origin: Coordinate;
  gates: ReadonlyArray<{
    gateId: string;
    routeTargetCoordinate: Coordinate;
  }>;
}

export interface GoogleRoutesProxyStepDto {
  id: string;
  maneuver: OutsideWalkingManeuver;
  distanceM: number;
  durationSeconds: number | null;
  coordinate: Coordinate;
  instruction: string;
  roadName?: string;
}

export interface GoogleRoutesProxyRouteDto {
  routeId: string;
  distanceM: number;
  durationSeconds: number | null;
  coordinates: Coordinate[];
  steps: GoogleRoutesProxyStepDto[];
  warnings: string[];
}

export type GoogleRoutesProxyOutcomeDto =
  | { status: 'routed'; gateId: string; routes: GoogleRoutesProxyRouteDto[] }
  | { status: 'unreachable'; gateId: string; reason: 'no-route' };

export interface GoogleRoutesProxyResponseBody {
  schemaVersion: 1;
  requestId: string;
  requestVersion: number;
  outcomes: GoogleRoutesProxyOutcomeDto[];
}

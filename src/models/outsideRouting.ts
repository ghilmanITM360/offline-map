import type { Coordinate } from './types';

export type OutsideRouteProviderId = 'google' | 'offline-osm' | 'direct-guide';

export interface OutsideRouteRequestToken {
  requestId: string;
  requestVersion: number;
}

export interface OutsideGateRouteTarget {
  gateId: string;
  gateCoordinate: Coordinate;
  routeTargetCoordinate: Coordinate;
}

export interface OutsideWalkingRouteRequest {
  token: OutsideRouteRequestToken;
  origin: Coordinate;
  gates: readonly OutsideGateRouteTarget[];
  signal: AbortSignal;
}

export type OutsideWalkingManeuver =
  | 'depart'
  | 'continue'
  | 'slight-left'
  | 'slight-right'
  | 'turn-left'
  | 'turn-right'
  | 'u-turn'
  | 'arrive'
  | 'unknown';

export interface NormalizedWalkingStep {
  id: string;
  maneuver: OutsideWalkingManeuver;
  distanceM: number;
  durationSeconds: number | null;
  coordinate: Coordinate;
  instruction: string;
  roadName?: string;
}

export type OutsideRouteWarningCode =
  | 'provider-warning'
  | 'distance-sanity-cap-exceeded'
  | 'direct-guide-not-road-route';

export interface OutsideRouteWarning {
  code: OutsideRouteWarningCode;
  text?: string;
}

export type OutsideRouteFailureCode =
  | 'cancelled'
  | 'timed-out'
  | 'network-unavailable'
  | 'proxy-unconfigured'
  | 'proxy-unavailable'
  | 'rate-limited'
  | 'invalid-request'
  | 'malformed-response'
  | 'provider-server-error'
  | 'outside-coverage'
  | 'graph-unavailable'
  | 'no-route'
  | 'unknown';

export interface SafeOutsideRouteFailure {
  provider: OutsideRouteProviderId;
  code: OutsideRouteFailureCode;
  retryable: boolean;
  retryAfterSeconds?: number;
}

/** Canonical provider-neutral outside-route candidate shared by providers, core, viewmodels, and UI. */
export interface NormalizedOutsideCandidate {
  schemaVersion: 1;
  candidateId: string;
  requestId: string;
  requestVersion: number;
  provider: OutsideRouteProviderId;
  gateId: string;
  distanceM: number;
  durationSeconds: number | null;
  coordinates: readonly Coordinate[];
  steps: readonly NormalizedWalkingStep[];
  roadFollowing: boolean;
  distanceKind: 'walking-route' | 'direct-distance';
  warnings: readonly OutsideRouteWarning[];
  fallbackReason: OutsideRouteFailureCode | null;
  fallbackHistory: readonly SafeOutsideRouteFailure[];
}

/** @deprecated Use `NormalizedOutsideCandidate`; retained temporarily for source compatibility. */
export type NormalizedOutsideRoute = NormalizedOutsideCandidate;

export type GateRouteOutcome =
  | {
      status: 'routed';
      gateId: string;
      routes: readonly NormalizedOutsideCandidate[];
    }
  | {
      status: 'unreachable';
      gateId: string;
      reason: 'no-route';
    };

export interface OutsideRouteCandidateSet {
  requestId: string;
  requestVersion: number;
  provider: OutsideRouteProviderId;
  outcomes: readonly GateRouteOutcome[];
}

export type OutsideProviderAttempt =
  | { status: 'success'; candidateSet: OutsideRouteCandidateSet }
  | { status: 'failure'; failure: SafeOutsideRouteFailure };

export interface OutsideWalkingRouteProvider {
  readonly id: OutsideRouteProviderId;
  routeToGates(request: OutsideWalkingRouteRequest): Promise<OutsideProviderAttempt>;
}

/** Provider-neutral candidate source, including ordered fallback orchestration. */
export interface OutsideRouteCandidateSource {
  routeToGates(request: OutsideWalkingRouteRequest): Promise<OutsideProviderAttempt>;
}

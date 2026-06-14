/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Coordinate, V2ActiveRoute } from '../models/types';
import { RerouteService } from './RerouteService';
import { EntryGateRoutingService } from './EntryGateRoutingService';
import { RoutingDestinationV2, RoutingStartV2 } from './RoutingServiceV2';

export interface NavigationProgressV2Input {
  route: V2ActiveRoute;
  coordinate: Coordinate;
  previousProgressMeters: number;
  previousEtaMinutes?: number;
  walkingSpeedMs: number;
}

export interface NavigationProgressV2 {
  progressMeters: number;
  remainingDistanceM: number;
  etaMinutes: number;
  snappedCoordinate: Coordinate;
  distanceToRouteMeters: number;
}

export interface RerouteEvidenceV2Input {
  gpsAccuracyM?: number;
  consecutiveOffRouteCount: number;
  offRouteDurationMs: number;
  cooldownRemainingMs: number;
  movedDistanceSinceLastAcceptedM: number;
}

export interface RerouteEvidenceV2 {
  thresholdM: number;
  shouldReroute: boolean;
}

export function shouldIgnorePoorAccuracyMovementV2(input: { movedDistanceM: number; accuracyM?: number }): boolean {
  return (input.accuracyM ?? 0) > 50 && input.movedDistanceM < 10;
}

export function calculateNavigationProgressV2(input: NavigationProgressV2Input): NavigationProgressV2 {
  const projection = RerouteService.projectProgressMetersOnRoute(input.coordinate, input.route);
  const progressMeters = RerouteService.clampMonotonicProgress(
    input.previousProgressMeters,
    projection.progressMeters,
  );
  const remainingDistanceM = Math.max(0, input.route.totalDistanceM - progressMeters);
  const etaMinutes = Math.max(0, Math.ceil(remainingDistanceM / input.walkingSpeedMs / 60));

  return {
    progressMeters,
    remainingDistanceM,
    etaMinutes: input.previousEtaMinutes && Math.abs(input.previousEtaMinutes - etaMinutes) <= 1
      ? input.previousEtaMinutes
      : etaMinutes,
    snappedCoordinate: projection.snappedCoordinate,
    distanceToRouteMeters: projection.distanceToRouteMeters,
  };
}

export function evaluateRerouteEvidenceV2(input: RerouteEvidenceV2Input): RerouteEvidenceV2 {
  const thresholdM = RerouteService.getDynamicOffRouteThresholdMeters(input.gpsAccuracyM ?? 0);
  return {
    thresholdM,
    shouldReroute: RerouteService.shouldTriggerReroute({
      consecutiveOffRouteCount: input.consecutiveOffRouteCount,
      offRouteDurationMs: input.offRouteDurationMs,
      cooldownRemainingMs: input.cooldownRemainingMs,
      movedDistanceSinceLastAcceptedM: input.movedDistanceSinceLastAcceptedM,
    }),
  };
}

export function keepCurrentRouteAfterRerouteFailureV2(route: V2ActiveRoute): {
  route: V2ActiveRoute;
  message: string;
} {
  return {
    route,
    message: 'Could not find a better route. Continuing current route.',
  };
}

export function destinationToRoutingV2(route: V2ActiveRoute): RoutingDestinationV2 {
  if (route.destination.type === 'gate' && route.destination.gateId) {
    return { type: 'gate', gateId: route.destination.gateId };
  }
  if (route.destination.type === 'rasta') {
    return { type: 'rasta', rastaId: route.destination.rastaId ?? route.destination.entryNodeId?.split('-')[0] ?? '' };
  }
  return { type: 'block', blockId: route.destination.blockId ?? '' };
}

export function buildV2RerouteRequest(input: {
  route: V2ActiveRoute;
  coordinate: Coordinate;
  walkingSpeedMs: number;
  forceOutside?: boolean;
}): {
  start: RoutingStartV2;
  destination: RoutingDestinationV2;
  walkingSpeedMs: number;
} {
  const isOutside = input.forceOutside || !EntryGateRoutingService.isInsideIjtemaArea(input.coordinate);
  return {
    start: isOutside
      ? { type: 'outside_coordinate', coordinate: input.coordinate }
      : { type: 'inside_coordinate', coordinate: input.coordinate },
    destination: destinationToRoutingV2(input.route),
    walkingSpeedMs: input.walkingSpeedMs,
  };
}

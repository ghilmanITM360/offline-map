/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { NavigationInstruction, Place } from '../models/types';
import type {
  OutsideGateRouteTarget,
  OutsideRouteCandidateSource,
  OutsideRouteRequestToken,
} from '../models/outsideRouting';
import { MapFeatureFlagsService } from './MapFeatureFlagsService';
import { assertCompleteCandidateSet } from './outsideRouting/OutsideRouteValidation';
import {
  RoutePreviewV2,
  RoutingDestinationV2,
  RoutingServiceV2,
  RoutingStartV2,
} from './RoutingServiceV2';

export type V2DirectionsPreviewStatus = 'ready' | 'disabled' | 'unavailable';

export interface V2DirectionsPreviewRequest {
  startPlace: Place | null;
  destination: Place;
  currentLocation: Place['coordinate'] | null;
  walkingSpeedMs?: number;
  forceOutside?: boolean;
  manualGateId?: string;
}

export interface V2DirectionsPreviewResult {
  status: V2DirectionsPreviewStatus;
  route: RoutePreviewV2 | null;
  instructions: NavigationInstruction[];
  message: string;
}

export interface V2HybridDirectionsPreviewInput {
  request: V2DirectionsPreviewRequest;
  token: OutsideRouteRequestToken;
  signal: AbortSignal;
  outsideProvider: OutsideRouteCandidateSource;
}

function routeMessageForUnavailablePlace(place: Place): string {
  if (place.routingStatus === 'missing_coordinate') {
    if (place.category === 'Gate') return 'This gate has no verified location yet.';
    return 'Destination entry point is not verified yet.';
  }
  if (place.routingStatus === 'needs_connector_verification') {
    if (place.category === 'Gate') return 'This gate is not ready for navigation. Please choose another nearby gate.';
    return 'This place is not connected to the walking route yet.';
  }
  if (place.routingStatus === 'visual_only') return 'This place is not connected to the walking route yet.';
  return place.unavailableReason ?? 'No safe offline route found between these points.';
}

export function destinationFromPlace(place: Place): RoutingDestinationV2 | null {
  if (place.category === 'Block') return { type: 'block', blockId: place.id };
  if (place.category === 'Gate') return { type: 'gate', gateId: place.id };
  if (place.category === 'Rasta') return { type: 'rasta', rastaId: place.id };
  if (place.category === 'SpecialRoute') return { type: 'special_route', routeId: place.id };
  return null;
}

function startFromPlace(place: Place): RoutingStartV2 | null {
  if (place.category === 'Block') return { type: 'block', blockId: place.id };
  if (place.category === 'Gate') return { type: 'gate', gateId: place.id };
  if (place.category === 'Rasta') return { type: 'rasta', rastaId: place.id };
  if (place.category === 'SpecialRoute') return { type: 'special_route', routeId: place.id };
  return null;
}

export class V2DirectionsService {
  /**
   * Additive async seam for hybrid outside providers. Core supplies approved gates and
   * remains sole complete-journey selector; provider layer supplies per-gate outside routes.
   * Existing synchronous preview stays unchanged until Claude-owned core exposes this seam.
   */
  static async calculateHybridPreview(input: V2HybridDirectionsPreviewInput): Promise<V2DirectionsPreviewResult> {
    const { request } = input;
    if (!MapFeatureFlagsService.useIjtemaV2Routing()) {
      return {
        status: 'disabled',
        route: null,
        instructions: [],
        message: 'V2 routing preview is disabled by feature flag.',
      };
    }
    const destination = destinationFromPlace(request.destination);
    if (!destination || !request.currentLocation || !request.forceOutside) {
      return {
        status: 'unavailable',
        route: null,
        instructions: [],
        message: 'Hybrid outside routing requires an outside coordinate and routable v2 destination.',
      };
    }
    if (input.signal.aborted) {
      return { status: 'unavailable', route: null, instructions: [], message: 'Outside route request was cancelled.' };
    }

    const plan = RoutingServiceV2.prepareOutsideRoutingPlan({
      userCoordinate: request.currentLocation,
      destination,
      manualGateId: request.manualGateId,
      walkingSpeedMs: request.walkingSpeedMs,
    });
    if (!plan || plan.candidates.length === 0) {
      return {
        status: 'unavailable',
        route: null,
        instructions: [],
        message: 'No eligible official gate is available for outside routing.',
      };
    }

    const providerGateTargets: OutsideGateRouteTarget[] = plan.candidates.map((candidate) => ({
      gateId: candidate.gateId,
      gateCoordinate: candidate.providerRouteTargetCoordinate,
      routeTargetCoordinate: candidate.providerRouteTargetCoordinate,
    }));
    const outsideRequest = {
      token: input.token,
      origin: plan.userCoordinate,
      gates: providerGateTargets,
      signal: input.signal,
    };
    const attempt = await input.outsideProvider.routeToGates(outsideRequest);
    if (attempt.status === 'failure') {
      return {
        status: 'unavailable',
        route: null,
        instructions: [],
        message: attempt.failure.code === 'cancelled'
          ? 'Outside route request was cancelled.'
          : 'Road routing is unavailable for this request.',
      };
    }
    try {
      assertCompleteCandidateSet(outsideRequest, attempt.candidateSet);
    } catch {
      return {
        status: 'unavailable',
        route: null,
        instructions: [],
        message: 'Outside route provider returned an invalid candidate set.',
      };
    }
    if (input.signal.aborted) {
      return { status: 'unavailable', route: null, instructions: [], message: 'Outside route request was cancelled.' };
    }

    const finalized = RoutingServiceV2.finalizeOutsideRoutingPlan({
      plan,
      outsideCandidates: attempt.candidateSet,
      walkingSpeedMs: request.walkingSpeedMs ?? plan.walkingSpeedMs,
    });
    const selectedGateId = finalized?.startResolution?.gate?.id;
    const selectedCandidateId = finalized?.selectedOutsideCandidateId;
    if (!finalized || !selectedGateId || !selectedCandidateId) {
      return {
        status: 'unavailable',
        route: null,
        instructions: [],
        message: 'No complete outside-to-inside route is available.',
      };
    }
    const selectedOutcome = attempt.candidateSet.outcomes.find(
      (outcome) => outcome.gateId === selectedGateId && outcome.status === 'routed',
    );
    const selectedOutsideRoute = selectedOutcome?.status === 'routed'
      ? selectedOutcome.routes.find((candidate) => candidate.candidateId === selectedCandidateId)
      : undefined;
    if (
      !selectedOutsideRoute ||
      selectedOutsideRoute.gateId !== selectedGateId ||
      selectedOutsideRoute.requestId !== input.token.requestId ||
      selectedOutsideRoute.requestVersion !== input.token.requestVersion
    ) {
      return {
        status: 'unavailable',
        route: null,
        instructions: [],
        message: 'Core-selected gate has no matching outside provider route.',
      };
    }
    const hybridRoute: RoutePreviewV2 = { ...finalized, outsideRoute: selectedOutsideRoute };
    return {
      status: 'ready',
      route: hybridRoute,
      instructions: hybridRoute.instructions,
      message: '',
    };
  }

  static calculatePreview(request: V2DirectionsPreviewRequest): V2DirectionsPreviewResult {
    if (!MapFeatureFlagsService.useIjtemaV2Routing()) {
      return {
        status: 'disabled',
        route: null,
        instructions: [],
        message: 'V2 routing preview is disabled by feature flag.',
      };
    }

    const destination = destinationFromPlace(request.destination);
    if (!destination) {
      return {
        status: 'unavailable',
        route: null,
        instructions: [],
        message: `${request.destination.name} is visual-only in this phase and is not routable yet.`,
      };
    }

    if (request.destination.isRoutable === false) {
      return {
        status: 'unavailable',
        route: null,
        instructions: [],
        message: routeMessageForUnavailablePlace(request.destination),
      };
    }

    let start: RoutingStartV2 | null = null;
    if (request.startPlace) {
      if (request.startPlace.isStartRoutable === false || request.startPlace.isRoutable === false) {
        return {
          status: 'unavailable',
          route: null,
          instructions: [],
          message: routeMessageForUnavailablePlace(request.startPlace),
        };
      }
      start = startFromPlace(request.startPlace);
    } else if (request.currentLocation) {
      start = request.forceOutside
        ? { type: 'outside_coordinate', coordinate: request.currentLocation }
        : { type: 'inside_coordinate', coordinate: request.currentLocation };
    }

    if (!start) {
      return {
        status: 'unavailable',
        route: null,
        instructions: [],
        message: 'Choose a routable start point to calculate directions.',
      };
    }

    const route = RoutingServiceV2.calculateRoute({
      start,
      destination,
      walkingSpeedMs: request.walkingSpeedMs,
    });

    if (!route) {
      return {
        status: 'unavailable',
        route: null,
        instructions: [],
        message: 'No safe offline route found between these points.',
      };
    }

    return {
      status: 'ready',
      route,
      instructions: route.instructions,
      message: '',
    };
  }
}

import type { MessageKey } from '../i18n/messages';
import type { TParams } from '../i18n/translate';
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { t } from '../i18n/translate';
import { localizeVenueName } from '../i18n/venueNames';
import { IJTEMA_DATA, LANDMARK_NEAREST_NODE, LANDMARK_PLACES } from '../constants/data';
import { findNearestGraphNode, IJTEMA_NAVIGATION_GRAPH_V2 } from '../data/ijtema';
import { NavigationInstruction, Place } from '../models/types';
import type {
  NormalizedOutsideCandidate,
  OutsideGateRouteTarget,
  OutsideRouteCandidateSource,
  OutsideRouteRequestToken,
  OutsideWalkingManeuver,
} from '../models/outsideRouting';
import { IJTEMA_GATES } from '../data/ijtema';
import { MapFeatureFlagsService } from './MapFeatureFlagsService';
import { assertCompleteCandidateSet } from './outsideRouting/OutsideRouteValidation';
import { CHOOSE_START, NAVIGATION_UNAVAILABLE, ROUTE_NOT_FOUND } from '../utils/routeCopy';
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
  messageDescriptor?: { key: MessageKey; params?: TParams };
}

export interface V2HybridDirectionsPreviewInput {
  request: V2DirectionsPreviewRequest;
  token: OutsideRouteRequestToken;
  signal: AbortSignal;
  outsideProvider: OutsideRouteCandidateSource;
}

function routeMessageForUnavailablePlace(place: Place): string {
  if (place.routingStatus === 'missing_coordinate') {
    if (place.category === 'Gate') return t('navigation.gateNotReady');
    return t('navigation.placeNotReady');
  }
  if (place.routingStatus === 'needs_connector_verification') {
    if (place.category === 'Gate') return t('journeyCopy.gateUnavailable');
    return t('navigation.placeNotReady');
  }
  if (place.routingStatus === 'visual_only') return t('navigation.placeNotReady');
  return place.unavailableReason ?? ROUTE_NOT_FOUND();
}

export function destinationFromPlace(place: Place): RoutingDestinationV2 | null {
  if (place.sourceVersion === 'v2') {
    if (place.category === 'Block') return { type: 'block', blockId: place.id };
    if (place.category === 'Gate') return { type: 'gate', gateId: place.id };
    if (place.category === 'Rasta') return { type: 'rasta', rastaId: place.id };
    if (place.category === 'SpecialRoute') return { type: 'special_route', routeId: place.id };
    return null;
  }

  if (!['Masjid', 'Landmark', 'Terminal', 'Help'].includes(place.category)) return null;
  const canonicalFacility = LANDMARK_PLACES.find(
    (candidate) => candidate.id === place.id && (candidate.category === 'Masjid' || candidate.category === 'Landmark'),
  );
  const mappedNodeId = canonicalFacility ? LANDMARK_NEAREST_NODE[canonicalFacility.id] : undefined;
  if (!canonicalFacility || !mappedNodeId) return null;

  const mappedV2Node = IJTEMA_NAVIGATION_GRAPH_V2.nodes[mappedNodeId];
  const mappedNodeConnected = mappedV2Node && IJTEMA_NAVIGATION_GRAPH_V2.adjacency[mappedNodeId]?.length > 0;
  let nodeId = mappedNodeConnected ? mappedNodeId : null;
  if (!nodeId) {
    const mappedLegacyNode = IJTEMA_DATA.nodes[mappedNodeId];
    if (!mappedLegacyNode) return null;
    const nearest = findNearestGraphNode(
      { lat: mappedLegacyNode.lat, lng: mappedLegacyNode.lng },
      IJTEMA_NAVIGATION_GRAPH_V2.nodes,
    );
    if (!nearest || !IJTEMA_NAVIGATION_GRAPH_V2.adjacency[nearest.node.id]?.length) return null;
    nodeId = nearest.node.id;
  }

  return { type: 'facility', facilityId: canonicalFacility.id, nodeId, label: place.name };
}

function startFromPlace(place: Place): RoutingStartV2 | null {
  const destination = destinationFromPlace(place);
  return destination?.type === 'facility' ? null : destination;
}

function instructionType(maneuver: OutsideWalkingManeuver): NavigationInstruction['type'] {
  if (maneuver === 'turn-left' || maneuver === 'slight-left' || maneuver === 'u-turn') return 'left';
  if (maneuver === 'turn-right' || maneuver === 'slight-right') return 'right';
  if (maneuver === 'arrive') return 'arrival';
  return 'straight';
}

function composeOutsideInstructions(
  route: NormalizedOutsideCandidate,
  coreInstructions: NavigationInstruction[],
): NavigationInstruction[] {
  const internalInstructions = coreInstructions.filter((instruction) => instruction.id !== 'v2-outside-approach');
  if (route.provider === 'direct-guide') {
    const gate = IJTEMA_GATES.find((candidate) => candidate.id === route.gateId);
    const gateLabelEn = gate?.name.en ?? route.gateId.replace('GATE_', 'Gate ');
    const gateLabelUr = gate?.name.ur ?? gateLabelEn;
    return [{
      id: 'outside-direct-guide',
      semantic: { key: 'instructions.direct', params: { name: gateLabelEn }, urduNames: { name: gateLabelUr } },
      text: `Walk toward ${gateLabelEn}.`,
      urduText: `دکھائی گئی سیدھی سمت میں ${gateLabelUr} کی طرف جائیں۔`,
      distance: route.distanceM,
      type: 'straight',
      coordinate: route.coordinates[0],
    }, ...internalInstructions];
  }
  if (route.steps.length === 0) return coreInstructions;
  return [
    ...route.steps.map((step): NavigationInstruction => ({
      id: `outside-${step.id}`,
      text: step.instruction,
      semantic: step.semantic,
      distance: step.distanceM,
      type: instructionType(step.maneuver),
      coordinate: step.coordinate,
      roadName: step.roadName,
    })),
    ...internalInstructions,
  ];
}

export class V2DirectionsService {
  /**
   * Production async seam for hybrid outside providers. Core supplies approved gates and
   * remains sole complete-journey selector; provider layer supplies per-gate outside routes.
   * Inside-only routing keeps the existing synchronous preview path.
   */
  static async calculateHybridPreview(input: V2HybridDirectionsPreviewInput): Promise<V2DirectionsPreviewResult> {
    const { request } = input;
    if (!MapFeatureFlagsService.useIjtemaV2Routing()) {
      return {
        status: 'disabled',
        route: null,
        instructions: [],
        message: NAVIGATION_UNAVAILABLE(),
      };
    }
    const destination = destinationFromPlace(request.destination);
    if (!destination || !request.currentLocation || !request.forceOutside) {
      return {
        status: 'unavailable',
        route: null,
        instructions: [],
        message: ROUTE_NOT_FOUND(),
      };
    }
    if (input.signal.aborted) {
      return { status: 'unavailable', route: null, instructions: [], message: ROUTE_NOT_FOUND() };
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
        message: ROUTE_NOT_FOUND(),
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
          ? t('navigation.cancelled')
          : t('navigation.roadUnavailable'),
      };
    }
    try {
      assertCompleteCandidateSet(outsideRequest, attempt.candidateSet);
    } catch {
      return {
        status: 'unavailable',
        route: null,
        instructions: [],
        message: ROUTE_NOT_FOUND(),
      };
    }
    if (input.signal.aborted) {
      return { status: 'unavailable', route: null, instructions: [], message: ROUTE_NOT_FOUND() };
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
        message: ROUTE_NOT_FOUND(),
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
        message: ROUTE_NOT_FOUND(),
      };
    }
    const instructions = composeOutsideInstructions(selectedOutsideRoute, finalized.instructions);
    const hybridRoute: RoutePreviewV2 = { ...finalized, instructions, outsideRoute: selectedOutsideRoute };
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
        message: NAVIGATION_UNAVAILABLE(),
      };
    }

    const destination = destinationFromPlace(request.destination);
    if (!destination) {
      return {
        status: 'unavailable',
        route: null,
        instructions: [],
        message: t('navigation.placeDirectionsNotReady', {name: localizeVenueName(request.destination.name)}),
        messageDescriptor: { key: 'navigation.placeDirectionsNotReady', params: { name: request.destination.name } },
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
        message: CHOOSE_START(),
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
        message: ROUTE_NOT_FOUND(),
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

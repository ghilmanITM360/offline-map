/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { NavigationInstruction, Place } from '../models/types';
import { MapFeatureFlagsService } from './MapFeatureFlagsService';
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
}

export interface V2DirectionsPreviewResult {
  status: V2DirectionsPreviewStatus;
  route: RoutePreviewV2 | null;
  instructions: NavigationInstruction[];
  message: string;
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

function destinationFromPlace(place: Place): RoutingDestinationV2 | null {
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

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { getDistance } from 'geolib';
import {
  IJTEMA_NAVIGATION_GRAPH_V2,
} from '../data/ijtema';
import {
  Coordinate,
  Place,
  V2ActiveRoute,
  V2NavigationInstruction,
} from '../models/types';
import { MapFeatureFlagsService } from './MapFeatureFlagsService';
import { RoutePreviewV2 } from './RoutingServiceV2';
import { destinationFromPlace } from './V2DirectionsService';
import { V2PlaceAdapter } from './V2PlaceAdapter';

export interface V2NavigationAdapterInput {
  previewRoute: RoutePreviewV2;
  destination: Place;
  startPlace?: Place | null;
  currentLocation?: Coordinate | null;
}

export interface V2NavigationStartCheckInput {
  route: RoutePreviewV2 | null;
  destination: Place | null;
}

export interface V2NavigationStartCheck {
  canStart: boolean;
  message: string;
}

const RAW_ID_PATTERN = /\b(?:P\d+|S\d+|T\d+|C\d+|R\d+-\d+|SPNP-\d+|SPSP-\d+|SPWP-\d+|B\d+_C\d+)\b/;
const GATE_CONNECTOR_VERIFICATION_MESSAGE = 'This gate needs connector verification before navigation.';

function nodeCoordinate(nodeId: string): Coordinate | null {
  const node = IJTEMA_NAVIGATION_GRAPH_V2.nodes[nodeId];
  if (!node) return null;
  return {
    latitude: node.coordinate.lat,
    longitude: node.coordinate.lng,
  };
}

function edgeForHop(from: string, to: string) {
  return IJTEMA_NAVIGATION_GRAPH_V2.adjacency[from]?.find((edge) => edge.to === to);
}

function destinationMetadata(
  destination: Place,
  previewRoute: RoutePreviewV2,
): V2ActiveRoute['destination'] {
  const routingDestination = destinationFromPlace(destination);
  if (!routingDestination) throw new Error('V2 active route requires a routable V2 destination.');
  const type = routingDestination.type;
  const finalNodeId = previewRoute.destinationEntryNodeId ?? previewRoute.nodes[previewRoute.nodes.length - 1];
  const coordinate =
    nodeCoordinate(finalNodeId) ??
    V2PlaceAdapter.getMarkerCoordinate(destination) ??
    previewRoute.coordinates[previewRoute.coordinates.length - 1];

  return {
    coordinate,
    label: destination.name,
    type,
    blockId: type === 'block' ? destination.id : undefined,
    gateId: type === 'gate' ? destination.id : undefined,
    rastaId: type === 'rasta' ? destination.id : undefined,
    facilityId: type === 'facility' ? routingDestination.facilityId : undefined,
    entryNodeId: type === 'block' || type === 'facility' ? finalNodeId : undefined,
    specialRouteId: type === 'special_route' ? destination.id : undefined,
  };
}

function originMetadata(input: V2NavigationAdapterInput): V2ActiveRoute['origin'] {
  const resolution = input.previewRoute.startResolution;
  const gateId = resolution?.gate?.id ?? (input.startPlace?.category === 'Gate' ? input.startPlace.id : undefined);
  const gateCoordinate = resolution?.gate?.coordinate ? V2PlaceAdapter.toCoordinate(resolution.gate.coordinate) : null;

  if (resolution?.startType === 'nearest_official_gate' || resolution?.startType === 'selected_official_gate') {
    return {
      coordinate: gateCoordinate ?? resolution.coordinate,
      label: resolution.gate?.name.en ?? input.previewRoute.startLabel,
      type: 'official_gate',
      gateId,
    };
  }

  if (input.startPlace) {
    return {
      coordinate: input.startPlace.category === 'Gate'
        ? V2PlaceAdapter.getMarkerCoordinate(input.startPlace) ?? input.previewRoute.coordinates[0]
        : input.previewRoute.coordinates[0],
      label: input.startPlace.name,
      type: input.startPlace.category === 'Gate' ? 'official_gate' : 'manual_place',
      gateId,
    };
  }

  return {
    coordinate: resolution?.coordinate ?? input.currentLocation ?? input.previewRoute.coordinates[0],
    label: input.previewRoute.startLabel,
    type: 'inside_snap',
  };
}

// Nearest-coordinate search, scanning forward from `searchFrom` to keep the
// mapping monotonic (a route can pass close to an earlier point again, e.g.
// near a junction — we must never resolve routeIndex backward).
function nearestCoordinateIndex(coordinates: Coordinate[], target: Coordinate, searchFrom: number): number {
  let bestIndex = searchFrom;
  let bestDistance = Infinity;
  for (let i = searchFrom; i < coordinates.length; i += 1) {
    const distance = getDistance(coordinates[i], target);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = i;
    }
  }
  return bestIndex;
}

function activeInstructions(previewRoute: RoutePreviewV2): V2NavigationInstruction[] {
  let searchFrom = 0;
  return previewRoute.instructions.map((instruction, index) => {
    const developerNode = previewRoute.nodes[Math.min(index, previewRoute.nodes.length - 1)] ?? previewRoute.nodes[0];
    // routeIndex must point at instruction.coordinate's actual position in
    // previewRoute.coordinates — the instructions array and coordinates array
    // have different lengths/pacing (one instruction per turn vs. one entry
    // per rendering point), so the instruction's own array position is not a
    // usable index into coordinates.
    const routeIndex = nearestCoordinateIndex(previewRoute.coordinates, instruction.coordinate, searchFrom);
    searchFrom = routeIndex;
    return {
      ...instruction,
      text: instruction.text.replace(RAW_ID_PATTERN, 'route point'),
      distanceM: instruction.distance,
      routeIndex,
      spokenText: instruction.text.replace(RAW_ID_PATTERN, 'route point'),
      developerLabel: developerNode,
    };
  });
}

export function isV2ActiveRoute(route: unknown): route is V2ActiveRoute {
  return Boolean(route && typeof route === 'object' && (route as V2ActiveRoute).sourceVersion === 'v2');
}

export class V2NavigationAdapter {
  static canStartActiveNavigation(input: V2NavigationStartCheckInput): V2NavigationStartCheck {
    if (!MapFeatureFlagsService.useIjtemaV2Map()) {
      return {
        canStart: false,
        message: 'V2 active navigation requires EXPO_PUBLIC_USE_IJTEMA_V2_MAP=true.',
      };
    }

    if (!MapFeatureFlagsService.useIjtemaV2Routing()) {
      return {
        canStart: false,
        message: 'V2 active navigation requires EXPO_PUBLIC_USE_IJTEMA_V2_ROUTING=true.',
      };
    }

    if (!MapFeatureFlagsService.useIjtemaV2Navigation()) {
      return {
        canStart: false,
        message: 'V2 active navigation is disabled by feature flag.',
      };
    }

    if (!input.destination || !destinationFromPlace(input.destination)) {
      return {
        canStart: false,
        message: 'Choose a destination available for V2 navigation.',
      };
    }

    if (input.destination.isRoutable === false) {
      if (input.destination.category === 'Gate' && input.destination.routingStatus === 'needs_connector_verification') {
        return {
          canStart: false,
          message: GATE_CONNECTOR_VERIFICATION_MESSAGE,
        };
      }
      return {
        canStart: false,
        message: input.destination.unavailableReason ?? `${input.destination.name} is not available for navigation yet.`,
      };
    }

    if (!input.route || input.route.coordinates.length < 2 || input.route.totalDistance <= 0) {
      return {
        canStart: false,
        message: 'Calculate a valid v2 route before starting navigation.',
      };
    }

    return {
      canStart: true,
      message: '',
    };
  }

  static fromPreview(input: V2NavigationAdapterInput): V2ActiveRoute {
    if (!destinationFromPlace(input.destination)) {
      throw new Error('V2 active route requires a routable V2 destination.');
    }

    if (input.previewRoute.coordinates.length < 2 || input.previewRoute.totalDistance <= 0) {
      throw new Error('V2 active route requires a valid route preview.');
    }

    const edges = input.previewRoute.nodes.slice(0, -1).map((from, index) => {
      const to = input.previewRoute.nodes[index + 1];
      const edge = edgeForHop(from, to);
      return {
        from,
        to,
        distanceM: edge?.distanceM ?? input.previewRoute.segments[index]?.distance ?? 0,
        pathType: edge?.pathType ?? (input.previewRoute.segments[index]?.isRasta ? 'rasta' : 'connector'),
        label: edge?.name.en ?? input.previewRoute.segments[index]?.name ?? 'Ijtema route',
      };
    });

    const origin = originMetadata(input);
    const destination = destinationMetadata(input.destination, input.previewRoute);
    const startedOutside = input.previewRoute.startResolution?.mode === 'outside';
    const entryGateId = input.previewRoute.startResolution?.gate?.id;

    return {
      ...input.previewRoute,
      sourceVersion: 'v2',
      routeId: input.previewRoute.id,
      origin,
      destination,
      edges,
      totalDistanceM: input.previewRoute.totalDistance,
      etaMinutes: input.previewRoute.estimatedTimeMin,
      instructions: activeInstructions(input.previewRoute),
      metadata: {
        startedOutside,
        entryGateId,
        usesOfficialGateEntry: Boolean(entryGateId),
        graphVersion: IJTEMA_NAVIGATION_GRAPH_V2.metadata.version,
      },
    };
  }
}

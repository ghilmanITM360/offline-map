/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  IJTEMA_BLOCKS,
  Gate,
  IJTEMA_GATES,
  IJTEMA_NAVIGATION_GRAPH_V2,
  IJTEMA_RASTAS,
  IJTEMA_SPECIAL_ROUTES,
  distanceMeters,
  findNearestGraphNode,
} from '../data/ijtema';
import { Coordinate as V2Coordinate } from '../data/ijtema/types';
import { Coordinate as AppCoordinate } from '../models/types';
import { t, venueName } from './serviceI18n';

export type RouteStartModeV2 = 'inside' | 'outside';
export type RouteStartTypeV2 = 'internal_snap' | 'nearest_official_gate' | 'selected_official_gate' | 'unresolved';

export interface RouteStartResolutionV2 {
  mode: RouteStartModeV2;
  startType: RouteStartTypeV2;
  coordinate: AppCoordinate;
  candidateNodes: string[];
  gate?: Gate;
  error?: string;
}

export interface VenueStatusV2 {
  insideVenue: boolean;
  insideBlock: string | null;
}

export interface ResolveRouteStartOptionsV2 {
  manualGateId?: string;
  forceOutside?: boolean;
  previousNodeId?: string;
}

const toV2Coordinate = (coordinate: AppCoordinate | V2Coordinate): V2Coordinate =>
  'latitude' in coordinate
    ? {
        lat: coordinate.latitude,
        lng: coordinate.longitude,
      }
    : coordinate;

const toAppCoordinate = (coordinate: V2Coordinate): AppCoordinate => ({
  latitude: coordinate.lat,
  longitude: coordinate.lng,
});

// Coordinate-completeness only — a gate can satisfy this and still be unusable as an
// outside start (e.g. GATE_18/19, which have coordinates but no verified connector). Kept
// separate from isGateRoutable so callers can report *why* a gate is unusable accurately
// instead of always blaming a "missing coordinate" that may not be the real reason.
const hasGateCoordinate = (gate: Gate | undefined): gate is Gate & { coordinate: V2Coordinate } =>
  Boolean(gate && gate.coordinate && gate.routingStatus === 'routable');

const isGateRoutable = (gate: Gate | undefined): gate is Gate & { coordinate: V2Coordinate } =>
  hasGateCoordinate(gate) && Boolean(gate.canStartRouteFromOutside);

const hasGateGraphConnection = (gate: Gate | undefined): boolean =>
  isGateRoutable(gate) && Boolean(IJTEMA_NAVIGATION_GRAPH_V2.nodes[gate.id] && IJTEMA_NAVIGATION_GRAPH_V2.adjacency[gate.id]?.length > 0);

const INTERNAL_PATH_BUFFER_METERS = 35;

const isPointInPolygon = (point: V2Coordinate, polygon: V2Coordinate[]): boolean => {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const current = polygon[i];
    const previous = polygon[j];
    const intersects =
      current.lng > point.lng !== previous.lng > point.lng &&
      point.lat < ((previous.lat - current.lat) * (point.lng - current.lng)) / (previous.lng - current.lng) + current.lat;
    if (intersects) inside = !inside;
  }
  return inside;
};

const distanceToSegmentMeters = (point: V2Coordinate, start: V2Coordinate, end: V2Coordinate): number => {
  const latMeters = 111_320;
  const lngMeters = 111_320 * Math.cos((point.lat * Math.PI) / 180);
  const px = point.lng * lngMeters;
  const py = point.lat * latMeters;
  const sx = start.lng * lngMeters;
  const sy = start.lat * latMeters;
  const ex = end.lng * lngMeters;
  const ey = end.lat * latMeters;
  const dx = ex - sx;
  const dy = ey - sy;
  const lengthSquared = dx * dx + dy * dy;

  if (lengthSquared === 0) return distanceMeters(point, start);

  const t = Math.max(0, Math.min(1, ((px - sx) * dx + (py - sy) * dy) / lengthSquared));
  const projected: V2Coordinate = {
    lat: (sy + t * dy) / latMeters,
    lng: (sx + t * dx) / lngMeters,
  };
  return distanceMeters(point, projected);
};

const isNearPolyline = (point: V2Coordinate, polyline: V2Coordinate[], bufferMeters: number): boolean => {
  if (polyline.some((coordinate) => distanceMeters(point, coordinate) <= bufferMeters)) return true;
  for (let index = 0; index < polyline.length - 1; index += 1) {
    if (distanceToSegmentMeters(point, polyline[index], polyline[index + 1]) <= bufferMeters) return true;
  }
  return false;
};

const isInsideInternalIjtemaArea = (coordinate: AppCoordinate | V2Coordinate): boolean => {
  const point = toV2Coordinate(coordinate);
  // Inside classification uses precise geometry only — NOT the broad rectangular
  // map bounds. Using the bounds rectangle would incorrectly classify outside-venue
  // users (e.g. near Gate 20 approach roads) as "inside" and skip gate entry routing.
  if (IJTEMA_BLOCKS.some((block) => isPointInPolygon(point, block.polygon))) return true;
  if (IJTEMA_RASTAS.some((rasta) => isNearPolyline(point, rasta.points.map((pathPoint) => pathPoint.coordinate), INTERNAL_PATH_BUFFER_METERS))) {
    return true;
  }
  return IJTEMA_SPECIAL_ROUTES.some((route) =>
    isNearPolyline(point, route.points.map((pathPoint) => pathPoint.coordinate), INTERNAL_PATH_BUFFER_METERS),
  );
};

export class EntryGateRoutingService {
  static isInsideIjtemaArea(coordinate: AppCoordinate | V2Coordinate): boolean {
    return isInsideInternalIjtemaArea(coordinate);
  }

  static findContainingBlockId(coordinate: AppCoordinate | V2Coordinate): string | null {
    const point = toV2Coordinate(coordinate);
    return IJTEMA_BLOCKS.find((block) => isPointInPolygon(point, block.polygon))?.id ?? null;
  }

  static getVenueStatus(coordinate: AppCoordinate | V2Coordinate): VenueStatusV2 {
    return {
      insideVenue: this.isInsideIjtemaArea(coordinate),
      insideBlock: this.findContainingBlockId(coordinate),
    };
  }

  static findNearestOfficialEntryGateForOutsideUser(coordinate: AppCoordinate | V2Coordinate): Gate | undefined {
    const point = toV2Coordinate(coordinate);
    let nearestGate: Gate | undefined;
    let nearestDistance = Infinity;

    for (const gate of IJTEMA_GATES) {
      if (!isGateRoutable(gate) || !hasGateGraphConnection(gate)) continue;
      const distance = distanceMeters(point, gate.coordinate);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestGate = gate;
      }
    }

    return nearestGate;
  }

  static resolveRouteStartForUser(
    coordinate: AppCoordinate | V2Coordinate,
    options: ResolveRouteStartOptionsV2 = {},
  ): RouteStartResolutionV2 {
    const appCoordinate = 'latitude' in coordinate ? coordinate : toAppCoordinate(coordinate);
    const v2Coordinate = toV2Coordinate(coordinate);
    const mode: RouteStartModeV2 = options.forceOutside ? 'outside' : this.isInsideIjtemaArea(coordinate) ? 'inside' : 'outside';

    if (options.manualGateId) {
      const gate = IJTEMA_GATES.find((item) => item.id === options.manualGateId);
      if (!hasGateCoordinate(gate)) {
        return {
          mode,
          startType: 'unresolved',
          coordinate: appCoordinate,
          candidateNodes: [],
          gate,
          error: t('navigation.gateNotRoutable', { gate: venueName(gate?.name ?? { en: options.manualGateId }) }),
        };
      }

      if (!isGateRoutable(gate) || !hasGateGraphConnection(gate)) {
        return {
          mode,
          startType: 'unresolved',
          coordinate: appCoordinate,
          candidateNodes: [],
          gate,
          error: t('navigation.gateNotConnected', { gate: venueName(gate.name) }),
        };
      }

      return {
        mode,
        startType: 'selected_official_gate',
        coordinate: toAppCoordinate(gate.coordinate),
        candidateNodes: [gate.id],
        gate,
      };
    }

    if (mode === 'outside') {
      // Real outside-venue routing goes through RoutingServiceV2.selectOutsidePath
      // directly (a heap-based multi-source A* that's already gatePenaltyM-aware),
      // bypassing this resolver entirely — this is nearest-gate-by-distance only,
      // used for preview-without-destination calls (e.g. the outside-venue banner).
      const gate = this.findNearestOfficialEntryGateForOutsideUser(v2Coordinate);

      if (!isGateRoutable(gate) || !hasGateGraphConnection(gate)) {
        return {
          mode: 'outside',
          startType: 'unresolved',
          coordinate: appCoordinate,
          candidateNodes: [],
          error: t('navigation.noEntryGate'),
        };
      }

      return {
        mode: 'outside',
        startType: 'nearest_official_gate',
        coordinate: toAppCoordinate(gate.coordinate),
        candidateNodes: [gate.id],
        gate,
      };
    }

    const nearest = findNearestGraphNode(v2Coordinate, IJTEMA_NAVIGATION_GRAPH_V2.nodes, [
      'rasta_point',
      'special_route_point',
      'central_point',
    ], options.previousNodeId);

    if (!nearest) {
      return {
        mode: 'inside',
        startType: 'unresolved',
        coordinate: appCoordinate,
        candidateNodes: [],
        error: t('navigation.noGraphNode'),
      };
    }

    return {
      mode: 'inside',
      startType: 'internal_snap',
      coordinate: toAppCoordinate(nearest.node.coordinate),
      candidateNodes: [nearest.node.id],
    };
  }
}

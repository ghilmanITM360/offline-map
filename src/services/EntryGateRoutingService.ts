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
import { GraphEdge } from '../data/ijtema/graphTypes';
import { Coordinate as V2Coordinate } from '../data/ijtema/types';
import { Coordinate as AppCoordinate } from '../models/types';

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
  /**
   * Destination graph node IDs used for total-cost gate selection.
   * When provided, the entry gate is chosen to minimise
   * haversine(user→gate) + internal_graph_route(gate→destination).
   * When omitted, falls back to nearest-gate selection.
   */
  destinationNodeIds?: string[];
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

const isGateRoutable = (gate: Gate | undefined): gate is Gate & { coordinate: V2Coordinate } =>
  Boolean(gate && gate.coordinate && gate.routingStatus === 'routable' && gate.canStartRouteFromOutside);

const hasGateGraphConnection = (gate: Gate | undefined): boolean =>
  isGateRoutable(gate) && Boolean(IJTEMA_NAVIGATION_GRAPH_V2.nodes[gate.id] && IJTEMA_NAVIGATION_GRAPH_V2.adjacency[gate.id]?.length > 0);

const INTERNAL_PATH_BUFFER_METERS = 35;

/**
 * Returns the weighted shortest-path distance (metres) from startNodeId to
 * destinationNodeId using the V2 navigation graph, or undefined if unreachable.
 * Used internally by findBestGateForOutsideUser to evaluate total route cost
 * per candidate gate without exposing Dijkstra logic to callers.
 */
const dijkstraCost = (startNodeId: string, destinationNodeId: string): number | undefined => {
  if (startNodeId === destinationNodeId) return 0;
  if (!IJTEMA_NAVIGATION_GRAPH_V2.nodes[startNodeId] || !IJTEMA_NAVIGATION_GRAPH_V2.nodes[destinationNodeId]) return undefined;

  const distances: Record<string, number> = { [startNodeId]: 0 };
  const unvisited = new Set(Object.keys(IJTEMA_NAVIGATION_GRAPH_V2.nodes));

  while (unvisited.size > 0) {
    let current: string | undefined;
    let currentDistance = Infinity;

    for (const nodeId of unvisited) {
      const d = distances[nodeId] ?? Infinity;
      if (d < currentDistance) {
        current = nodeId;
        currentDistance = d;
      }
    }

    if (!current || currentDistance === Infinity) break;
    if (current === destinationNodeId) break;
    unvisited.delete(current);

    for (const edge of (IJTEMA_NAVIGATION_GRAPH_V2.adjacency[current] ?? []) as GraphEdge[]) {
      if (!unvisited.has(edge.to)) continue;
      const weight = edge.distanceM * (edge.weightMultiplier ?? 1);
      const next = currentDistance + weight;
      if (next < (distances[edge.to] ?? Infinity)) {
        distances[edge.to] = next;
      }
    }
  }

  return distances[destinationNodeId];
};

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

  /**
   * Selects the entry gate that minimises TOTAL route cost for an outside user:
   *   total_cost(gate) = haversine(userLocation → gate) + shortest_internal_path(gate → destinationNodeIds)
   *
   * Gate 20 (or any other gate) is only selected when it genuinely produces the
   * minimum total cost — it receives no special-casing or preference bonus.
   *
   * @param coordinate     User's current GPS location (outside venue)
   * @param destinationNodeIds  Graph node IDs that represent the destination
   * @returns The gate with minimum total cost, or undefined if none reachable
   */
  static findBestGateForOutsideUser(
    coordinate: AppCoordinate | V2Coordinate,
    destinationNodeIds: string[],
  ): Gate | undefined {
    const userPoint = toV2Coordinate(coordinate);
    const validDestNodes = destinationNodeIds.filter((id) => Boolean(IJTEMA_NAVIGATION_GRAPH_V2.nodes[id]));

    if (validDestNodes.length === 0) {
      // Fall back to nearest-gate when destination is unknown
      return this.findNearestOfficialEntryGateForOutsideUser(coordinate);
    }

    let bestGate: Gate | undefined;
    let bestTotalCost = Infinity;

    for (const gate of IJTEMA_GATES) {
      if (!isGateRoutable(gate) || !hasGateGraphConnection(gate)) continue;

      const approachCost = distanceMeters(userPoint, gate.coordinate);

      // Early prune: skip if just the approach already exceeds current best
      if (approachCost >= bestTotalCost) continue;

      // Find the cheapest internal path from this gate to any destination node
      let cheapestInternal = Infinity;
      for (const destNodeId of validDestNodes) {
        const internalCost = dijkstraCost(gate.id, destNodeId);
        if (internalCost !== undefined && internalCost < cheapestInternal) {
          cheapestInternal = internalCost;
        }
      }

      if (cheapestInternal === Infinity) continue; // gate not connected to destination

      const totalCost = approachCost + cheapestInternal;
      if (totalCost < bestTotalCost) {
        bestTotalCost = totalCost;
        bestGate = gate;
      }
    }

    // If no gate reaches the destination via the internal graph, fall back to nearest gate
    return bestGate ?? this.findNearestOfficialEntryGateForOutsideUser(coordinate);
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
      if (!isGateRoutable(gate)) {
        return {
          mode,
          startType: 'unresolved',
          coordinate: appCoordinate,
          candidateNodes: [],
          gate,
          error: `${gate?.name.en ?? options.manualGateId} is not routable because its coordinate is missing or unavailable.`,
        };
      }

      if (!hasGateGraphConnection(gate)) {
        return {
          mode,
          startType: 'unresolved',
          coordinate: appCoordinate,
          candidateNodes: [],
          gate,
          error: `${gate.name.en} is not connected to the internal Ijtema graph yet.`,
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
      // Use total-cost gate selection when destination nodes are known; otherwise
      // fall back to nearest-gate (e.g. for preview-without-destination calls).
      const gate = options.destinationNodeIds && options.destinationNodeIds.length > 0
        ? this.findBestGateForOutsideUser(v2Coordinate, options.destinationNodeIds)
        : this.findNearestOfficialEntryGateForOutsideUser(v2Coordinate);

      if (!isGateRoutable(gate) || !hasGateGraphConnection(gate)) {
        return {
          mode: 'outside',
          startType: 'unresolved',
          coordinate: appCoordinate,
          candidateNodes: [],
          error: 'No routable official entry gate is available for this outside location.',
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
    ]);

    if (!nearest) {
      return {
        mode: 'inside',
        startType: 'unresolved',
        coordinate: appCoordinate,
        candidateNodes: [],
        error: 'No internal graph node is available for this inside location.',
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

export const __entryGateRoutingCoordinateAdapters = {
  toV2Coordinate,
  toAppCoordinate,
};

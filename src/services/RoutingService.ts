/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { IJTEMA_DATA, LANDMARK_NEAREST_NODE, MAP_BOUNDS } from '../constants/data';
import { Coordinate, Place, RoutePreview, RouteSegment, RouteAlternative } from '../models/types';
import { getDistance } from 'geolib';

export type RouteResult = RoutePreview;

export interface VenueStatus {
  insideVenue: boolean;
  insideBlock: string | null; // Block ID if GPS is inside a block polygon
}

interface RouteNodePlan {
  startNodeIds: string[];
  targetNodeIds: string[];
  skippedSameNodePairs: Array<{ startNodeId: string; destNodeId: string }>;
}

export class RoutingService {
  // ─── Venue / block detection ───────────────────────────────────────────────

  /** Returns whether a coordinate is within the venue bounding box. */
  static isInsideVenue(coord: Coordinate): boolean {
    return (
      coord.latitude >= MAP_BOUNDS.minLat &&
      coord.latitude <= MAP_BOUNDS.maxLat &&
      coord.longitude >= MAP_BOUNDS.minLng &&
      coord.longitude <= MAP_BOUNDS.maxLng
    );
  }

  /**
   * Returns the block ID if the coordinate falls inside a block polygon,
   * using a simple ray-casting algorithm.
   */
  static getBlockContaining(coord: Coordinate): string | null {
    for (const [blockId, block] of Object.entries(IJTEMA_DATA.blocks)) {
      const polygon = block.corners ?? block.polygon;
      if (polygon && polygon.length >= 3 && this.pointInPolygon(coord, polygon)) {
        return blockId;
      }
    }
    return null;
  }

  /** Ray-casting point-in-polygon test. */
  private static pointInPolygon(point: Coordinate, polygon: Coordinate[]): boolean {
    let inside = false;
    const { latitude: py, longitude: px } = point;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const { latitude: iy, longitude: ix } = polygon[i];
      const { latitude: jy, longitude: jx } = polygon[j];
      const intersect =
        iy > py !== jy > py && px < ((jx - ix) * (py - iy)) / (jy - iy) + ix;
      if (intersect) inside = !inside;
    }
    return inside;
  }

  /** Full venue/block status for a coordinate. */
  static getVenueStatus(coord: Coordinate): VenueStatus {
    return {
      insideVenue: this.isInsideVenue(coord),
      insideBlock: this.getBlockContaining(coord),
    };
  }

  // ─── Distance helpers ─────────────────────────────────────────────────────

  static findNearestNode(coord: Coordinate): string {
    let nearestId = '';
    let minDistance = Infinity;

    Object.entries(IJTEMA_DATA.nodes).forEach(([id, node]) => {
      // Skip off-graph landmark nodes
      if (node.nearestRoadNode) return;
      const dist = getDistance(
        { latitude: coord.latitude, longitude: coord.longitude },
        { latitude: node.lat, longitude: node.lng }
      );
      if (dist < minDistance) {
        minDistance = dist;
        nearestId = id;
      }
    });

    return nearestId;
  }

  private static uniqueValidNodeIds(nodeIds: string[]): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const nodeId of nodeIds) {
      if (!IJTEMA_DATA.nodes[nodeId]) continue;
      if (seen.has(nodeId)) continue;
      seen.add(nodeId);
      out.push(nodeId);
    }
    return out;
  }

  private static sortNodeIdsByDistance(nodeIds: string[], coord: Coordinate): string[] {
    return [...nodeIds].sort((a, b) => {
      const nodeA = IJTEMA_DATA.nodes[a];
      const nodeB = IJTEMA_DATA.nodes[b];
      if (!nodeA || !nodeB) return 0;
      const distA = getDistance(
        { latitude: coord.latitude, longitude: coord.longitude },
        { latitude: nodeA.lat, longitude: nodeA.lng },
      );
      const distB = getDistance(
        { latitude: coord.latitude, longitude: coord.longitude },
        { latitude: nodeB.lat, longitude: nodeB.lng },
      );
      return distA - distB;
    });
  }

  private static resolveOriginNodeCandidates(
    startCoord: Coordinate,
    startNodeIdOverride?: string,
  ): string[] {
    if (startNodeIdOverride && IJTEMA_DATA.nodes[startNodeIdOverride]) {
      return [startNodeIdOverride];
    }

    const insideBlockId = this.getBlockContaining(startCoord);
    if (insideBlockId) {
      const block = IJTEMA_DATA.blocks[insideBlockId];
      const entryNodes = this.uniqueValidNodeIds(block?.entry_nodes ?? []);
      if (entryNodes.length > 0) {
        return this.sortNodeIdsByDistance(entryNodes, startCoord);
      }
    }

    const nearest = this.findNearestNode(startCoord);
    return nearest ? [nearest] : [];
  }

  static resolveOriginNodesForCoordinate(
    startCoord: Coordinate,
    startNodeIdOverride?: string,
  ): string[] {
    return this.resolveOriginNodeCandidates(startCoord, startNodeIdOverride);
  }

  private static isUsableRoute(route: RoutePreview | null): route is RoutePreview {
    return !!route && route.totalDistance > 0 && route.nodes.length > 1 && route.segments.length > 0;
  }

  /**
   * Resolve destination node IDs for any Place/landmark.
   * - Block → entry_nodes
   * - Landmark → LANDMARK_NEAREST_NODE
   * - Node → the node itself
   */
  static resolveDestinationNodes(placeId: string, placeCoord: Coordinate): string[] {
    return this.resolveDestinationNodesFromPlace({
      id: placeId,
      coordinate: placeCoord,
    } as Place);
  }

  static resolveDestinationNodesFromPlace(place: Place, origin?: Coordinate): string[] {
    const explicitNodeId =
      place.routingNodeId ?? place.selectedEntryNodeId ?? place.resolvedRoutingNodeId;
    if (explicitNodeId && IJTEMA_DATA.nodes[explicitNodeId]) {
      return [explicitNodeId];
    }

    const placeId = place.id;
    const placeCoord = place.coordinate;

    // Block?
    const block = IJTEMA_DATA.blocks[placeId];
    if (block) {
      const entryNodes = this.uniqueValidNodeIds(block.entry_nodes ?? []);
      if (entryNodes.length > 0) {
        if (origin) {
          return this.sortNodeIdsByDistance(entryNodes, origin);
        }
        return entryNodes;
      }
    }

    // Landmark with explicit nearest road node?
    const landmarkNode = LANDMARK_NEAREST_NODE[placeId];
    if (landmarkNode) return [landmarkNode];

    // Raw graph node or off-graph POI node?
    if (IJTEMA_DATA.nodes[placeId]) {
      const node = IJTEMA_DATA.nodes[placeId];
      return [node.nearestRoadNode ?? placeId];
    }

    // Fallback — nearest graph node
    return [this.findNearestNode(placeCoord)];
  }

  // ─── Single best route ────────────────────────────────────────────────────

  static calculateRoute(
    startCoord: Coordinate,
    destinationNodeIds: string[],
    startNodeIdOverride?: string,
    walkingSpeedMs: number = 1.4,
  ): RoutePreview | null {
    const nodePlan = this.resolveRouteNodePlan(startCoord, destinationNodeIds, startNodeIdOverride);
    const { startNodeIds, targetNodeIds } = nodePlan;

    let bestRoute: RoutePreview | null = null;

    for (const startNodeId of startNodeIds) {
      for (const destId of targetNodeIds) {
        if (startNodeId === destId) continue;
        const route = this.aStar(startNodeId, destId, 1.0, walkingSpeedMs);
        if (this.isUsableRoute(route) && (!bestRoute || route.totalDistance < bestRoute.totalDistance)) {
          bestRoute = route;
        }
      }
    }

    return bestRoute;
  }

  // ─── Multiple route alternatives (Phase 9) ───────────────────────────────

  /**
   * Returns up to 3 labeled route alternatives between startCoord and the
   * cheapest destination node among destinationNodeIds.
   *
   * Strategy:
   *  1. "Fastest" — plain A* (shortest estimated time ≈ shortest distance on
   *     this graph because all edges are pedestrian rastas).
   *  2. "Shortest" — A* with the same graph but a different penalty multiplier
   *     on non-rasta edges to prefer named rastas (labels a separate path when
   *     one already exists).
   *  3. "Alternative" — Yen's first alternative: run A* again with the primary
   *     path edges slightly penalized so the algorithm explores different roads.
   */
  static calculateRoutes(
    startCoord: Coordinate,
    destinationNodeIds: string[],
    walkingSpeedMs: number = 1.4,
    startNodeIdOverride?: string,
  ): RouteAlternative[] {
    const nodePlan = this.resolveRouteNodePlan(startCoord, destinationNodeIds, startNodeIdOverride);
    const { startNodeIds, targetNodeIds } = nodePlan;
    const results: RouteAlternative[] = [];

    // --- Route 1: Fastest (plain A*) ---
    let bestStartId = '';
    let bestDestId = '';
    let route1: RoutePreview | null = null;
    for (const startNodeId of startNodeIds) {
      for (const destId of targetNodeIds) {
        if (startNodeId === destId) continue;
        const r = this.aStar(startNodeId, destId, 1.0, walkingSpeedMs);
        if (this.isUsableRoute(r) && (!route1 || r.totalDistance < route1.totalDistance)) {
          route1 = r;
          bestStartId = startNodeId;
          bestDestId = destId;
        }
      }
    }
    if (route1) {
      results.push({ label: 'Fastest', labelUr: 'تیز ترین', route: route1 });
    } else {
      return results;
    }

    // --- Route 2: Shortest (boundary-road penalty — stays on named rastas) ---
    const route2 = this.aStar(bestStartId, bestDestId, 1.15, walkingSpeedMs);
    if (
      this.isUsableRoute(route2) &&
      route1 &&
      route2.nodes.join() !== route1.nodes.join() &&
      route2.totalDistance < route1.totalDistance * 1.5
    ) {
      results.push({ label: 'Shortest', labelUr: 'مختصر ترین', route: route2 });
    }

    // --- Route 3: Alternative (penalise primary-route edges) ---
    if (route1 && results.length < 3) {
      const primaryEdgeSet = new Set<string>();
      for (let i = 0; i < route1.nodes.length - 1; i++) {
        primaryEdgeSet.add(`${route1.nodes[i]}-${route1.nodes[i + 1]}`);
        primaryEdgeSet.add(`${route1.nodes[i + 1]}-${route1.nodes[i]}`);
      }
      const route3 = this.aStar(
        bestStartId,
        bestDestId,
        1.0,
        walkingSpeedMs,
        primaryEdgeSet,
      );
      if (
        this.isUsableRoute(route3) &&
        route3.nodes.join() !== route1.nodes.join() &&
        (!results[1] || route3.nodes.join() !== results[1].route.nodes.join())
      ) {
        results.push({ label: 'Alternative', labelUr: 'متبادل راستہ', route: route3 });
      }
    }

    return results;
  }

  static explainRouteNodeResolution(
    startCoord: Coordinate,
    destinationNodeIds: string[],
    startNodeIdOverride?: string,
  ): RouteNodePlan {
    return this.resolveRouteNodePlan(startCoord, destinationNodeIds, startNodeIdOverride);
  }

  // ─── A* core ─────────────────────────────────────────────────────────────

  private static aStar(
    startId: string,
    goalId: string,
    nonRastaPenalty = 1.0,
    walkingSpeedMs = 1.4,
    avoidEdges?: Set<string>,
  ): RoutePreview | null {
    const openSet: string[] = [startId];
    const closedSet = new Set<string>();
    const cameFrom: Record<string, string> = {};

    const gScore: Record<string, number> = {};
    gScore[startId] = 0;

    const fScore: Record<string, number> = {};
    fScore[startId] = this.heuristic(startId, goalId);

    while (openSet.length > 0) {
      openSet.sort((a, b) => (fScore[a] ?? Infinity) - (fScore[b] ?? Infinity));
      const current = openSet.shift()!;

      if (closedSet.has(current)) continue;
      closedSet.add(current);

      if (current === goalId) {
        return this.reconstructPath(cameFrom, current, gScore[current], walkingSpeedMs);
      }

      const neighbors = this.getNeighbors(current);
      for (const neighbor of neighbors) {
        if (closedSet.has(neighbor.id)) continue;

        // Apply penalty for avoided (primary-path) edges
        const edgeKey = `${current}-${neighbor.id}`;
        const avoidPenalty = avoidEdges?.has(edgeKey) ? 2.5 : 1.0;

        // Apply non-rasta penalty
        const edge = IJTEMA_DATA.edges.find(
          (e) =>
            (e.from === current && e.to === neighbor.id) ||
            (e.from === neighbor.id && e.to === current),
        );
        const rastaMult = edge?.isRasta ? 1.0 : nonRastaPenalty;
        const edgeWeight = edge?.weightMultiplier ?? 1.0;

        const cost = neighbor.distance * rastaMult * avoidPenalty * edgeWeight;
        const tentativeGScore = (gScore[current] ?? Infinity) + cost;

        if (tentativeGScore < (gScore[neighbor.id] ?? Infinity)) {
          cameFrom[neighbor.id] = current;
          gScore[neighbor.id] = tentativeGScore;
          fScore[neighbor.id] = tentativeGScore + this.heuristic(neighbor.id, goalId);

          if (!openSet.includes(neighbor.id)) {
            openSet.push(neighbor.id);
          }
        }
      }
    }

    return null;
  }

  private static heuristic(nodeId: string, goalId: string): number {
    const n1 = (IJTEMA_DATA.nodes as any)[nodeId];
    const n2 = (IJTEMA_DATA.nodes as any)[goalId];
    if (!n1 || !n2) return Infinity;
    return getDistance(
      { latitude: n1.lat, longitude: n1.lng },
      { latitude: n2.lat, longitude: n2.lng }
    );
  }

  private static getNeighbors(nodeId: string): { id: string; distance: number }[] {
    return IJTEMA_DATA.edges
      .filter((e) => e.from === nodeId || e.to === nodeId)
      .map((e) => ({
        id: e.from === nodeId ? e.to : e.from,
        distance: e.distance_m,
      }));
  }

  private static reconstructPath(
    cameFrom: Record<string, string>,
    current: string,
    totalDistance: number,
    walkingSpeedMs = 1.4,
  ): RoutePreview {
    const path = [current];
    let tempCurrent = current;
    while (tempCurrent in cameFrom) {
      tempCurrent = cameFrom[tempCurrent];
      path.unshift(tempCurrent);
    }

    const coordinates = path.map((id) => {
      const node = (IJTEMA_DATA.nodes as any)[id];
      return { latitude: node.lat, longitude: node.lng };
    });

    const segments: RouteSegment[] = [];
    for (let i = 0; i < path.length - 1; i++) {
      const fromId = path[i];
      const toId = path[i + 1];
      const edge = IJTEMA_DATA.edges.find(
        (e) => (e.from === fromId && e.to === toId) || (e.from === toId && e.to === fromId)
      );

      segments.push({
        fromId,
        toId,
        distance: edge?.distance_m ?? 0,
        isRasta: edge?.isRasta ?? false,
        name: edge?.name,
      });
    }

    return {
      id: `route_${Date.now()}`,
      sourceVersion: 'v1',
      coordinates,
      nodes: path,
      totalDistance,
      estimatedTimeMin: Math.ceil(totalDistance / (walkingSpeedMs * 60)),
      segments,
    };
  }

  private static resolveRouteNodePlan(
    startCoord: Coordinate,
    destinationNodeIds: string[],
    startNodeIdOverride?: string,
  ): RouteNodePlan {
    const startNodeIds = this.resolveOriginNodeCandidates(startCoord, startNodeIdOverride);
    const targetNodeIds = this.uniqueValidNodeIds(destinationNodeIds);
    const skippedSameNodePairs: Array<{ startNodeId: string; destNodeId: string }> = [];

    for (const startNodeId of startNodeIds) {
      for (const destNodeId of targetNodeIds) {
        if (startNodeId === destNodeId) {
          skippedSameNodePairs.push({ startNodeId, destNodeId });
        }
      }
    }

    return {
      startNodeIds,
      targetNodeIds,
      skippedSameNodePairs,
    };
  }

  static runRouteDiagnostics(): Array<{
    from: string;
    to: string;
    success: boolean;
    nodes: string[];
    distanceM: number;
    expectedNodes?: string[];
    matchesExpected?: boolean;
  }> {
    const tests: Array<[string, string, string[] | undefined, string | undefined]> = [
      ['B1', 'B24', ['P1', 'P2', 'P3', 'P4', 'P5', 'P7', 'P12', 'S15'], 'P1'],
      ['B24', 'B1', ['S15', 'P12', 'P7', 'P5', 'P4', 'P3', 'P2', 'P1'], 'S15'],
      ['B6', 'B18', ['P6', 'P9', 'P10', 'P11', 'P12', 'P7'], 'P6'],
      ['B3', 'B21', ['P8', 'P9', 'P10', 'P3', 'P4', 'P5'], 'P8'],
      ['S13', 'S16', ['S13', 'P1', 'P2', 'P3', 'P4', 'P5', 'S16'], undefined],
      ['S14', 'S15', ['S14', 'P8', 'P9', 'P10', 'P11', 'P12', 'S15'], undefined],
      ['T1', 'B21', ['T1', 'S7', 'S8', 'S9', 'P10', 'P3', 'P4', 'P5'], undefined],
    ];

    const out: Array<{
      from: string;
      to: string;
      success: boolean;
      nodes: string[];
      distanceM: number;
      expectedNodes?: string[];
      matchesExpected?: boolean;
    }> = [];

    for (const [fromId, toId, expectedNodes, preferredStartNode] of tests) {
      const fromNodes = IJTEMA_DATA.blocks[fromId]?.entry_nodes ?? [fromId];
      const toNodes = IJTEMA_DATA.blocks[toId]?.entry_nodes ?? [toId];
      const startNode = preferredStartNode ?? fromNodes.find((n) => IJTEMA_DATA.nodes[n]);

      if (!startNode || toNodes.length === 0) {
        out.push({ from: fromId, to: toId, success: false, nodes: [], distanceM: 0, expectedNodes });
        continue;
      }

      const startNodeData = IJTEMA_DATA.nodes[startNode];
      const route = this.calculateRoute(
        { latitude: startNodeData.lat, longitude: startNodeData.lng },
        toNodes,
        startNode,
      );

      out.push({
        from: fromId,
        to: toId,
        success: !!route,
        nodes: route?.nodes ?? [],
        distanceM: route?.totalDistance ?? 0,
        expectedNodes,
        matchesExpected: expectedNodes ? route?.nodes.join('>') === expectedNodes.join('>') : undefined,
      });
    }

    return out;
  }
}

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { IJTEMA_DATA } from '../constants/data';
import { Coordinate, RoutePreview, RouteSegment } from '../models/types';
import { getDistance } from 'geolib';

export type RouteResult = RoutePreview;

export class RoutingService {
  static findNearestNode(coord: Coordinate): string {
    let nearestId = "";
    let minDistance = Infinity;

    Object.entries(IJTEMA_DATA.nodes).forEach(([id, node]) => {
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

  static calculateRoute(startCoord: Coordinate, destinationNodeIds: string[]): RoutePreview | null {
    const startNodeId = this.findNearestNode(startCoord);
    
    let bestRoute: RoutePreview | null = null;

    for (const destId of destinationNodeIds) {
      const route = this.aStar(startNodeId, destId);
      if (route && (!bestRoute || route.totalDistance < bestRoute.totalDistance)) {
        bestRoute = route;
      }
    }

    return bestRoute;
  }

  private static aStar(startId: string, goalId: string): RoutePreview | null {
    const openSet = [startId];
    const cameFrom: Record<string, string> = {};
    
    const gScore: Record<string, number> = {};
    gScore[startId] = 0;

    const fScore: Record<string, number> = {};
    fScore[startId] = this.heuristic(startId, goalId);

    while (openSet.length > 0) {
      // Sort by fScore
      openSet.sort((a, b) => (fScore[a] || Infinity) - (fScore[b] || Infinity));
      const current = openSet.shift()!;

      if (current === goalId) {
        return this.reconstructPath(cameFrom, current, gScore[current]);
      }

      const neighbors = this.getNeighbors(current);
      for (const neighbor of neighbors) {
        const tentativeGScore = gScore[current] + neighbor.distance;
        
        if (tentativeGScore < (gScore[neighbor.id] || Infinity)) {
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

  private static getNeighbors(nodeId: string): { id: string, distance: number }[] {
    return IJTEMA_DATA.edges
      .filter(e => e.from === nodeId || e.to === nodeId)
      .map(e => ({
        id: e.from === nodeId ? e.to : e.from,
        distance: e.distance_m
      }));
  }

  private static reconstructPath(cameFrom: Record<string, string>, current: string, totalDistance: number): RoutePreview {
    const path = [current];
    let tempCurrent = current;
    while (tempCurrent in cameFrom) {
      tempCurrent = cameFrom[tempCurrent];
      path.unshift(tempCurrent);
    }

    const coordinates = path.map(id => {
      const node = (IJTEMA_DATA.nodes as any)[id];
      return { latitude: node.lat, longitude: node.lng };
    });

    const segments: RouteSegment[] = [];
    for (let i = 0; i < path.length - 1; i++) {
      const fromId = path[i];
      const toId = path[i+1];
      const edge = IJTEMA_DATA.edges.find(e => 
        (e.from === fromId && e.to === toId) || (e.from === toId && e.to === fromId)
      );
      
      segments.push({
        fromId,
        toId,
        distance: edge?.distance_m || 0,
        isRasta: edge?.isRasta || false,
        name: edge?.name
      });
    }

    return {
      id: `route_${Date.now()}`,
      coordinates,
      nodes: path,
      totalDistance,
      estimatedTimeMin: Math.ceil(totalDistance / 80), // Assuming 80m/min walking speed
      segments
    };
  }
}

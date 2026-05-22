/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { IJTEMA_DATA, MAP_BOUNDS } from '../constants/data';
import { Coordinate } from '../models/types';
import { getDistance } from 'geolib';

export interface RoutingNodeResolution {
  nodeId: string;
  snappedCoordinate: Coordinate;
  insideVenue: boolean;
  insideBlockId: string | null;
  warning?: string;
}

export class SnapToRoadService {
  /**
   * For visual blue-dot display only.
   * Snaps to the nearest walkable segment inside a small threshold.
   */
  static snapVisualToRoad(coord: Coordinate, thresholdM = 20): Coordinate {
    let nearestPoint: Coordinate = coord;
    let minDistance = thresholdM;

    IJTEMA_DATA.edges.forEach((edge) => {
      const fromNode = IJTEMA_DATA.nodes[edge.from];
      const toNode = IJTEMA_DATA.nodes[edge.to];
      if (!fromNode || !toNode) return;

      const pointOnLine = this.getNearestPointOnLine(
        { latitude: coord.latitude, longitude: coord.longitude },
        { latitude: fromNode.lat, longitude: fromNode.lng },
        { latitude: toNode.lat, longitude: toNode.lng },
      );

      const dist = getDistance(
        { latitude: coord.latitude, longitude: coord.longitude },
        { latitude: pointOnLine.latitude, longitude: pointOnLine.longitude },
      );

      if (dist < minDistance) {
        minDistance = dist;
        nearestPoint = {
          latitude: pointOnLine.latitude,
          longitude: pointOnLine.longitude,
          heading: coord.heading,
        };
      }
    });

    return nearestPoint;
  }

  // Backward-compatible alias
  static snapToRoad(coord: Coordinate): Coordinate {
    return this.snapVisualToRoad(coord, 20);
  }

  /**
   * Routing resolver: always returns a graph node for route calculation.
   * - Inside block: nearest strict block entry node.
   * - Inside venue road/open area: nearest graph node.
   * - Outside venue: nearest boundary/corner node with warning.
   */
  static resolveRoutingNode(coord: Coordinate): RoutingNodeResolution {
    const insideVenue = this.isInsideVenue(coord);
    const insideBlockId = this.getBlockContaining(coord);

    if (insideBlockId) {
      const block = IJTEMA_DATA.blocks[insideBlockId];
      const nodeId = this.findNearestNodeFromSet(coord, block.entry_nodes);
      return {
        nodeId,
        snappedCoordinate: this.nodeToCoordinate(nodeId, coord),
        insideVenue,
        insideBlockId,
      };
    }

    if (insideVenue) {
      const nodeId = this.findNearestNode(coord);
      return {
        nodeId,
        snappedCoordinate: this.nodeToCoordinate(nodeId, coord),
        insideVenue,
        insideBlockId: null,
      };
    }

    const boundaryCandidates = Object.keys(IJTEMA_DATA.nodes).filter((id) =>
      /^(T1|T2|S6|S12|S13|S14|S15|S16|S17)$/.test(id),
    );
    const nodeId = this.findNearestNodeFromSet(coord, boundaryCandidates);

    return {
      nodeId,
      snappedCoordinate: this.nodeToCoordinate(nodeId, coord),
      insideVenue,
      insideBlockId: null,
      warning: 'You are outside the mapped Ijtema navigation area.',
    };
  }

  private static nodeToCoordinate(nodeId: string, fallback: Coordinate): Coordinate {
    const node = IJTEMA_DATA.nodes[nodeId];
    if (!node) return fallback;
    return {
      latitude: node.lat,
      longitude: node.lng,
      heading: fallback.heading,
      accuracy: fallback.accuracy,
    };
  }

  private static findNearestNode(coord: Coordinate): string {
    const onGraphNodeIds = Object.entries(IJTEMA_DATA.nodes)
      .filter(([, node]) => !node.nearestRoadNode)
      .map(([nodeId]) => nodeId);
    return this.findNearestNodeFromSet(coord, onGraphNodeIds);
  }

  private static findNearestNodeFromSet(coord: Coordinate, nodeIds: string[]): string {
    let nearest = nodeIds[0] ?? 'T1';
    let minDistance = Infinity;

    for (const nodeId of nodeIds) {
      const node = IJTEMA_DATA.nodes[nodeId];
      if (!node) continue;
      const dist = getDistance(
        { latitude: coord.latitude, longitude: coord.longitude },
        { latitude: node.lat, longitude: node.lng },
      );
      if (dist < minDistance) {
        minDistance = dist;
        nearest = nodeId;
      }
    }

    return nearest;
  }

  private static isInsideVenue(coord: Coordinate): boolean {
    return (
      coord.latitude >= MAP_BOUNDS.minLat &&
      coord.latitude <= MAP_BOUNDS.maxLat &&
      coord.longitude >= MAP_BOUNDS.minLng &&
      coord.longitude <= MAP_BOUNDS.maxLng
    );
  }

  private static getBlockContaining(coord: Coordinate): string | null {
    for (const [blockId, block] of Object.entries(IJTEMA_DATA.blocks)) {
      const polygon = block.corners ?? block.polygon;
      if (polygon && polygon.length >= 3 && this.pointInPolygon(coord, polygon)) {
        return blockId;
      }
    }
    return null;
  }

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

  private static getNearestPointOnLine(p: Coordinate, a: Coordinate, b: Coordinate): Coordinate {
    const atob = { x: b.longitude - a.longitude, y: b.latitude - a.latitude };
    const atop = { x: p.longitude - a.longitude, y: p.latitude - a.latitude };
    const len = atob.x * atob.x + atob.y * atob.y;
    const dot = atop.x * atob.x + atop.y * atob.y;
    const t = Math.min(1, Math.max(0, dot / len));

    return {
      latitude: a.latitude + atob.y * t,
      longitude: a.longitude + atob.x * t,
    };
  }
}

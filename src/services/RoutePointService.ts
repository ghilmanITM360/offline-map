/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { getDistance } from 'geolib';
import { IJTEMA_DATA } from '../constants/data';
import { Coordinate, Place } from '../models/types';

export class RoutePointService {
  static nodeToCoordinate(nodeId?: string | null): Coordinate | null {
    if (!nodeId) return null;
    const node = IJTEMA_DATA.nodes[nodeId];
    if (!node) return null;
    return { latitude: node.lat, longitude: node.lng };
  }

  static getExplicitRoutingNode(place?: Place | null): string | null {
    if (!place) return null;
    const nodeId = place.routingNodeId ?? place.selectedEntryNodeId ?? place.resolvedRoutingNodeId;
    return nodeId && IJTEMA_DATA.nodes[nodeId] ? nodeId : null;
  }

  static getDestinationCoordinate(place?: Place | null): Coordinate | null {
    if (!place) return null;
    if (place.category !== 'Block') {
      return place.coordinate;
    }
    const explicitNode = this.getExplicitRoutingNode(place);
    const explicitCoord = this.nodeToCoordinate(explicitNode);
    return place.resolvedRoutingCoordinate ?? place.snappedCoordinate ?? explicitCoord ?? place.coordinate;
  }

  static getStartCoordinate(place?: Place | null): Coordinate | null {
    if (!place) return null;
    const explicitNode = this.getExplicitRoutingNode(place);
    const explicitCoord = this.nodeToCoordinate(explicitNode);
    return place.snappedCoordinate ?? place.resolvedRoutingCoordinate ?? explicitCoord ?? place.coordinate;
  }

  static enrichPlaceWithRoutingNode(place: Place, nodeId: string): Place {
    const coordinate = this.nodeToCoordinate(nodeId);
    if (!coordinate) return place;
    return {
      ...place,
      routingNodeId: nodeId,
      selectedEntryNodeId: place.category === 'Block' ? nodeId : place.selectedEntryNodeId,
      resolvedRoutingNodeId: nodeId,
      resolvedRoutingCoordinate: coordinate,
      snappedCoordinate: coordinate,
    };
  }

  static nearestNodeFromSet(coord: Coordinate, nodeIds: string[]): string | null {
    let nearest: string | null = null;
    let minDistance = Infinity;

    for (const nodeId of nodeIds) {
      const node = IJTEMA_DATA.nodes[nodeId];
      if (!node) continue;
      const distance = getDistance(
        { latitude: coord.latitude, longitude: coord.longitude },
        { latitude: node.lat, longitude: node.lng },
      );
      if (distance < minDistance) {
        minDistance = distance;
        nearest = nodeId;
      }
    }

    return nearest;
  }
}

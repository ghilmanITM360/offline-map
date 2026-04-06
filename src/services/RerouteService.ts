/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Coordinate, RoutePreview } from '../models/types';
import { getDistance } from 'geolib';

export class RerouteService {
  /**
   * Checks if a coordinate is off the current route.
   * A coordinate is considered off-route if it's more than 20m away from any segment of the route.
   */
  static isOffRoute(coord: Coordinate, route: RoutePreview): boolean {
    const threshold = 20; // 20 meters

    for (let i = 0; i < route.coordinates.length - 1; i++) {
      const p1 = route.coordinates[i];
      const p2 = route.coordinates[i + 1];

      // Check if point is near the line segment
      // geolib's isPointInLine is more for exact matches, so we use distance to line
      const dist = this.getDistanceToLine(coord, p1, p2);
      if (dist <= threshold) {
        return false;
      }
    }

    return true;
  }

  private static getDistanceToLine(p: Coordinate, a: Coordinate, b: Coordinate): number {
    const x = p.longitude;
    const y = p.latitude;
    const x1 = a.longitude;
    const y1 = a.latitude;
    const x2 = b.longitude;
    const y2 = b.latitude;

    const A = x - x1;
    const B = y - y1;
    const C = x2 - x1;
    const D = y2 - y1;

    const dot = A * C + B * D;
    const len_sq = C * C + D * D;
    let param = -1;
    if (len_sq !== 0) param = dot / len_sq;

    let xx, yy;

    if (param < 0) {
      xx = x1;
      yy = y1;
    } else if (param > 1) {
      xx = x2;
      yy = y2;
    } else {
      xx = x1 + param * C;
      yy = y1 + param * D;
    }

    return getDistance(
      { latitude: y, longitude: x },
      { latitude: yy, longitude: xx }
    );
  }
}

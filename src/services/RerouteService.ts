/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Coordinate, RoutePreview } from '../models/types';
import { getDistance } from 'geolib';

// Single owner of "closest point on route / progress meters" for live navigation: both
// NavigationViewModel (v1, inline) and calculateNavigationProgressV2/V2NavigationRuntimeService
// (v2) call projectProgressMetersOnRoute + clampMonotonicProgress here rather than each
// re-deriving projection math. Do not add a second progress-projection implementation —
// GPS position -> this service -> navigation UI is the whole chain.
export class RerouteService {
  static getDynamicOffRouteThresholdMeters(gpsAccuracyM = 0): number {
    const threshold = Math.max(30, gpsAccuracyM * 1.5);
    return Math.min(80, Math.round(threshold));
  }

  static shouldHoldRouteForWeakGps(gpsAccuracyM = 0): boolean {
    return gpsAccuracyM > 50;
  }

  static shouldTriggerReroute(input: {
    consecutiveOffRouteCount: number;
    offRouteDurationMs: number;
    cooldownRemainingMs: number;
    movedDistanceSinceLastAcceptedM: number;
  }): boolean {
    if (input.cooldownRemainingMs > 0) return false;
    if (input.movedDistanceSinceLastAcceptedM < 12) return false;
    return input.consecutiveOffRouteCount >= 3 || input.offRouteDurationMs >= 9000;
  }

  static clampMonotonicProgress(
    previousProgressMeters: number,
    candidateProgressMeters: number,
    maxBacktrackMeters = 15,
  ): number {
    if (candidateProgressMeters + maxBacktrackMeters < previousProgressMeters) {
      return previousProgressMeters;
    }
    return candidateProgressMeters;
  }

  static projectProgressMetersOnRoute(coord: Coordinate, route: RoutePreview): {
    progressMeters: number;
    snappedCoordinate: Coordinate;
    distanceToRouteMeters: number;
  } {
    if (route.coordinates.length < 2) {
      return {
        progressMeters: 0,
        snappedCoordinate: coord,
        distanceToRouteMeters: Infinity,
      };
    }

    let cumulativeMeters = 0;
    let best = {
      progressMeters: 0,
      snappedCoordinate: coord,
      distanceToRouteMeters: Infinity,
    };

    for (let i = 0; i < route.coordinates.length - 1; i++) {
      const a = route.coordinates[i];
      const b = route.coordinates[i + 1];
      const projection = this.projectPointToSegment(coord, a, b);
      const segmentMeters = getDistance(
        { latitude: a.latitude, longitude: a.longitude },
        { latitude: b.latitude, longitude: b.longitude },
      );
      const progressMeters = cumulativeMeters + segmentMeters * projection.t;
      if (projection.distanceToSegmentMeters < best.distanceToRouteMeters) {
        best = {
          progressMeters,
          snappedCoordinate: {
            latitude: projection.point.latitude,
            longitude: projection.point.longitude,
            heading: coord.heading,
            accuracy: coord.accuracy,
          },
          distanceToRouteMeters: projection.distanceToSegmentMeters,
        };
      }
      cumulativeMeters += segmentMeters;
    }

    return best;
  }

  /**
   * Returns true when the user is off the current route.
   * Threshold is dynamic by GPS accuracy with floor/cap controls.
   */
  static isOffRoute(coord: Coordinate, route: RoutePreview, gpsAccuracyM = 0): boolean {
    const threshold = this.getDynamicOffRouteThresholdMeters(gpsAccuracyM);
    const distance = this.getDistanceToRouteMeters(coord, route);
    return distance > threshold;
  }

  static getDistanceToRouteMeters(coord: Coordinate, route: RoutePreview): number {
    let minDistance = Infinity;

    for (let i = 0; i < route.coordinates.length - 1; i++) {
      const p1 = route.coordinates[i];
      const p2 = route.coordinates[i + 1];
      const dist = this.getDistanceToSegment(coord, p1, p2);
      if (dist < minDistance) {
        minDistance = dist;
      }
    }

    return minDistance;
  }

  private static projectPointToSegment(p: Coordinate, a: Coordinate, b: Coordinate): {
    point: Coordinate;
    t: number;
    distanceToSegmentMeters: number;
  } {
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
    const lenSq = C * C + D * D;
    const rawT = lenSq !== 0 ? dot / lenSq : 0;
    const t = Math.max(0, Math.min(1, rawT));

    const point = {
      latitude: y1 + D * t,
      longitude: x1 + C * t,
    };

    return {
      point,
      t,
      distanceToSegmentMeters: getDistance(
        { latitude: p.latitude, longitude: p.longitude },
        { latitude: point.latitude, longitude: point.longitude },
      ),
    };
  }

  private static getDistanceToSegment(p: Coordinate, a: Coordinate, b: Coordinate): number {
    return this.projectPointToSegment(p, a, b).distanceToSegmentMeters;
  }
}

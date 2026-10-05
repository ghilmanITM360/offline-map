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
    // NAV-P0-001: a single fix's forward jump, physically bounded by elapsed time since the
    // last accepted fix (see V2NavigationRuntimeService.calculateNavigationProgressV2, which
    // derives this from Coordinate.observedAtMs). undefined preserves the pre-fix behavior
    // (uncapped) for callers that can't supply elapsed-time evidence.
    maxForwardMeters?: number,
  ): number {
    if (candidateProgressMeters + maxBacktrackMeters < previousProgressMeters) {
      return previousProgressMeters;
    }
    if (maxForwardMeters != null) {
      const forwardCap = previousProgressMeters + maxForwardMeters;
      if (candidateProgressMeters > forwardCap) {
        return forwardCap;
      }
    }
    return candidateProgressMeters;
  }

  /**
   * Closest point on the route. With `continuity` (#93), a segment whose progress lies inside
   * [previous - maxBacktrack, previous + maxForward] wins as long as it is within `acceptDistanceM`
   * (the off-route tolerance). A route that doubles back beside itself therefore cannot pull progress
   * onto the far corridor just because one noisy fix lands closer to it; once the walker is beyond the
   * tolerance of the window, or no segment is in it, the global nearest segment applies again.
   */
  static projectProgressMetersOnRoute(coord: Coordinate, route: RoutePreview, continuity?: {
    previousProgressMeters: number;
    maxForwardMeters: number;
    acceptDistanceM: number;
    maxBacktrackMeters?: number;
  }): {
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

    const windowActive = continuity != null &&
      Number.isFinite(continuity.previousProgressMeters) &&
      Number.isFinite(continuity.maxForwardMeters) &&
      Number.isFinite(continuity.acceptDistanceM);
    const windowMin = windowActive ? continuity.previousProgressMeters - (continuity.maxBacktrackMeters ?? 15) : 0;
    const windowMax = windowActive ? continuity.previousProgressMeters + continuity.maxForwardMeters : 0;
    let bestInWindow = best;

    for (let i = 0; i < route.coordinates.length - 1; i++) {
      const a = route.coordinates[i];
      const b = route.coordinates[i + 1];
      const projection = this.projectPointToSegment(coord, a, b);
      const segmentMeters = getDistance(
        { latitude: a.latitude, longitude: a.longitude },
        { latitude: b.latitude, longitude: b.longitude },
      );
      const progressMeters = cumulativeMeters + segmentMeters * projection.t;
      const candidate = {
        progressMeters,
        snappedCoordinate: {
          latitude: projection.point.latitude,
          longitude: projection.point.longitude,
          heading: coord.heading,
          accuracy: coord.accuracy,
        },
        distanceToRouteMeters: projection.distanceToSegmentMeters,
      };
      if (projection.distanceToSegmentMeters < best.distanceToRouteMeters) {
        best = candidate;
      }
      if (
        windowActive &&
        progressMeters >= windowMin &&
        progressMeters <= windowMax &&
        projection.distanceToSegmentMeters < bestInWindow.distanceToRouteMeters
      ) {
        bestInWindow = candidate;
      }
      cumulativeMeters += segmentMeters;
    }

    return windowActive && bestInWindow.distanceToRouteMeters <= continuity.acceptDistanceM ? bestInWindow : best;
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

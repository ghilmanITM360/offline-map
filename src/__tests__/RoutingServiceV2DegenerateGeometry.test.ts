/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// #103 regression: RoutingServiceV2.calculateRoute could return coordinates.length < 2
// for Rasta/SpecialRoute pairs whose nearest candidate points resolve to the same
// graph node (adjacent corridors sharing a junction) — pathCoordinates had no
// start-side seed coordinate for a plain 'rasta'/'special_route' start, so the
// degenerate same-node path (calculateShortestPath's startNodeId === destinationNodeId
// branch) produced exactly one coordinate instead of two. Found by an exhaustive
// service-level route-matrix audit (5402 directed pairs), not by manual testing.

import { RoutingServiceV2 } from '../services/RoutingServiceV2';

describe('RoutingServiceV2 degenerate same-node geometry (#103)', () => {
  it('R7 -> R8 (adjacent rastas sharing a junction) still returns >=2 coordinates', () => {
    const route = RoutingServiceV2.calculateRoute({
      start: { type: 'rasta', rastaId: 'R7' },
      destination: { type: 'rasta', rastaId: 'R8' },
    });

    expect(route).not.toBeNull();
    expect(route!.coordinates.length).toBeGreaterThanOrEqual(2);
    expect(Number.isFinite(route!.totalDistance)).toBe(true);
  });

  it('R8 -> R7 (reverse direction) still returns >=2 coordinates', () => {
    const route = RoutingServiceV2.calculateRoute({
      start: { type: 'rasta', rastaId: 'R8' },
      destination: { type: 'rasta', rastaId: 'R7' },
    });

    expect(route).not.toBeNull();
    expect(route!.coordinates.length).toBeGreaterThanOrEqual(2);
  });
});

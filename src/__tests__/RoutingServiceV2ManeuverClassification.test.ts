/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// #94 regression: NavigationInstruction.type was hardcoded to 'straight' for every
// internal edge (RoutingServiceV2.ts generateInstructions), so the existing left/right
// UI (NavigationChromeV2) could never render a turn. classifyJunctionTurn is the single
// authority that now decides type from real edge geometry; these are the MAN-01..11
// fixtures from the audit (MAN-12's step-boundary-consistency concern is covered by the
// "real graph" suite below instead of a synthetic case, since instruction text has no
// left/right wording to go out of sync with).

import { classifyJunctionTurn } from '../services/RoutingServiceV2';
import type { Coordinate } from '../data/ijtema';
import { SearchService } from '../services/SearchService';
import { V2DirectionsService } from '../services/V2DirectionsService';
import type { NavigationInstruction, Place } from '../models/types';

// Local flat-earth approximation of a bearing/distance projection, good enough at the
// 1-100m scale used below near the venue's real latitude — not a reimplementation of
// the rhumb-line math under test, just a way to construct fixtures with a known bearing.
const pointAt = (base: Coordinate, bearingDeg: number, distanceM: number): Coordinate => {
  const metersPerDegLat = 111_320;
  const metersPerDegLng = 111_320 * Math.cos((base.lat * Math.PI) / 180);
  const bearingRad = (bearingDeg * Math.PI) / 180;
  return {
    lat: base.lat + (distanceM * Math.cos(bearingRad)) / metersPerDegLat,
    lng: base.lng + (distanceM * Math.sin(bearingRad)) / metersPerDegLng,
  };
};

const BASE: Coordinate = { lat: 24.97, lng: 67.0 };

describe('classifyJunctionTurn (#94)', () => {
  it('MAN-01: near-identical incoming/outgoing bearing classifies as straight', () => {
    const junction = pointAt(BASE, 0, 50);
    const next = pointAt(junction, 0, 50);
    expect(classifyJunctionTurn(BASE, junction, next)).toBe('straight');
  });

  it('MAN-02: a clear 90 degree turn to the west classifies as left', () => {
    const junction = pointAt(BASE, 0, 50);
    const next = pointAt(junction, 270, 50);
    expect(classifyJunctionTurn(BASE, junction, next)).toBe('left');
  });

  it('MAN-03: a clear 90 degree turn to the east classifies as right', () => {
    const junction = pointAt(BASE, 0, 50);
    const next = pointAt(junction, 90, 50);
    expect(classifyJunctionTurn(BASE, junction, next)).toBe('right');
  });

  it('MAN-04: a 20 degree bend stays straight (type union has no slight-turn bucket)', () => {
    const junction = pointAt(BASE, 0, 50);
    const next = pointAt(junction, 20, 50);
    expect(classifyJunctionTurn(BASE, junction, next)).toBe('straight');
  });

  it('MAN-05: a 35 degree bend (just over threshold) classifies as right', () => {
    const junction = pointAt(BASE, 0, 50);
    const next = pointAt(junction, 35, 50);
    expect(classifyJunctionTurn(BASE, junction, next)).toBe('right');
  });

  it('MAN-06: a sharp ~150 degree left bend still resolves to left (no separate sharp bucket)', () => {
    const junction = pointAt(BASE, 0, 50);
    const next = pointAt(junction, 210, 50);
    expect(classifyJunctionTurn(BASE, junction, next)).toBe('left');
  });

  it('MAN-07: a sharp ~150 degree right bend still resolves to right (no separate sharp bucket)', () => {
    const junction = pointAt(BASE, 0, 50);
    const next = pointAt(junction, 150, 50);
    expect(classifyJunctionTurn(BASE, junction, next)).toBe('right');
  });

  it('MAN-08: a near-reversal (~170 degrees) resolves to a direction, not a crash or a 5th bucket', () => {
    const junction = pointAt(BASE, 0, 50);
    const next = pointAt(junction, 170, 50);
    expect(['left', 'right']).toContain(classifyJunctionTurn(BASE, junction, next));
  });

  it('MAN-09: bearing normalizes correctly across the 0/360 boundary (350 -> 30 is a small right, not a huge left)', () => {
    const junction = pointAt(BASE, 340, 50);
    const next = pointAt(junction, 20, 50);
    expect(classifyJunctionTurn(BASE, junction, next)).toBe('right');
  });

  it('MAN-10: an outgoing segment at/below the coordinate-dedup tolerance yields no unstable classification', () => {
    const junction = pointAt(BASE, 0, 50);
    const next = pointAt(junction, 90, 1);
    expect(classifyJunctionTurn(BASE, junction, next)).toBe('straight');
  });

  it('MAN-11: duplicate adjacent coordinates classify as straight, no crash or NaN', () => {
    expect(classifyJunctionTurn(BASE, BASE, BASE)).toBe('straight');
    const next = pointAt(BASE, 90, 50);
    expect(classifyJunctionTurn(BASE, BASE, next)).toBe('straight');
  });
});

describe('RoutingServiceV2 generateInstructions - real graph regression (#94)', () => {
  const VALID_TYPES: NavigationInstruction['type'][] = ['straight', 'left', 'right', 'arrival'];

  it('every instruction across sampled real routes has a valid type, and at least one route turns', () => {
    process.env.EXPO_PUBLIC_USE_IJTEMA_V2_ROUTING = 'true';

    const gate = SearchService.search('Gate 08')[0] as Place | undefined;
    expect(gate).toBeDefined();

    const destinationQueries = ['Block 1', 'Block 10', 'Block 20', 'Block 30', 'Block 40'];
    const destinations = destinationQueries
      .map((query) => SearchService.search(query)[0] as Place | undefined)
      .filter((place): place is Place => Boolean(place));
    expect(destinations.length).toBeGreaterThan(0);

    let sawTurn = false;

    for (const destination of destinations) {
      const preview = V2DirectionsService.calculatePreview({
        startPlace: gate!,
        destination,
        currentLocation: null,
        walkingSpeedMs: 1.4,
      });
      if (preview.status !== 'ready' || !preview.route) continue;

      for (const instruction of preview.route.instructions) {
        expect(VALID_TYPES).toContain(instruction.type);
        if (instruction.type === 'left' || instruction.type === 'right') sawTurn = true;
      }
    }

    // The bug this regression guards against: every instruction silently collapsing to
    // 'straight' regardless of real geometry. If no sampled route ever turns, the fix
    // isn't reachable from real data and this assertion is the one that should fail.
    expect(sawTurn).toBe(true);
  });
});

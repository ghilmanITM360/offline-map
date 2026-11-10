/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  assignToRings, counterClockwise, diagnoseCoordinate, distanceToRingM, fromGeoJsonRing, pointInRing, ringFromUnorderedPoints,
  ringProblems, ringsOverlap, signedAreaM2, toGeoJsonRing, type GeoPoint,
} from '@muslim-ummah/offline-navigation';
import { IJTEMA_BLOCKS } from '../data/ijtema/blocks';

const KARACHI = { west: 66.97, south: 24.94, east: 67.04, north: 25.0 };
const sq = (lat: number, lng: number, d = 0.001): GeoPoint[] => [{ lat, lng }, { lat, lng: lng + d }, { lat: lat + d, lng: lng + d }, { lat: lat + d, lng }];

describe('diagnoseCoordinate', () => {
  it('accepts a plausible point and any venue anywhere on Earth inside its own bounds', () => {
    expect(diagnoseCoordinate({ lat: 24.967, lng: 67.004 }, KARACHI)).toBeNull();
    expect(diagnoseCoordinate({ lat: 51.5, lng: -0.12 }, { west: -0.2, south: 51.4, east: 0, north: 51.6 })).toBeNull();
  });
  it('names each failure', () => {
    expect(diagnoseCoordinate({ lat: NaN, lng: 67 }, KARACHI)).toBe('not-finite');
    expect(diagnoseCoordinate({ lat: 95, lng: 10 })).toBe('out-of-wgs84');
    expect(diagnoseCoordinate({ lat: 0, lng: 0 }, KARACHI)).toBe('null-island');
    expect(diagnoseCoordinate({ lat: 0, lng: 0 })).toBe('null-island');
    expect(diagnoseCoordinate({ lat: 67.004, lng: 24.967 }, KARACHI)).toBe('swapped');
    expect(diagnoseCoordinate({ lat: 30, lng: 67 }, KARACHI)).toBe('outside-bounds');
    expect(diagnoseCoordinate({ lat: 200, lng: 30 }, { west: 29, south: 199, east: 31, north: 201 })).toBe('out-of-wgs84');
  });
});

describe('rings', () => {
  it('validates a simple ring and reports each defect', () => {
    expect(ringProblems(sq(24.97, 67))).toEqual([]);
    expect(ringProblems(sq(24.97, 67).slice(0, 2))).toEqual(['too-few-points']);
    const [a, b, c, d] = sq(24.97, 67);
    expect(ringProblems([a, c, b, d])).toContain('self-intersecting'); // bow-tie
    expect(ringProblems([a, b, { ...b }, d])).toContain('duplicate-vertex');
    expect(ringProblems([a, { lat: a.lat, lng: a.lng + 0.001 }, { lat: a.lat, lng: a.lng + 0.002 }])).toContain('zero-area');
  });
  it('closes and reopens GeoJSON rings in [lng, lat] order, and refuses an open or swapped one', () => {
    const ring = sq(24.97, 67);
    const gj = toGeoJsonRing(ring);
    expect(gj[0]).toEqual([67, 24.97]);
    expect(gj[gj.length - 1]).toEqual(gj[0]);
    expect(fromGeoJsonRing(gj)).toEqual(ring);
    expect(fromGeoJsonRing(gj.slice(0, -1))).toBeNull();
    expect(fromGeoJsonRing([[1, 1], [2, 2], [3, 3]])).toBeNull();
    expect(fromGeoJsonRing([[100, 200], [101, 200], [101, 201], [100, 200]])).toBeNull();
  });
  it('orders unordered corners and never trusts the listed order', () => {
    const [a, b, c, d] = sq(24.97, 67);
    const centre = { lat: 24.9705, lng: 67.0005 };
    const { ring, problems } = ringFromUnorderedPoints([a, c, b, d], centre);
    expect(problems).toEqual([]);
    expect(signedAreaM2(counterClockwise(ring))).toBeGreaterThan(0);
    expect(signedAreaM2(counterClockwise([...ring].reverse()))).toBeGreaterThan(0);
  });
  it('computes containment, edge distance and overlap', () => {
    const r = sq(24.97, 67, 0.002);
    expect(pointInRing({ lat: 24.971, lng: 67.001 }, r)).toBe(true);
    expect(pointInRing({ lat: 24.975, lng: 67.001 }, r)).toBe(false);
    expect(pointInRing({ lat: 24.97, lng: 67.001 }, r)).toBe(true); // on an edge
    expect(distanceToRingM({ lat: 24.971, lng: 67.001 }, r)).toBeCloseTo(100.8, 0);
    expect(ringsOverlap(r, sq(24.971, 67.001, 0.002))).toBe(true);
    expect(ringsOverlap(r, sq(24.99, 67, 0.002))).toBe(false);
    expect(ringsOverlap(r, sq(24.97, 67.002, 0.002))).toBe(false); // shared edge only
    expect(ringsOverlap(r, sq(24.9705, 67.0005, 0.0005))).toBe(true); // fully inside
  });
});

describe('assignToRings', () => {
  const cands = [{ id: 'A', ring: sq(24.97, 67, 0.001) }, { id: 'B', ring: sq(24.97, 67.002, 0.001) }];
  it('inside, boundary, ambiguous and outside are distinct, and nothing is guessed', () => {
    expect(assignToRings({ lat: 24.9705, lng: 67.0005 }, cands).status).toBe('inside');
    expect(assignToRings({ lat: 24.9705, lng: 67.0005 }, cands).ids).toEqual(['A']);
    expect(assignToRings({ lat: 24.9705, lng: 67.00099995 }, cands).status).toBe('boundary');
    const overlapping = [...cands, { id: 'C', ring: sq(24.9703, 67.0003, 0.001) }];
    expect(assignToRings({ lat: 24.9707, lng: 67.0007 }, overlapping).status).toBe('ambiguous');
    const out = assignToRings({ lat: 24.99, lng: 67.1 }, cands);
    expect(out.status).toBe('outside');
    expect(out.nearestId).toBeDefined();
    expect(assignToRings({ lat: 24.9, lng: 67 }, []).status).toBe('outside');
  });
});

describe('the real Karachi blocks', () => {
  it('every block polygon is a simple ring that contains its own centre and no two blocks overlap', () => {
    for (const b of IJTEMA_BLOCKS) {
      expect({ id: b.id, problems: ringProblems(b.polygon) }).toEqual({ id: b.id, problems: [] });
      expect({ id: b.id, inside: pointInRing(b.center, b.polygon) }).toEqual({ id: b.id, inside: true });
    }
    const overlaps: string[] = [];
    for (let i = 0; i < IJTEMA_BLOCKS.length; i++) for (let j = i + 1; j < IJTEMA_BLOCKS.length; j++) if (ringsOverlap(IJTEMA_BLOCKS[i].polygon, IJTEMA_BLOCKS[j].polygon)) overlaps.push(`${IJTEMA_BLOCKS[i].id}/${IJTEMA_BLOCKS[j].id}`);
    expect(overlaps).toEqual([]);
  });
  it('every surveyed centre is assigned to its own block', () => {
    const cands = IJTEMA_BLOCKS.map((b) => ({ id: b.id, ring: b.polygon }));
    for (const b of IJTEMA_BLOCKS) expect(assignToRings(b.center, cands, 0.5)).toMatchObject({ ids: [b.id] });
  });
});

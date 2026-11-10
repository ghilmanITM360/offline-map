/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Karachi: corners are geometry, not entrances; the pin and the route endpoint are distinct and labelled; Gates 18/19 are honestly unreachable.
import {
  availabilityOf, createPlaceCatalog, describeDestination, findBestVenuePath, parsePackPlaceCatalog, parsePackVenueGeometry, pointInRing, ringProblems,
} from '@muslim-ummah/offline-navigation';
import { IJTEMA_BLOCK_GEOMETRY } from '../data/ijtema/blockAccess';
import { IJTEMA_BLOCKS } from '../data/ijtema/blocks';
import { IJTEMA_GATES } from '../data/ijtema/gates';
import { buildKarachiPlaceCatalog, buildKarachiVenueGeometry } from '../data/ijtema/packResources';
import { IJTEMA_VENUE_SOURCE as SOURCE } from '../data/ijtema/venueAdapter';

const BOUNDS = { west: 66.9974, south: 24.963, east: 67.0155, north: 24.9758 };
const placeIds = new Set(SOURCE.placeIds());
const nodeIds = new Set(SOURCE.graph.nodeIds());
const geometryText = JSON.stringify(buildKarachiVenueGeometry());
const catalogText = JSON.stringify(buildKarachiPlaceCatalog());
const geo = parsePackVenueGeometry(geometryText, { venueId: SOURCE.venueId, bounds: BOUNDS, placeIds, nodeIds });
const cat = parsePackPlaceCatalog(catalogText, { venueId: SOURCE.venueId, bounds: BOUNDS, nodeIds, languages: ['en', 'ur', 'ur-Latn'] });

describe('Karachi geometry resource', () => {
  it('parses strictly: 42 block polygons, centres, gate points, 11 rastas and 3 special routes, nothing invented', () => {
    expect(geo.ok ? '' : geo.error.message).toBe('');
    if (!geo.ok) return;
    const count = (role: string) => geo.geometry.features.filter((f) => f.role === role).length;
    expect({ block: count('block'), centers: count('block-center'), access: count('access-point'), gates: count('gate'), rastas: count('rasta'), special: count('special-route'), facility: count('facility'), tent: count('tent'), boundary: count('venue-boundary') })
      .toEqual({ block: 42, centers: 42, access: 168, gates: IJTEMA_GATES.filter((g) => g.coordinate).length, rastas: 11, special: 3, facility: 0, tent: 0, boundary: 0 });
  });
  it('keeps every surveyed coordinate exactly: centres, corners (as access aliases) and polygon vertices', () => {
    if (!geo.ok) throw new Error('geometry did not parse');
    for (const b of IJTEMA_BLOCKS) {
      expect(geo.geometry.byId.get(`${b.id}#center`)).toMatchObject({ point: b.center });
      for (const [i, key] of (['c1', 'c2', 'c3', 'c4'] as const).entries()) expect(geo.geometry.byId.get(`${b.id}#${key.toUpperCase()}`)).toMatchObject({ point: b.corners[key], nodeId: `${b.id}_C${i + 1}` });
      const ring = geo.geometry.byId.get(b.id);
      expect(ring && ring.shape === 'polygon' ? ring.ring.length : 0).toBe(4);
    }
  });
  it('labels every corner-derived access point LEGACY_UNVERIFIED and has no verified entrance anywhere', () => {
    if (!geo.ok) throw new Error('geometry did not parse');
    const access = geo.geometry.features.filter((f) => f.role === 'access-point');
    expect(access.every((f) => f.shape === 'point' && f.verification === 'LEGACY_UNVERIFIED')).toBe(true);
    for (const m of IJTEMA_BLOCK_GEOMETRY.values()) expect(m.verifiedAccessPoints).toEqual([]);
  });
  it('every boundary is a simple counter-clockwise ring that contains its own centre', () => {
    for (const m of IJTEMA_BLOCK_GEOMETRY.values()) {
      expect(ringProblems(m.boundary)).toEqual([]);
      expect(pointInRing(m.referenceCenter, m.boundary)).toBe(true);
    }
  });
});

describe('Karachi catalog', () => {
  it('parses; blocks are provisional-access, reachable gates routable, Gates 18 and 19 unreachable but still known', () => {
    expect(cat.ok ? '' : cat.error.message).toBe('');
    if (!cat.ok) return;
    const c = createPlaceCatalog(cat.catalog);
    expect(c.list()).toHaveLength(60);
    expect(availabilityOf(c.get('B7')!)).toMatchObject({ status: 'provisional', message: 'provisional_access', reason: 'LEGACY_BOUNDARY_ACCESS', canRoute: true });
    expect(availabilityOf(c.get('GATE_12')!)).toMatchObject({ status: 'routable', canRoute: true });
    for (const id of ['GATE_18', 'GATE_19']) {
      expect(availabilityOf(c.get(id)!)).toMatchObject({ status: 'unreachable', message: 'unreachable', reason: 'NO_VERIFIED_CONNECTOR', canRoute: false });
      expect(c.get(id)!.coordinate).toBeDefined(); // identity and position preserved, only the route is withheld
    }
  });
  it('is searchable in English, Urdu and Roman Urdu independent of UI language', () => {
    if (!cat.ok) throw new Error('catalog did not parse');
    const c = createPlaceCatalog(cat.catalog);
    expect(c.search('block 12')[0].place.id).toBe('B12');
    expect(c.search('بلاک 12')[0].place.id).toBe('B12');
    expect(c.search('gate 12').map((h) => h.place.id)).toContain('GATE_12');
    expect(c.search('', { categories: ['gate'] })).toHaveLength(18);
  });
});

describe('destination pin versus route endpoint, every block', () => {
  it('Gate 12 to each of the 42 blocks: the pin is the centre, the endpoint is a labelled legacy boundary point, arrival is judged at the endpoint', () => {
    if (!geo.ok || !cat.ok) throw new Error('resources did not parse');
    const catalog = createPlaceCatalog(cat.catalog);
    const start = SOURCE.getPlace('GATE_12')!.nodeIds;
    let offsetFromFirstCorner = 0;
    const offsets: number[] = [];
    for (const b of IJTEMA_BLOCKS) {
      const route = findBestVenuePath(SOURCE.graph, start, SOURCE.getPlace(b.id)!.nodeIds);
      expect(route).toBeDefined();
      const endId = route!.nodes[route!.nodes.length - 1];
      const d = describeDestination(b.id, endId, SOURCE.graph.getNode(endId)!.coordinate, geo.geometry, catalog);
      expect(d.marker).toEqual(b.center);
      expect(d.endpointKind).toBe('legacy-boundary');
      expect(d.provisional).toBe(true);
      expect(d.endpoint).toEqual(SOURCE.graph.getNode(endId)!.coordinate);
      offsets.push(d.offsetM!);
      if (endId !== `${b.id}_C1`) offsetFromFirstCorner++;
    }
    expect(Math.max(...offsets)).toBeLessThan(200);
    // The old pin (the first graph node, C1) disagreed with where the route really ended for most blocks; the new model has no such ambiguity.
    expect(offsetFromFirstCorner).toBeGreaterThan(30);
  });
  it('a gate destination is its own endpoint, not provisional', () => {
    if (!geo.ok || !cat.ok) throw new Error('resources did not parse');
    const catalog = createPlaceCatalog(cat.catalog);
    const gate = SOURCE.graph.getNode('GATE_13')!.coordinate;
    const d = describeDestination('GATE_13', 'GATE_13', gate, geo.geometry, catalog);
    expect(d).toMatchObject({ endpointKind: 'gate', provisional: false });
  });
});

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { createPlaceCatalog, parsePackPlaceCatalog, parsePackVenueGeometry, REQUIRED_PACK_RESOURCE_KINDS, PACK_RESOURCE_KINDS } from '@muslim-ummah/offline-navigation';

const BOUNDS = { west: 67.0, south: 24.96, east: 67.01, north: 24.98 };
const ccw = [[67.001, 24.97], [67.002, 24.97], [67.002, 24.971], [67.001, 24.971], [67.001, 24.97]];
const feat = (id: string, kind: string, geometry: unknown, extra: Record<string, unknown> = {}) => ({ type: 'Feature', id, geometry, properties: { kind, ...extra } });
const poly = (id: string, coordinates: unknown = [ccw], extra: Record<string, unknown> = { placeId: 'B1' }) => feat(id, 'block', { type: 'Polygon', coordinates }, extra);
const geo = (features: unknown[], venueId = 'v') => JSON.stringify({ schemaVersion: 1, venueId, type: 'FeatureCollection', features });
const parseGeo = (features: unknown[], expected = {}) => parsePackVenueGeometry(geo(features), { venueId: 'v', bounds: BOUNDS, ...expected });
const errOf = (r: { ok: boolean; error?: { message: string; path?: string } }) => (r.ok ? 'OK' : `${r.error!.path}: ${r.error!.message}`);

describe('pack resource kinds', () => {
  it('geometry and catalog are optional additions: version-1 packs without them stay valid', () => {
    expect(PACK_RESOURCE_KINDS).toEqual(expect.arrayContaining(['venue-geometry', 'place-catalog']));
    expect(REQUIRED_PACK_RESOURCE_KINDS).not.toContain('venue-geometry');
    expect(REQUIRED_PACK_RESOURCE_KINDS).not.toContain('place-catalog');
    expect(REQUIRED_PACK_RESOURCE_KINDS).toHaveLength(6);
  });
});

describe('parsePackVenueGeometry', () => {
  it('accepts blocks, centres, access points, gates, lines and facilities, with [lng, lat] order', () => {
    const r = parseGeo([
      poly('B1'),
      feat('B1#c', 'block-center', { type: 'Point', coordinates: [67.0015, 24.9705] }, { placeId: 'B1' }),
      feat('B1#a1', 'access-point', { type: 'Point', coordinates: [67.001, 24.97] }, { blockId: 'B1', verification: 'LEGACY_UNVERIFIED', nodeId: 'B1_C1' }),
      feat('G1', 'gate', { type: 'Point', coordinates: [67.003, 24.969] }, { placeId: 'G1', status: 'provided' }),
      feat('R1', 'rasta', { type: 'MultiLineString', coordinates: [[[67.0, 24.965], [67.004, 24.966]]] }, { label: 'Rasta 1' }),
      feat('W1', 'facility', { type: 'Point', coordinates: [67.005, 24.972] }, { facilityKind: 'water' }),
    ], { placeIds: new Set(['B1', 'G1']), nodeIds: new Set(['B1_C1']) });
    expect(errOf(r)).toBe('OK');
    if (r.ok) {
      expect(r.geometry.features).toHaveLength(6);
      const c = r.geometry.byId.get('B1#c');
      expect(c).toMatchObject({ point: { lat: 24.9705, lng: 67.0015 } });
    }
  });
  it('refuses a polygon that is open, clockwise, self-intersecting, holed, or not a block with an owner', () => {
    expect(errOf(parseGeo([poly('B1', [ccw.slice(0, -1)])]))).toMatch(/closed/);
    expect(errOf(parseGeo([poly('B1', [[...ccw].reverse()])]))).toMatch(/counter-clockwise/);
    expect(errOf(parseGeo([poly('B1', [[[67.001, 24.97], [67.002, 24.971], [67.002, 24.97], [67.001, 24.971], [67.001, 24.97]]])]))).toMatch(/self-intersecting/);
    expect(errOf(parseGeo([poly('B1', [ccw, ccw])]))).toMatch(/exactly one exterior ring/);
    expect(errOf(parseGeo([poly('B1', [ccw], { })]))).toMatch(/needs properties\.placeId/);
  });
  it('refuses swapped, zero, out-of-venue and non-finite positions, naming the feature and position', () => {
    const point = (coordinates: unknown) => feat('P', 'facility', { type: 'Point', coordinates }, { facilityKind: 'water' });
    expect(errOf(parseGeo([point([24.97, 67.004])]))).toMatch(/features\[0\]\.geometry\.coordinates.*swapped/);
    expect(errOf(parseGeo([point([0, 0])]))).toMatch(/null-island/);
    expect(errOf(parseGeo([point([71.5, 29.4])]))).toMatch(/outside-bounds/);
    expect(errOf(parseGeo([point([67.004])]))).toMatch(/\[longitude, latitude\]/);
  });
  it('refuses unknown kinds and fields, duplicate ids, wrong venue, unknown places/nodes, and an unlabeled access point', () => {
    expect(errOf(parseGeo([feat('X', 'tent-city', { type: 'Point', coordinates: [67.004, 24.97] })]))).toMatch(/unknown feature kind/);
    expect(errOf(parseGeo([feat('X', 'facility', { type: 'Point', coordinates: [67.004, 24.97] }, { surprise: 1 })]))).toMatch(/unknown field 'surprise'/);
    expect(errOf(parseGeo([poly('B1'), poly('B1')]))).toMatch(/duplicate feature id/);
    expect(errOf(parsePackVenueGeometry(geo([], 'other'), { venueId: 'v' }))).toMatch(/not 'v'/);
    expect(errOf(parseGeo([poly('B1')], { placeIds: new Set(['B2']) }))).toMatch(/not a place of this venue/);
    expect(errOf(parseGeo([feat('A', 'access-point', { type: 'Point', coordinates: [67.004, 24.97] }, { blockId: 'B1', verification: 'VERIFIED', nodeId: 'nope' })], { nodeIds: new Set(['n']) }))).toMatch(/not a node/);
    expect(errOf(parseGeo([feat('A', 'access-point', { type: 'Point', coordinates: [67.004, 24.97] }, { blockId: 'B1' })]))).toMatch(/VERIFIED or LEGACY_UNVERIFIED/);
    expect(errOf(parsePackVenueGeometry(JSON.stringify({ schemaVersion: 2, venueId: 'v', type: 'FeatureCollection', features: [] })))).toMatch(/unsupported schemaVersion/);
    expect(errOf(parsePackVenueGeometry('{"schemaVersion":1,"schemaVersion":1}'))).toMatch(/strict JSON/);
  });
});

const catalogDoc = (places: unknown[], venueId = 'v') => JSON.stringify({ schemaVersion: 1, venueId, places });
const base = { names: { en: 'X' }, nodeIds: [], provenance: { source: 'test' } };
const place = (o: Record<string, unknown>) => ({ ...base, category: 'ilaqa', ...o });
const parseCat = (places: unknown[], expected = {}) => parsePackPlaceCatalog(catalogDoc(places), { venueId: 'v', bounds: BOUNDS, languages: ['en', 'ur', 'ur-Latn'], ...expected });
const catErr = (r: ReturnType<typeof parseCat>) => (r.ok ? 'OK' : `${r.error.path}: ${r.error.message}`);

describe('parsePackPlaceCatalog', () => {
  it('accepts a pending ilaqa with no coordinate or node, a located tent, a routable block and an unreachable located gate', () => {
    const r = parseCat([
      place({ id: 'ILAQA_1', location: 'pending', routing: 'not-located', routingReason: 'LOCATION_PENDING', marhala: 1, flags: ['NEEDS_REVIEW'], names: { en: 'Ilaqa One', ur: 'علاقہ ایک' } }),
      place({ id: 'B1', category: 'block', location: 'provisional', routing: 'provisional', routingReason: 'LEGACY_BOUNDARY_ACCESS', coordinate: { lat: 24.9705, lng: 67.0015 }, nodeIds: ['B1_C1'] }),
      place({ id: 'TENT_1', category: 'tent', parentId: 'ILAQA_1', blockId: 'B1', location: 'verified', routing: 'routable', coordinate: { lat: 24.9704, lng: 67.0014 }, nodeIds: ['B1_C1'] }),
      place({ id: 'GATE_18', category: 'gate', location: 'verified', routing: 'unreachable', routingReason: 'NO_VERIFIED_CONNECTOR', coordinate: { lat: 24.965, lng: 67.002 }, nodeIds: ['GATE_18'] }),
    ], { nodeIds: new Set(['B1_C1', 'GATE_18']) });
    expect(catErr(r)).toBe('OK');
    if (r.ok) expect(r.catalog.byId.get('ILAQA_1')).toMatchObject({ location: 'pending', routing: 'not-located', marhala: 1, nodeIds: [] });
  });
  it('never lets a pending place carry a coordinate or node, and keeps not-located separate from unreachable', () => {
    expect(catErr(parseCat([place({ id: 'A', location: 'pending', routing: 'not-located', routingReason: 'X', coordinate: { lat: 24.97, lng: 67.004 } })]))).toMatch(/pending.*no coordinate/);
    expect(catErr(parseCat([place({ id: 'A', location: 'pending', routing: 'unreachable', routingReason: 'X' })]))).toMatch(/pending/);
    expect(catErr(parseCat([place({ id: 'A', location: 'verified', routing: 'not-located', routingReason: 'X', coordinate: { lat: 24.97, lng: 67.004 } })]))).toMatch(/not-located/);
    expect(catErr(parseCat([place({ id: 'A', location: 'verified', routing: 'routable', coordinate: { lat: 24.97, lng: 67.004 } })]))).toMatch(/at least one graph node/);
    expect(catErr(parseCat([place({ id: 'A', location: 'provisional', routing: 'unreachable' , coordinate: { lat: 24.97, lng: 67.004 } })]))).toMatch(/must say why/);
  });
  it('refuses bad coordinates, unknown nodes/categories/languages/flags, duplicate ids, bad parents and a wrong venue', () => {
    const located = { location: 'verified', routing: 'unreachable', routingReason: 'X' };
    expect(catErr(parseCat([place({ id: 'A', ...located, coordinate: { lat: 67.004, lng: 24.97 } })]))).toMatch(/swapped/);
    expect(catErr(parseCat([place({ id: 'A', ...located, coordinate: { lat: 0, lng: 0 } })]))).toMatch(/null-island/);
    expect(catErr(parseCat([place({ id: 'A', location: 'pending', routing: 'not-located', routingReason: 'X', nodeIds: ['nope'] })], { nodeIds: new Set(['n']) }))).toMatch(/unknown graph node/);
    expect(catErr(parseCat([place({ id: 'A', category: 'spaceship', location: 'pending', routing: 'not-located', routingReason: 'X' })]))).toMatch(/unknown category/);
    expect(catErr(parseCat([place({ id: 'A', location: 'pending', routing: 'not-located', routingReason: 'X', names: { en: 'A', fr: 'A' } })]))).toMatch(/not declared/);
    expect(catErr(parseCat([place({ id: 'A', location: 'pending', routing: 'not-located', routingReason: 'X', flags: ['LOVELY'] })]))).toMatch(/unknown flag/);
    const pend = { location: 'pending', routing: 'not-located', routingReason: 'X' };
    expect(catErr(parseCat([place({ id: 'A', ...pend }), place({ id: 'A', ...pend })]))).toMatch(/duplicate place id/);
    expect(catErr(parseCat([place({ id: 'A', ...pend, parentId: 'ghost' })]))).toMatch(/not another place/);
    expect(catErr(parseCat([place({ id: 'A', ...pend, blockId: 'A' })]))).toMatch(/not a block/);
    expect(catErr(parsePackPlaceCatalog(catalogDoc([], 'other'), { venueId: 'v' }))).toMatch(/not 'v'/);
    expect(catErr(parseCat([place({ id: 'A', ...pend, surprise: true })]))).toMatch(/unknown field 'surprise'/);
  });
  it('keeps duplicate names as separate records (identity is the id, never the name)', () => {
    const pend = { location: 'pending', routing: 'not-located', routingReason: 'LOCATION_PENDING', flags: ['DUPLICATE_NAME', 'NEEDS_REVIEW'] };
    const r = parseCat([place({ id: 'ILAQA_5', ...pend, names: { en: 'Same Name' } }), place({ id: 'ILAQA_29', ...pend, names: { en: 'Same Name' } })]);
    expect(catErr(r)).toBe('OK');
    if (r.ok) expect(r.catalog.places.map((p) => p.id)).toEqual(['ILAQA_5', 'ILAQA_29']);
  });
});

describe('catalog search ranking', () => {
  // A name with no letters or digits folds to nothing; it must not shift which entries count as a place's NAMES.
  it('an alias never outranks a real name because another name folded to nothing', () => {
    const place = (id: string, names: Record<string, string>, aliases: string[]) => ({
      id, category: 'facility', names, aliases, location: 'verified', routing: 'routable', coordinate: { lat: 24.97, lng: 67.001 },
      nodeIds: [id], provenance: { source: 'test' }, flags: [],
    });
    const parsed = parsePackPlaceCatalog(JSON.stringify({
      schemaVersion: 1, venueId: 'v', places: [place('a', { en: 'Main Gate', ur: '--' }, ['Foo']), place('b', { en: 'Foo' }, [])],
    }));
    if (!parsed.ok) throw new Error(parsed.error.message);
    const hits = createPlaceCatalog(parsed.catalog).search('foo');
    expect(hits.map((h) => [h.place.id, h.rank])).toEqual([['b', 3], ['a', 2]]);
  });
});

// Production-scale review 2026-11-10.
describe('catalog search: an exact alias breaks a tie inside a rank', () => {
  it('"block three" is Block 3 before Block 23 and Block 33 on the Karachi catalog', () => {
    const { buildKarachiPlaceCatalog } = require('../data/ijtema/packResources');
    const parsed = parsePackPlaceCatalog(JSON.stringify(buildKarachiPlaceCatalog()));
    if (!parsed.ok) throw new Error(parsed.error.message);
    const c = createPlaceCatalog(parsed.catalog);
    expect(c.search('block three').map((h) => h.place.id).slice(0, 3)).toEqual(['B3', 'B23', 'B33']);
    expect(c.search('block three')[0].rank).toBe(2); // the rank values themselves are unchanged
    expect(c.search('G12')[0].place.id).toBe('GATE_12');
  });
});

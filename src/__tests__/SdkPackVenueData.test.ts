/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// C5.2: the loader that turns a pack's graph + place files into a VenueDataSource. Pack files are untrusted until proven by the
// verifier, but the parser is still strict: a hostile or damaged file must produce an error, never a half-built venue.
import { parsePackVenueData } from '@muslim-ummah/offline-navigation';

const graph = (patch: Record<string, unknown> = {}): string => JSON.stringify({
  schemaVersion: 1, venueId: 'v', dataVersion: 'd1',
  nodes: [{ id: 'a', lat: 24.97, lng: 67.0 }, { id: 'b', lat: 24.971, lng: 67.0 }],
  edges: [{ from: 'a', to: 'b', distanceM: 111 }, { from: 'b', to: 'a', distanceM: 111, weightMultiplier: 2 }],
  ...patch,
});
const places = (patch: Record<string, unknown> = {}): string => JSON.stringify({
  schemaVersion: 1, venueId: 'v', places: [{ id: 'p', kind: 'room', nodeIds: ['a', 'b'] }], ...patch,
});
const bad = (g: string, p: string, needle: string): void => {
  const r = parsePackVenueData(g, p);
  expect(r.ok).toBe(false);
  if (!r.ok) expect(`${r.error.message} ${r.error.path ?? ''}`).toContain(needle);
};

describe('parsePackVenueData', () => {
  it('builds a read-only venue that preserves node order, edge order and weights', () => {
    const r = parsePackVenueData(graph(), places());
    if (!r.ok) throw new Error(r.error.message);
    const v = r.source;
    expect(v.venueId).toBe('v');
    expect(v.dataVersion).toBe('d1');
    expect(v.graph.nodeIds()).toEqual(['a', 'b']);
    expect(v.graph.getNode('a')?.coordinate).toEqual({ lat: 24.97, lng: 67.0 });
    expect(v.graph.edgesFrom('b')).toEqual([{ to: 'a', distanceM: 111, weightMultiplier: 2 }]);
    expect(v.graph.edgesFrom('a')[0].weightMultiplier).toBeUndefined();
    expect(v.graph.edgesFrom('missing')).toEqual([]);
    expect(v.placeIds()).toEqual(['p']);
    expect(v.getPlace('p')).toEqual({ id: 'p', kind: 'room', nodeIds: ['a', 'b'] });
    expect(v.getPlace('nope')).toBeUndefined();
  });

  it('is safe against prototype-shaped ids: they are plain unknown ids, never reached through Object lookups', () => {
    const r = parsePackVenueData(graph(), places());
    if (!r.ok) throw new Error(r.error.message);
    for (const id of ['constructor', 'toString', 'hasOwnProperty', '__defineGetter__']) {
      expect(r.source.graph.getNode(id)).toBeUndefined();
      expect(r.source.graph.edgesFrom(id)).toEqual([]);
      expect(r.source.getPlace(id)).toBeUndefined();
    }
    const odd = parsePackVenueData(graph({ nodes: [{ id: 'constructor', lat: 1, lng: 1 }, { id: 'b', lat: 2, lng: 2 }], edges: [{ from: 'constructor', to: 'b', distanceM: 5 }] }), places({ places: [{ id: 'toString', kind: 'k', nodeIds: ['constructor'] }] }));
    expect(odd.ok).toBe(true);
    if (odd.ok) expect(odd.source.graph.getNode('constructor')?.id).toBe('constructor');
  });

  it('rejects malformed JSON, duplicate keys and __proto__ keys', () => {
    bad('{ nope', places(), 'JSON');
    bad(graph().replace('"venueId":"v"', '"venueId":"v","venueId":"w"'), places(), 'duplicate');
    bad(graph().replace('{"id":"a"', '{"__proto__":{},"id":"a"'), places(), 'forbidden key');
  });

  it('rejects the wrong schema, unknown fields, and a venue that disagrees between the two files', () => {
    bad(graph({ schemaVersion: 2 }), places(), 'schemaVersion');
    bad(graph({ extra: 1 }), places(), 'extra');
    bad(graph(), places({ venueId: 'other' }), 'venue');
    bad(graph(), places({ schemaVersion: 9 }), 'schemaVersion');
  });

  it('rejects an expected venue that does not match', () => {
    const r = parsePackVenueData(graph(), places(), 'someone-else');
    expect(r.ok).toBe(false);
  });

  it('rejects duplicate node ids, edges to unknown nodes, and places on unknown nodes', () => {
    bad(graph({ nodes: [{ id: 'a', lat: 1, lng: 1 }, { id: 'a', lat: 2, lng: 2 }] }), places(), 'duplicate');
    bad(graph({ edges: [{ from: 'a', to: 'zzz', distanceM: 5 }] }), places(), 'zzz');
    bad(graph({ edges: [{ from: 'zzz', to: 'a', distanceM: 5 }] }), places(), 'zzz');
    bad(graph(), places({ places: [{ id: 'p', kind: 'room', nodeIds: ['a', 'ghost'] }] }), 'ghost');
    bad(graph(), places({ places: [{ id: 'p', kind: 'room', nodeIds: ['a'] }, { id: 'p', kind: 'room', nodeIds: ['b'] }] }), 'duplicate');
    bad(graph(), places({ places: [{ id: 'p', kind: 'room', nodeIds: [] }] }), 'nodeIds');
  });

  it('rejects coordinates, distances and weights that would corrupt routing', () => {
    bad(graph({ nodes: [{ id: 'a', lat: 91, lng: 0 }, { id: 'b', lat: 0, lng: 0 }] }), places(), 'lat');
    bad(graph({ nodes: [{ id: 'a', lat: 0, lng: 181 }, { id: 'b', lat: 0, lng: 0 }] }), places(), 'lng');
    bad(graph({ nodes: [{ id: 'a', lat: '1', lng: 0 }, { id: 'b', lat: 0, lng: 0 }] }), places(), 'lat');
    for (const distanceM of [0, -3, '5', null]) bad(graph({ edges: [{ from: 'a', to: 'b', distanceM }] }), places(), 'distanceM');
    for (const weightMultiplier of [0, -1, '2']) bad(graph({ edges: [{ from: 'a', to: 'b', distanceM: 5, weightMultiplier }] }), places(), 'weightMultiplier');
  });

  it('rejects ids that are empty, oversized or contain control characters', () => {
    bad(graph({ nodes: [{ id: '', lat: 1, lng: 1 }] }), places(), 'id');
    bad(graph({ nodes: [{ id: 'x'.repeat(300), lat: 1, lng: 1 }] }), places(), 'id');
    bad(graph({ nodes: [{ id: 'a\u0000b', lat: 1, lng: 1 }] }), places(), 'id');
  });
});

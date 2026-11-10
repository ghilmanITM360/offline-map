/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Coordinate and translation validation in the shared venue-data checker (the one compile and verify both call).
import { checkVenueData } from '../../scripts/sdk-pack/cli';

const BOUNDS = { west: 67.0, south: 24.96, east: 67.01, north: 24.98 };
const KINDS = ['map-archive', 'routing-graph', 'place-directory', 'gate-metadata', 'localization', 'provenance'] as const;
const FILES: Record<string, string> = { 'map-archive': 'map.pmtiles', 'routing-graph': 'g.json', 'place-directory': 'p.json', 'gate-metadata': 'gm.json', localization: 'l.json', provenance: 'pr.json' };
const spec = (languages = ['en', 'ur']) => ({ venueId: 'v', languages, bounds: BOUNDS, resources: KINDS.map((kind) => ({ kind, path: FILES[kind] })) });

interface Opts { nodes?: Array<{ id: string; lat: number; lng: number }>; edges?: Array<{ from: string; to: string; distanceM: number }>; names?: Record<string, Record<string, string>>; gates?: unknown[]; bounds?: typeof BOUNDS; entries?: unknown[] }
const check = (o: Opts = {}) => {
  const nodes = o.nodes ?? [{ id: 'a', lat: 24.97, lng: 67.004 }, { id: 'b', lat: 24.9701, lng: 67.004 }];
  const edges = o.edges ?? [{ from: 'a', to: 'b', distanceM: 11.2 }, { from: 'b', to: 'a', distanceM: 11.2 }];
  const names = o.names ?? { a: { en: 'A', ur: 'الف' }, b: { en: 'B', ur: 'ب' } };
  const docs: Record<string, unknown> = {
    'g.json': { schemaVersion: 1, venueId: 'v', dataVersion: '1', nodes, edges },
    'p.json': { schemaVersion: 1, venueId: 'v', places: nodes.map((n) => ({ id: n.id, kind: 'block', nodeIds: [n.id] })) },
    'gm.json': { venueId: 'v', gates: o.gates ?? [] },
    'l.json': { venueId: 'v', entries: o.entries ?? Object.entries(names).map(([id, n]) => ({ id, names: n })) },
  };
  return checkVenueData((p) => JSON.stringify(docs[p]), { ...spec(), bounds: o.bounds ?? BOUNDS });
};

describe('checkVenueData coordinates', () => {
  it('accepts clean data with no findings', () => {
    expect(check()).toEqual({ errors: [], warnings: [], review: [] });
  });
  it('rejects swapped latitude/longitude and names the file, record and field', () => {
    const f = check({ nodes: [{ id: 'a', lat: 24.97, lng: 67.004 }, { id: 'b', lat: 67.004, lng: 24.9701 }] });
    expect(f.errors).toEqual([expect.stringMatching(/^g\.json: nodes\['b'\]\.lat\/lng \(67\.004, 24\.9701\) looks swapped/)]);
  });
  it('rejects (0, 0)', () => {
    const f = check({ nodes: [{ id: 'a', lat: 24.97, lng: 67.004 }, { id: 'b', lat: 0, lng: 0 }] });
    expect(f.errors.join('\n')).toMatch(/nodes\['b'\].*\(0, 0\)/);
  });
  it('rejects a far outlier and a point just outside the venue, but only against this venue\'s own bounds', () => {
    const far = check({ nodes: [{ id: 'a', lat: 24.97, lng: 67.004 }, { id: 'b', lat: 29.4, lng: 71.5 }] });
    expect(far.errors.join('\n')).toMatch(/nodes\['b'\].*outside the venue bounds/);
    const near = check({ nodes: [{ id: 'a', lat: 24.97, lng: 67.004 }, { id: 'b', lat: 24.9701, lng: 67.0101 }] });
    expect(near.errors.join('\n')).toMatch(/nodes\['b'\]/);
    const london = check({ bounds: { west: -0.2, south: 51.4, east: 0, north: 51.6 }, nodes: [{ id: 'a', lat: 51.5, lng: -0.1 }, { id: 'b', lat: 51.5001, lng: -0.1 }] });
    expect(london.errors).toEqual([]);
  });
  it('checks gate records too, and ignores a gate that honestly has no coordinate', () => {
    const f = check({ gates: [{ id: 'G1', lat: 24.97, lng: 67.004 }, { id: 'G2', lat: 67.004, lng: 24.97 }, { id: 'G3' }] });
    expect(f.errors).toEqual([expect.stringMatching(/^gm\.json: gates\[1\] \('G2'\)\.lat\/lng .* looks swapped/)]);
  });
  it('rejects venue bounds that are degenerate or contain (0, 0)', () => {
    expect(check({ bounds: { west: 67.01, south: 24.96, east: 67.0, north: 24.98 } }).errors.join('\n')).toMatch(/west must be less than east/);
    expect(check({ bounds: { west: -1, south: -1, east: 1, north: 1 }, nodes: [{ id: 'a', lat: 0.1, lng: 0.1 }, { id: 'b', lat: 0.2, lng: 0.2 }] }).errors.join('\n')).toMatch(/contain \(0, 0\)/);
  });
  it('warns about an isolated node and an edge far longer than the straight line, without blocking', () => {
    const f = check({ nodes: [{ id: 'a', lat: 24.97, lng: 67.004 }, { id: 'b', lat: 24.9701, lng: 67.004 }, { id: 'c', lat: 24.9702, lng: 67.004 }], edges: [{ from: 'a', to: 'b', distanceM: 900 }, { from: 'b', to: 'a', distanceM: 11 }] });
    expect(f.errors).toEqual([]);
    expect(f.warnings.join('\n')).toMatch(/nodes\['c'\] has no edges/);
    expect(f.warnings.join('\n')).toMatch(/edge a->b\.distanceM 900 m is over 4x/);
  });
});

describe('checkVenueData translations', () => {
  it('requires an English name (error), reports a missing declared language (warning) and an identical one (review)', () => {
    const f = check({ names: { a: { en: '', ur: 'الف' }, b: { en: 'B' } } });
    expect(f.errors).toEqual([expect.stringMatching(/l\.json: place 'a'\.names\.en is missing or empty/)]);
    expect(f.warnings).toEqual([expect.stringMatching(/place 'b'\.names\.ur is missing/)]);
    const same = check({ names: { a: { en: 'Block 1', ur: 'Block 1' }, b: { en: 'B', ur: 'ب' } } });
    expect(same.errors).toEqual([]);
    expect(same.review).toEqual([expect.stringMatching(/1 place\(s\) have names\.ur identical to names\.en .*: a$/)]);
  });
  it('warns when a place has no localization entry and errors on two entries for one place', () => {
    expect(check({ names: { a: { en: 'A', ur: 'الف' } } }).warnings.join('\n')).toMatch(/place 'b' has no localization entry/);
    const dup = check({ entries: [{ id: 'a', names: { en: 'A', ur: 'الف' } }, { id: 'a', names: { en: 'A2', ur: 'الف' } }, { id: 'b', names: { en: 'B', ur: 'ب' } }] });
    expect(dup.errors).toEqual([expect.stringMatching(/entries\[1\]\.id 'a' appears twice/)]);
  });
});

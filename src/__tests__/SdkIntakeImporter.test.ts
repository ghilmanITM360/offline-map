/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Client workbook / CSV / GeoJSON intake: validation, outcomes, identities, determinism. No real coordinates appear anywhere in this file.
import { importIntake, summarize, type Baseline, type Candidate, type Finding } from '../../scripts/sdk-pack/intake/importer';
import { parseCsv, readTable } from '../../scripts/sdk-pack/intake/table';
import { legacyIlaqaGrid } from '../../scripts/sdk-pack/intake/legacy';

const sq = (lng: number, lat: number, d = 0.001) => [{ lat, lng }, { lat, lng: lng + d }, { lat: lat + d, lng: lng + d }, { lat: lat + d, lng }];
const baseline: Baseline = {
  venueId: 'v', bounds: { west: 67.0, south: 24.96, east: 67.01, north: 24.98 }, languages: ['en', 'ur', 'ur-Latn'],
  blocks: [
    { id: 'B1', ring: sq(67.001, 24.97), nodeIds: ['B1_C1', 'B1_C2'] },
    { id: 'B2', ring: sq(67.003, 24.97), nodeIds: ['B2_C1'] },
    { id: 'B3', ring: sq(67.0035, 24.9705), nodeIds: ['B3_C1'] }, // overlaps B2 on purpose
  ],
  gates: new Map([['GATE_1', { lat: 24.965, lng: 67.002 }]]),
  catalogIds: new Map([['B1', { en: 'Block 1' }]]),
};

const H = {
  Ilaqas: ['ilaqa_id*', 'source_index', 'marhala*', 'name_ur*', 'name_ur_latn*', 'name_en*', 'catalog_status*', 'name_review*', 'client_notes', 'duplicate_group'],
  Tents: ['tent_id*', 'ilaqa_id*', 'tent_label', 'latitude', 'longitude', 'survey_method', 'accuracy_m', 'surveyed_on', 'surveyed_by', 'status*', 'block_id_hint', 'access_id_hint', 'evidence_ref', 'entry_check'],
  Facilities: ['facility_id*', 'facility_kind*', 'name_ur', 'name_ur_latn', 'name_en*', 'latitude', 'longitude', 'survey_method', 'accuracy_m', 'surveyed_on', 'surveyed_by', 'status*', 'block_id_hint'],
  Access_Points: ['access_id*', 'parent_type*', 'parent_id*', 'role*', 'latitude', 'longitude', 'survey_method', 'accuracy_m', 'surveyed_on', 'surveyed_by', 'status*'],
  Gates_Changes: ['gate_id*', 'proposed_latitude', 'proposed_longitude', 'change_reason*', 'review_status*'],
  Blocks_Changes: ['block_id*', 'update_type*', 'proposed_name_en', 'proposed_name_ur', 'center_latitude', 'center_longitude', 'geometry_file_id', 'change_reason*', 'review_status*'],
  Geometry_Files: ['geometry_file_id*', 'filename*', 'geometry_type*', 'related_entity_ids', 'review_status*'],
  Metadata: ['field', 'client_entry', 'required?'],
} as const;
type Sheet = keyof typeof H;
/** A sheet in the template's shape: a title block, then the header on row 6, then rows given by column name. */
const sheet = (name: Sheet, ...rows: Array<Record<string, string>>): string[][] => {
  const headers = H[name].map((h) => h.replace('*', ''));
  const title = name === 'Metadata' ? [] : [['TITLE'], [''], ['note'], [''], ['']];
  return [...title, [...H[name]], ...rows.map((r) => headers.map((h) => r[h] ?? ''))];
};
const meta = (extra: Record<string, string> = {}) => sheet('Metadata', ...Object.entries({ venue_id: 'v', dataset_version: '1', data_owner: 'o', rights_holder: 'o', distribution_authority: 'a', submitted_by: 's', submitted_on: '2026-01-01', redistribution_allowed: 'Yes', coordinate_system: 'WGS84', ...extra }).map(([field, client_entry]) => ({ field, client_entry })));
const il = (id: string, en: string, over: Record<string, string> = {}) => ({ ilaqa_id: id, source_index: id.slice(-4), marhala: '1', name_ur: `${en}-ur`, name_ur_latn: `${en}-latn`, name_en: en, catalog_status: 'pending_location', name_review: 'approved', ...over });
const tent = (id: string, ilaqa: string, over: Record<string, string> = {}) => ({ tent_id: id, ilaqa_id: ilaqa, status: 'pending', ...over });
const run = (sheets: Partial<Record<Sheet, string[][]>>, geojson: Record<string, string> = {}, base = baseline): Candidate =>
  importIntake({ sheets: new Map(Object.entries({ Metadata: meta(), ...sheets })), geojson: new Map(Object.entries(geojson)), baseline: base, sources: [] });
const codes = (c: Candidate, severity?: Finding['severity']) => c.findings.filter((f) => !severity || f.severity === severity).map((f) => f.code);
const place = (c: Candidate, id: string) => c.catalogAdditions.find((p) => p.id === id) as Record<string, any>;

describe('outcomes', () => {
  it('ACCEPT_AS_PENDING: valid names and blank coordinates are pending, never zero, never located', () => {
    const c = run({ Ilaqas: sheet('Ilaqas', il('IL-1', 'Alpha'), il('IL-2', 'Beta')), Tents: sheet('Tents', tent('T-1', 'IL-1')) });
    expect(c.outcome).toBe('ACCEPT_AS_PENDING');
    expect(c.catalogAdditions.every((p) => p.location === 'pending' && p.routing === 'not-located' && (p.nodeIds as string[]).length === 0 && !('coordinate' in p))).toBe(true);
    expect(c.geometryAdditions).toEqual([]);
  });
  it('ACCEPT: a complete verified tent inside a block, with provenance', () => {
    const c = run({ Ilaqas: sheet('Ilaqas', il('IL-1', 'Alpha')), Tents: sheet('Tents', tent('T-1', 'IL-1', { latitude: '24.9705', longitude: '67.0015', status: 'verified', survey_method: 'rtk', accuracy_m: '0.5', surveyed_on: '2026-03-01', surveyed_by: 'Team A' })) });
    expect(codes(c, 'error')).toEqual([]);
    expect(c.outcome).toBe('ACCEPT_AS_PENDING'); // the ilaqa itself is still a named group with no point
    expect(place(c, 'T-1')).toMatchObject({ location: 'verified', blockId: 'B1', routing: 'provisional', routingReason: 'LEGACY_BOUNDARY_ACCESS', nodeIds: ['B1_C1', 'B1_C2'], parentId: 'IL-1' });
    expect(c.geometryAdditions).toEqual([{ type: 'Feature', id: 'T-1#point', geometry: { type: 'Point', coordinates: [67.0015, 24.9705] }, properties: { kind: 'tent', placeId: 'T-1' } }]);
  });
  it('NEEDS_REVIEW: duplicate names stay separate records, flagged, with a review finding', () => {
    const c = run({ Ilaqas: sheet('Ilaqas', il('IL-5', 'Same', { name_review: 'duplicate_name_review' }), il('IL-29', 'Same', { name_review: 'duplicate_name_review' })) });
    expect(c.outcome).toBe('NEEDS_REVIEW');
    expect(c.catalogAdditions.map((p) => p.id)).toEqual(['IL-29', 'IL-5']);
    expect(place(c, 'IL-5').flags).toEqual(['DUPLICATE_NAME', 'NEEDS_REVIEW']);
    expect(codes(c, 'review')).toContain('DUPLICATE_NAME');
  });
  it('the placeholder row keeps its identity but is not offered in search', () => {
    const c = run({ Ilaqas: sheet('Ilaqas', il('IL-0047', 'Real'), { ...il('IL-0048', '—'), name_ur: '—', name_ur_latn: '—', name_review: 'missing_name' }) });
    expect(c.catalogAdditions.map((p) => p.id)).toEqual(['IL-0047']);
    expect(c.identities).toEqual([{ id: 'IL-0047', kind: 'ilaqa', status: 'included' }, { id: 'IL-0048', kind: 'ilaqa', status: 'excluded', reason: 'PLACEHOLDER' }]);
    expect(codes(c, 'review')).toContain('PLACEHOLDER_NAME');
  });
  it('unreviewed translations are labelled drafts, never presented as approved', () => {
    const c = run({ Ilaqas: sheet('Ilaqas', il('IL-1', 'A', { name_review: 'unreviewed' }), il('IL-2', 'B', { name_review: 'approved' })) });
    expect(place(c, 'IL-1').flags).toContain('DRAFT_TRANSLATION');
    expect(place(c, 'IL-2').flags).toEqual([]);
    expect(c.outcome).toBe('ACCEPT_AS_PENDING'); // drafts are labelled, not blocking
  });
  it('REJECT carries no records, so nothing half-valid can be merged', () => {
    const c = run({ Ilaqas: sheet('Ilaqas', il('IL-1', 'A')), Tents: sheet('Tents', tent('T-1', 'IL-1', { latitude: '24.97', longitude: '' })) });
    expect(c.outcome).toBe('REJECT');
    expect(c.catalogAdditions).toEqual([]);
    expect(c.geometryAdditions).toEqual([]);
  });
  it('rights: unconfirmed redistribution marks the result internal-only', () => {
    expect(run({ Ilaqas: sheet('Ilaqas', il('IL-1', 'A')) }).distribution).toBe('distribution-authorized');
    const c = run({ Ilaqas: sheet('Ilaqas', il('IL-1', 'A')), Metadata: meta({ redistribution_allowed: 'Unconfirmed' }) });
    expect(c.distribution).toBe('internal-only');
    expect(codes(c, 'review')).toContain('RIGHTS_UNCONFIRMED');
  });
});

describe('coordinates', () => {
  const withPoint = (lat: string, lng: string, over: Record<string, string> = {}) => run({ Ilaqas: sheet('Ilaqas', il('IL-1', 'A')), Tents: sheet('Tents', tent('T-1', 'IL-1', { latitude: lat, longitude: lng, status: 'proposed', ...over })) });
  it('rejects malformed, swapped, zero and far-outlier coordinates, naming sheet, row and field', () => {
    for (const [lat, lng, code] of [['abc', '67.001', 'COORDINATE_FORMAT'], ['67.0015', '24.9705', 'COORDINATE_SWAPPED'], ['0', '0', 'COORDINATE_NULL_ISLAND'], ['29.4', '71.5', 'COORDINATE_OUTSIDE_BOUNDS'], ['24,97', '67.001', 'COORDINATE_FORMAT'], ['91', '67', 'COORDINATE_OUT_OF_WGS84'], ['24.97', '', 'COORDINATE_PAIR']] as const) {
      const c = withPoint(lat, lng);
      expect({ lat, lng, errors: codes(c, 'error') }).toEqual({ lat, lng, errors: [code] });
    }
    const f = withPoint('67.0015', '24.9705').findings.find((x) => x.severity === 'error')!;
    expect(f).toMatchObject({ sheet: 'Tents', row: 7, field: 'latitude' });
    expect(f.message).toMatch(/looks swapped: latitude comes first/);
  });
  it('accepts the owner\'s historical "Logitude" header as an alias of longitude', () => {
    const tents = sheet('Tents', tent('T-1', 'IL-1', { latitude: '24.9705', longitude: '67.0015', status: 'proposed' }));
    tents[5] = tents[5].map((h) => (h === 'longitude' ? 'Logitude' : h));
    const c = run({ Ilaqas: sheet('Ilaqas', il('IL-1', 'A')), Tents: tents });
    expect(place(c, 'T-1').coordinate).toEqual({ lat: 24.9705, lng: 67.0015 });
  });
  it('block assignment: inside, boundary, ambiguous, outside; the hint never overrides the geometry', () => {
    const at = (lat: string, lng: string, over: Record<string, string> = {}) => withPoint(lat, lng, over);
    expect(place(at('24.9705', '67.0015'), 'T-1')).toMatchObject({ blockId: 'B1' });
    const boundary = at('24.9705', '67.00099995');
    expect(codes(boundary, 'review')).toContain('BLOCK_BOUNDARY');
    const ambiguous = at('24.9708', '67.0037');
    expect(codes(ambiguous, 'review')).toContain('BLOCK_AMBIGUOUS');
    expect(place(ambiguous, 'T-1').blockId).toBeUndefined();
    expect(place(ambiguous, 'T-1')).toMatchObject({ routing: 'unreachable', routingReason: 'NO_VERIFIED_CONNECTOR', nodeIds: [] });
    const outside = at('24.975', '67.008');
    expect(codes(outside, 'warning')).toContain('OUTSIDE_ALL_BLOCKS');
    expect(place(outside, 'T-1')).toMatchObject({ location: 'provisional', routing: 'unreachable' });
    const mismatch = at('24.9705', '67.0015', { block_id_hint: 'B2' });
    expect(place(mismatch, 'T-1').blockId).toBe('B1');
    expect(codes(mismatch, 'review')).toContain('BLOCK_HINT_MISMATCH');
  });
  it('survey provenance: verified/surveyed need method, date and surveyor; proposed only warns; a bad method or accuracy is an error', () => {
    expect(codes(withPoint('24.9705', '67.0015', { status: 'verified' }), 'error')).toEqual(['PROVENANCE_MISSING', 'PROVENANCE_MISSING', 'PROVENANCE_MISSING']);
    const proposed = withPoint('24.9705', '67.0015', { status: 'proposed' });
    expect(codes(proposed, 'error')).toEqual([]);
    expect(codes(proposed, 'warning')).toContain('PROVENANCE_INCOMPLETE');
    expect(place(proposed, 'T-1').location).toBe('provisional');
    expect(codes(withPoint('24.9705', '67.0015', { survey_method: 'guess' }), 'error')).toContain('SURVEY_METHOD_UNKNOWN');
    expect(codes(withPoint('24.9705', '67.0015', { accuracy_m: '-3' }), 'error')).toContain('ACCURACY_INVALID');
  });
  it('one ilaqa, several tents: each is its own record with its own id', () => {
    const c = run({ Ilaqas: sheet('Ilaqas', il('IL-1', 'A')), Tents: sheet('Tents', tent('T-1', 'IL-1'), tent('T-2', 'IL-1', { latitude: '24.9706', longitude: '67.0016', status: 'proposed' }), tent('T-3', 'IL-1', { latitude: '24.9704', longitude: '67.0014', status: 'proposed' })) });
    expect(c.catalogAdditions.filter((p) => p.parentId === 'IL-1').map((p) => p.id)).toEqual(['T-1', 'T-2', 'T-3']);
    expect(place(c, 'T-1').location).toBe('pending');
  });
});

describe('identities', () => {
  it('refuses duplicate ids within and across sheets, ids shared with the current pack, and unknown parents', () => {
    expect(codes(run({ Ilaqas: sheet('Ilaqas', il('IL-1', 'A'), il('IL-1', 'B')) }), 'error')).toContain('ID_DUPLICATE');
    expect(codes(run({ Ilaqas: sheet('Ilaqas', il('IL-1', 'A')), Tents: sheet('Tents', tent('T-1', 'IL-1'), tent('T-1', 'IL-1')) }), 'error')).toContain('ID_DUPLICATE');
    expect(codes(run({ Ilaqas: sheet('Ilaqas', il('IL-1', 'A')), Tents: sheet('Tents', tent('IL-1', 'IL-1')) }), 'error')).toContain('ID_DUPLICATE');
    expect(codes(run({ Ilaqas: sheet('Ilaqas', il('B1', 'Not Block One')) }), 'error')).toContain('IDENTITY_CONFLICT');
    expect(codes(run({ Ilaqas: sheet('Ilaqas', il('IL-1', 'A')), Tents: sheet('Tents', tent('T-1', 'IL-404')) }), 'error')).toContain('PARENT_UNKNOWN');
    expect(codes(run({ Ilaqas: sheet('Ilaqas', il('bad id!', 'A')) }), 'error')).toContain('ID_INVALID');
  });
  it('names are never used as identity: renaming an ilaqa keeps its id, and the venue id must match', () => {
    expect(run({ Ilaqas: sheet('Ilaqas', il('IL-1', 'Renamed')) }).identities).toEqual([{ id: 'IL-1', kind: 'ilaqa', status: 'included' }]);
    expect(codes(run({ Ilaqas: sheet('Ilaqas', il('IL-1', 'A')), Metadata: meta({ venue_id: 'other' }) }), 'error')).toContain('VENUE_MISMATCH');
  });
});

describe('facilities, access points and change requests', () => {
  it('facilities: kinds map to catalog categories; a located one is never routable without a connector', () => {
    const f = (id: string, kind: string, over: Record<string, string> = {}) => ({ facility_id: id, facility_kind: kind, name_en: `Fac ${id}`, status: 'proposed', ...over });
    const c = run({ Ilaqas: sheet('Ilaqas', il('IL-1', 'A')), Facilities: sheet('Facilities', f('F-1', 'water', { latitude: '24.975', longitude: '67.008' }), f('F-2', 'food'), f('F-3', 'toilet')) });
    expect(c.catalogAdditions.filter((p) => String(p.id).startsWith('F-')).map((p) => [p.id, p.category, p.routing])).toEqual([['F-1', 'water', 'unreachable'], ['F-2', 'canteen', 'not-located'], ['F-3', 'facility', 'not-located']]);
    expect(c.geometryAdditions).toEqual([expect.objectContaining({ id: 'F-1#point', properties: { kind: 'facility', placeId: 'F-1', facilityKind: 'water' } })]);
    const bad = run({ Ilaqas: sheet('Ilaqas', il('IL-1', 'A')), Facilities: sheet('Facilities', f('F-4', 'bogus')) });
    expect(codes(bad, 'error')).toEqual(['FACILITY_KIND_UNKNOWN']);
  });
  it('a block corner is never an access point; only a verified one on a block is recorded, and it adds no route', () => {
    const ap = (id: string, status: string, over: Record<string, string> = {}) => ({ access_id: id, parent_type: 'block', parent_id: 'B1', role: 'entrance', latitude: '24.9705', longitude: '67.001', survey_method: 'rtk', accuracy_m: '0.5', surveyed_on: '2026-03-01', surveyed_by: 'A', status, ...over });
    const c = run({ Ilaqas: sheet('Ilaqas', il('IL-1', 'A')), Access_Points: sheet('Access_Points', ap('AP-1', 'verified'), ap('AP-2', 'proposed')) });
    expect(c.geometryAdditions).toEqual([{ type: 'Feature', id: 'AP-1', geometry: { type: 'Point', coordinates: [67.001, 24.9705] }, properties: { kind: 'access-point', blockId: 'B1', verification: 'VERIFIED' } }]);
    expect(codes(c, 'review')).toEqual(expect.arrayContaining(['ACCESS_NEEDS_CONNECTOR', 'ACCESS_PROPOSAL_UNVERIFIED']));
    expect(c.catalogAdditions.some((p) => p.id === 'AP-1')).toBe(false);
  });
  it('gate and block changes are compared with the verified data, recorded, and never applied', () => {
    const c = run({
      Ilaqas: sheet('Ilaqas', il('IL-1', 'A')),
      Gates_Changes: sheet('Gates_Changes', { gate_id: 'GATE_1', proposed_latitude: '24.9651', proposed_longitude: '67.002', change_reason: 'resurvey', review_status: 'approved' }, { gate_id: 'GATE_99', proposed_latitude: '24.965', proposed_longitude: '67.002', change_reason: 'x', review_status: 'proposed' }),
      Blocks_Changes: sheet('Blocks_Changes', { block_id: 'B1', update_type: 'center', center_latitude: '24.9706', center_longitude: '67.0016', change_reason: 'resurvey', review_status: 'proposed' }),
    });
    expect(codes(c, 'error')).toEqual(['GATE_UNKNOWN']);
    const ok = run({ Ilaqas: sheet('Ilaqas', il('IL-1', 'A')), Gates_Changes: sheet('Gates_Changes', { gate_id: 'GATE_1', proposed_latitude: '24.9651', proposed_longitude: '67.002', change_reason: 'resurvey', review_status: 'approved' }) });
    expect(ok.outcome).toBe('NEEDS_REVIEW');
    expect(ok.changeRequests).toEqual([expect.objectContaining({ kind: 'gate-coordinate', id: 'GATE_1', distanceM: 11.1, current: { lat: 24.965, lng: 67.002 }, proposed: { lat: 24.9651, lng: 67.002 } })]);
    expect(ok.catalogAdditions.every((p) => p.category === 'ilaqa')).toBe(true); // nothing about GATE_1 was added or changed
    expect(codes(ok, 'review')).toContain('GATE_COORDINATE_CHANGE');
  });
});

describe('GeoJSON', () => {
  const ring = (pts: number[][]) => JSON.stringify({ type: 'FeatureCollection', features: [{ type: 'Feature', properties: { block_id: 'B1' }, geometry: { type: 'Polygon', coordinates: [pts] } }] });
  const register = (file: string, type = 'block_polygon') => ({ Geometry_Files: sheet('Geometry_Files', { geometry_file_id: 'GF-1', filename: file, geometry_type: type, related_entity_ids: 'B1', review_status: 'proposed' }), Blocks_Changes: sheet('Blocks_Changes', { block_id: 'B1', update_type: 'polygon', geometry_file_id: 'GF-1', change_reason: 'resurvey', review_status: 'proposed' }) });
  const ccw = [[67.001, 24.97], [67.002, 24.97], [67.002, 24.971], [67.001, 24.971], [67.001, 24.97]];
  const go = (text: string, file = 'b1.geojson', type?: string) => run({ Ilaqas: sheet('Ilaqas', il('IL-1', 'A')), ...register(file, type) }, { [file]: text });
  it('a valid polygon is recorded as a change request in [lng, lat] order; a clockwise ring is rewound and flagged', () => {
    const c = go(ring(ccw));
    expect(codes(c, 'error')).toEqual([]);
    expect(c.changeRequests).toEqual([expect.objectContaining({ kind: 'block-polygon', id: 'B1' })]);
    expect(codes(go(ring([...ccw].reverse())), 'review')).toContain('RING_REWOUND');
  });
  it('rejects open, self-intersecting, swapped, non-polygon, invalid and missing files, unsafe names, and ignores unregistered ones', () => {
    expect(codes(go(ring(ccw.slice(0, -1))), 'error')).toContain('GEOJSON_RING');
    expect(codes(go(ring([[67.001, 24.97], [67.002, 24.971], [67.002, 24.97], [67.001, 24.971], [67.001, 24.97]])), 'error')).toContain('GEOJSON_RING');
    expect(go(ring(ccw.map(([x, y]) => [y, x]))).findings.find((f) => f.code === 'GEOJSON_RING')?.message).toMatch(/swapped/);
    expect(codes(go('{"type":"FeatureCollection","features":[{"type":"Feature","properties":{},"geometry":{"type":"Point","coordinates":[67,24.9]}}]}'), 'error')).toContain('GEOJSON_GEOMETRY');
    expect(codes(go('{not json'), 'error')).toContain('GEOJSON_INVALID');
    expect(codes(go('{"a":1,"a":2}'), 'error')).toContain('GEOJSON_INVALID');
    expect(codes(run({ Ilaqas: sheet('Ilaqas', il('IL-1', 'A')), ...register('b1.geojson') }), 'error')).toContain('GEOJSON_MISSING');
    for (const bad of ['../x.geojson', '/etc/passwd.json', 'a/b.geojson', 'x.txt']) expect(codes(run({ Ilaqas: sheet('Ilaqas', il('IL-1', 'A')), ...register(bad) }, { [bad]: ring(ccw) }), 'error')).toContain('FILENAME_UNSAFE');
    expect(codes(run({ Ilaqas: sheet('Ilaqas', il('IL-1', 'A')) }, { 'stray.geojson': ring(ccw) }), 'warning')).toContain('GEOJSON_UNREGISTERED');
    expect(codes(go(ring(ccw), 'p.geojson', 'walkable_path'), 'error')).toContain('GEOJSON_GEOMETRY');
  });
  it('a polygon change needs a registered file: block corners listed as columns are never a polygon', () => {
    const c = run({ Ilaqas: sheet('Ilaqas', il('IL-1', 'A')), Blocks_Changes: sheet('Blocks_Changes', { block_id: 'B1', update_type: 'polygon', change_reason: 'x', review_status: 'proposed' }) });
    expect(codes(c, 'error')).toContain('GEOMETRY_FILE_MISSING');
  });
});

describe('determinism and input shapes', () => {
  it('the same input gives byte-identical output, whatever the row order', () => {
    const rows = [il('IL-3', 'C'), il('IL-1', 'A'), il('IL-2', 'B')];
    const a = run({ Ilaqas: sheet('Ilaqas', ...rows) });
    const b = run({ Ilaqas: sheet('Ilaqas', ...[...rows].reverse()) });
    expect(JSON.stringify(a.catalogAdditions)).toBe(JSON.stringify(b.catalogAdditions));
    expect(JSON.stringify(a.identities)).toBe(JSON.stringify(b.identities));
    expect(JSON.stringify(run({ Ilaqas: sheet('Ilaqas', ...rows) }))).toBe(JSON.stringify(a));
  });
  it('columns are matched by header name, so reordering or extra columns cannot move data', () => {
    const grid = sheet('Ilaqas', il('IL-1', 'A'));
    const reordered = grid.map((r) => [...r].reverse());
    const c = run({ Ilaqas: reordered });
    expect(place(c, 'IL-1')).toMatchObject({ names: { en: 'A', ur: 'A-ur', 'ur-Latn': 'A-latn' }, marhala: 1 });
  });
  it('a missing Ilaqas sheet or header is an error; blank and formula-check columns are ignored', () => {
    expect(codes(run({}), 'error')).toContain('SHEET_MISSING');
    expect(codes(run({ Ilaqas: [['x', 'y'], ['1', '2']] }), 'error')).toContain('HEADER_MISSING');
    const t = readTable('Tents', sheet('Tents', tent('T-1', 'IL-1', { entry_check: 'PENDING POINT' })), 'tent_id')!;
    expect(t.columns).not.toContain('entry_check');
  });
  it('reads UTF-8 CSV with a BOM, quoted commas and doubled quotes, CRLF line ends', () => {
    expect(parseCsv('﻿a,b\r\n"x,1","he said ""hi"""\r\n')).toEqual([['a', 'b'], ['x,1', 'he said "hi"']]);
  });
  it('the summary is human-readable and lists each finding with its place in the workbook', () => {
    const text = summarize(run({ Ilaqas: sheet('Ilaqas', il('IL-5', 'Same', { name_review: 'duplicate_name_review' }), il('IL-6', 'Same', { name_review: 'duplicate_name_review' })) }));
    expect(text).toMatch(/Outcome: NEEDS_REVIEW/);
    expect(text).toMatch(/\[DUPLICATE_NAME\] Ilaqas/);
  });
});

describe('the owner\'s original 100-row workbook shape', () => {
  const legacy = [['x'], ['y'], ['z'], ['Marhala', '#', 'Index', 'Urdu', 'Roman', 'English', 'Logitude', 'Latitude'],
    ['1.0', '1.0', '1.0', 'الف', 'Alif', 'Alpha', '', ''], ['1.0', '2.0', '2.0', 'ب', 'Be', 'Beta', '', ''], ['2.0', '3.0', '3.0', 'الف', 'Alif', 'Alpha', '', ''], ['2.0', '4.0', '48.0', '—', '—', '—', '', '']];
  it('becomes an Ilaqas list with ids from the source Index; duplicates flagged, placeholder excluded, no coordinates invented', () => {
    const grid = legacyIlaqaGrid(legacy)!;
    expect(grid.slice(1).map((r) => [r[0], r[2], r[7]])).toEqual([['IL-0001', '1', 'duplicate_name_review'], ['IL-0002', '1', 'unreviewed'], ['IL-0003', '2', 'duplicate_name_review'], ['IL-0048', '2', 'missing_name']]);
    const c = run({ Ilaqas: grid });
    expect(c.catalogAdditions.map((p) => p.id)).toEqual(['IL-0001', 'IL-0002', 'IL-0003']);
    expect(c.identities.find((i) => i.id === 'IL-0048')).toMatchObject({ status: 'excluded', reason: 'PLACEHOLDER' });
    expect(c.catalogAdditions.every((p) => p.location === 'pending' && !('coordinate' in p))).toBe(true);
    expect(c.outcome).toBe('NEEDS_REVIEW');
  });
});

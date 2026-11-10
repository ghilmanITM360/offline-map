/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// import -> validate -> REVIEW -> compile -> verify. This is the first two steps: it turns the client's workbook (and GeoJSON) into a
// reviewable CANDIDATE and never touches the baseline venue data or the compiler. Outcomes:
//   REJECT            at least one error; nothing usable.
//   NEEDS_REVIEW      importable, but a person must decide something (duplicate names, a changed verified coordinate, an ambiguous block...).
//   ACCEPT_AS_PENDING valid, with records that have no location yet (listed in search, never routed to).
//   ACCEPT            valid and complete.
// A coordinate is never guessed: blank means pending, and a point is routed to only through connectors that already exist.
import { createHash } from 'node:crypto';
import {
  assignToRings, counterClockwise, diagnoseCoordinate, fromGeoJsonRing, haversineM, ringProblems, signedAreaM2,
  type GeoBounds, type GeoPoint, type GeoRing,
} from '../../../packages/offline-navigation/src/index';
import { parseStrictJson } from '../../../packages/offline-navigation/src/domain/pack/StrictJson';
import { normalizeHeader, readTable, type Table, type TableRow } from './table';

export type Severity = 'error' | 'warning' | 'review';
export interface Finding { severity: Severity; code: string; sheet: string; row?: number; field?: string; message: string }
export type Outcome = 'ACCEPT' | 'ACCEPT_AS_PENDING' | 'NEEDS_REVIEW' | 'REJECT';

/** What the intake is compared against: the current approved pack's data. Nothing here is ever changed. */
export interface Baseline {
  venueId: string;
  bounds: GeoBounds;
  languages: readonly string[];
  /** Block polygons and the graph nodes a route to each block ends at. */
  blocks: ReadonlyArray<{ id: string; ring: GeoRing; nodeIds: readonly string[] }>;
  gates: ReadonlyMap<string, GeoPoint>;
  catalogIds: ReadonlyMap<string, { en: string }>;
}

export interface ImportInput {
  sheets: ReadonlyMap<string, readonly (readonly string[])[]>;
  /** Supplied GeoJSON files by plain file name. */
  geojson: ReadonlyMap<string, string>;
  baseline: Baseline;
  /** Fingerprints of the submitted files, recorded so the candidate can be tied to exactly what was reviewed. */
  sources: ReadonlyArray<{ name: string; sha256: string }>;
}

export interface CandidateRecord { [key: string]: unknown }
export interface Candidate {
  schemaVersion: 1;
  venueId: string;
  outcome: Outcome;
  distribution: 'internal-only' | 'distribution-authorized';
  counts: Record<string, number>;
  findings: Finding[];
  /** Catalog places to add (place-catalog entries), sorted by id. */
  catalogAdditions: CandidateRecord[];
  /** Geometry features to add (venue-geometry features), sorted by id. */
  geometryAdditions: CandidateRecord[];
  /** Every id the intake assigned or received, including records kept out of the pack (a placeholder keeps its identity). */
  identities: Array<{ id: string; kind: string; status: 'included' | 'excluded'; reason?: string }>;
  /** Proposed changes to existing verified data. Recorded only: nothing here is ever applied automatically. */
  changeRequests: CandidateRecord[];
  sources: ImportInput['sources'];
}

const SHEETS = ['Metadata', 'Ilaqas', 'Tents', 'Facilities', 'Access_Points', 'Gates_Changes', 'Blocks_Changes', 'Geometry_Files'] as const;
const ID_RE = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,63}$/;
const METHODS = ['gps_handheld', 'rtk', 'map_click', 'satellite_trace', 'other'];
const STATUS = ['pending', 'proposed', 'surveyed', 'verified', 'deprecated'];
const FACILITY_CATEGORY: Record<string, string> = { water: 'water', medical: 'medical', canteen: 'canteen', food: 'canteen', library: 'library', power: 'power' };
const PLACEHOLDER_NAME = /^[\s\-–—_.?]*$/;
const sha256 = (s: string): string => createHash('sha256').update(s).digest('hex');
export const sourceFingerprint = (name: string, bytes: Uint8Array | string): { name: string; sha256: string } => ({ name, sha256: createHash('sha256').update(bytes).digest('hex') });
const nameKey = (s: string): string => s.normalize('NFKC').toLocaleLowerCase().replace(/\s+/g, ' ').trim();

export const importIntake = (input: ImportInput): Candidate => {
  const findings: Finding[] = [];
  const add = (severity: Severity, code: string, sheet: string, row: number | undefined, field: string | undefined, message: string) => findings.push({ severity, code, sheet, ...(row === undefined ? {} : { row }), ...(field === undefined ? {} : { field }), message });
  const { baseline } = input;
  const tables = new Map<string, Table>();
  for (const name of SHEETS) {
    const grid = input.sheets.get(name);
    if (!grid) {
      if (name === 'Ilaqas') add('error', 'SHEET_MISSING', name, undefined, undefined, `the workbook has no '${name}' sheet`);
      else if (name === 'Metadata') add('warning', 'METADATA_MISSING', name, undefined, undefined, 'there is no Metadata sheet: owner, rights and version are unrecorded');
      continue;
    }
    const anchor = ({ Metadata: 'field', Ilaqas: 'ilaqa_id', Tents: 'tent_id', Facilities: 'facility_id', Access_Points: 'access_id', Gates_Changes: 'gate_id', Blocks_Changes: 'block_id', Geometry_Files: 'geometry_file_id' } as const)[name];
    const t = readTable(name, grid, anchor);
    if (!t) { add('error', 'HEADER_MISSING', name, undefined, anchor, `no header row with a '${anchor}' column was found`); continue; }
    tables.set(name, t);
  }
  const catalogAdditions: CandidateRecord[] = [];
  const geometryAdditions: CandidateRecord[] = [];
  const identities: Candidate['identities'] = [];
  const changeRequests: CandidateRecord[] = [];
  const counts: Record<string, number> = {};
  const bump = (k: string) => { counts[k] = (counts[k] ?? 0) + 1; };

  const cell = (r: TableRow, f: string): string => r.cells[f] ?? '';
  const require = (t: Table, r: TableRow, fields: string[]): boolean => {
    let ok = true;
    for (const f of fields) if (cell(r, f) === '') { add('error', 'REQUIRED_MISSING', t.sheet, r.line, f, `'${f}' is required`); ok = false; }
    return ok;
  };
  const idOk = (t: Table, r: TableRow, f: string): boolean => {
    if (ID_RE.test(cell(r, f))) return true;
    add('error', 'ID_INVALID', t.sheet, r.line, f, `'${cell(r, f)}' is not a valid id (letters, digits and _ . : - only, at most 64 characters)`);
    return false;
  };
  /** A coordinate pair: both blank = pending (null); one blank, non-numeric, swapped, zero or outside the venue = error; else the point. */
  const pair = (t: Table, r: TableRow, latF: string, lngF: string): GeoPoint | null | 'invalid' => {
    const [a, b] = [cell(r, latF), cell(r, lngF)];
    if (a === '' && b === '') return null;
    if (a === '' || b === '') { add('error', 'COORDINATE_PAIR', t.sheet, r.line, a === '' ? latF : lngF, 'latitude and longitude must both be given, or both left blank (pending)'); return 'invalid'; }
    if (!/^-?\d+(\.\d+)?$/.test(a) || !/^-?\d+(\.\d+)?$/.test(b)) { add('error', 'COORDINATE_FORMAT', t.sheet, r.line, latF, `'${a}', '${b}' must be decimal degrees (WGS84), latitude first`); return 'invalid'; }
    const p = { lat: Number(a), lng: Number(b) };
    const problem = diagnoseCoordinate(p, baseline.bounds);
    if (problem) {
      add('error', `COORDINATE_${problem.toUpperCase().replace(/-/g, '_')}`, t.sheet, r.line, latF, `(${a}, ${b}) ${problem === 'swapped' ? 'looks swapped: latitude comes first' : problem === 'null-island' ? 'is (0, 0), which is a missing value, not a place' : problem === 'outside-bounds' ? 'is outside the venue area' : 'is not a valid coordinate'}`);
      return 'invalid';
    }
    return p;
  };
  const provenance = (t: Table, r: TableRow, status: string, hasPoint: boolean) => {
    if (!hasPoint) return;
    const method = cell(r, 'survey_method');
    if (method !== '' && !METHODS.includes(method)) add('error', 'SURVEY_METHOD_UNKNOWN', t.sheet, r.line, 'survey_method', `'${method}' is not one of ${METHODS.join(', ')}`);
    const acc = cell(r, 'accuracy_m');
    if (acc !== '' && !(Number(acc) > 0 && Number(acc) < 1000)) add('error', 'ACCURACY_INVALID', t.sheet, r.line, 'accuracy_m', `'${acc}' must be a number of metres between 0 and 1000`);
    const missing = ['survey_method', 'surveyed_on', 'surveyed_by'].filter((f) => cell(r, f) === '');
    if (status === 'verified' || status === 'surveyed') for (const f of missing) add('error', 'PROVENANCE_MISSING', t.sheet, r.line, f, `a '${status}' coordinate needs ${f}`);
    else if (missing.length) add('warning', 'PROVENANCE_INCOMPLETE', t.sheet, r.line, missing[0], `a '${status || 'proposed'}' coordinate has no ${missing.join(', ')}; it stays provisional`);
  };

  // ---- Metadata: rights and release prerequisites ----
  const meta = new Map<string, string>();
  for (const r of tables.get('Metadata')?.rows ?? []) meta.set(cell(r, 'field'), cell(r, 'client_entry'));
  const metaT = tables.get('Metadata');
  if (metaT) {
    if (meta.get('venue_id') !== baseline.venueId) add('error', 'VENUE_MISMATCH', 'Metadata', undefined, 'venue_id', `the workbook is for '${meta.get('venue_id') ?? ''}', this pack is for '${baseline.venueId}'`);
    if ((meta.get('coordinate_system') ?? 'WGS84') !== 'WGS84') add('error', 'CRS_UNSUPPORTED', 'Metadata', undefined, 'coordinate_system', 'only WGS84 is supported');
    for (const f of ['dataset_version', 'data_owner', 'rights_holder', 'distribution_authority', 'submitted_by', 'submitted_on']) if (!meta.get(f)) add('warning', 'METADATA_INCOMPLETE', 'Metadata', undefined, f, `'${f}' is blank; it is required before a release`);
  }
  const authorized = meta.get('redistribution_allowed') === 'Yes' && !!meta.get('distribution_authority');
  if (!authorized) add('review', 'RIGHTS_UNCONFIRMED', 'Metadata', undefined, 'redistribution_allowed', 'redistribution is not confirmed with a named authority: the result is for internal use only');

  // ---- Ilaqas ----
  const ilaqaIds = new Set<string>();
  const byName = new Map<string, string[]>();
  const draftCount = { n: 0 };
  const ilaqas = tables.get('Ilaqas');
  for (const r of ilaqas?.rows ?? []) {
    const t = ilaqas!;
    if (!require(t, r, ['ilaqa_id', 'marhala']) || !idOk(t, r, 'ilaqa_id')) continue;
    const id = cell(r, 'ilaqa_id');
    if (ilaqaIds.has(id)) { add('error', 'ID_DUPLICATE', t.sheet, r.line, 'ilaqa_id', `'${id}' appears more than once`); continue; }
    ilaqaIds.add(id);
    const marhala = Number(cell(r, 'marhala'));
    if (!Number.isSafeInteger(marhala) || marhala < 1) { add('error', 'MARHALA_INVALID', t.sheet, r.line, 'marhala', `'${cell(r, 'marhala')}' must be a whole number from 1`); continue; }
    const names = { en: cell(r, 'name_en'), ur: cell(r, 'name_ur'), 'ur-Latn': cell(r, 'name_ur_latn') };
    const review = cell(r, 'name_review');
    const status = cell(r, 'catalog_status') || 'pending_location';
    const placeholder = PLACEHOLDER_NAME.test(names.en) || review === 'missing_name' || status === 'needs_name';
    if (placeholder || status === 'deprecated') {
      identities.push({ id, kind: 'ilaqa', status: 'excluded', reason: status === 'deprecated' ? 'DEPRECATED' : 'PLACEHOLDER' });
      if (placeholder) add('review', 'PLACEHOLDER_NAME', t.sheet, r.line, 'name_en', `'${id}' has no real name (a placeholder); it keeps its id but is not offered in search until the name is confirmed`);
      continue;
    }
    for (const [lang, v] of Object.entries(names)) if (v === '') add('warning', 'NAME_MISSING', t.sheet, r.line, `name_${lang === 'ur-Latn' ? 'ur_latn' : lang}`, `no ${lang} name for '${id}'; the English name is shown instead`);
    const baseKnown = baseline.catalogIds.get(id);
    if (baseKnown && nameKey(baseKnown.en) !== nameKey(names.en)) add('error', 'IDENTITY_CONFLICT', t.sheet, r.line, 'ilaqa_id', `'${id}' already names "${baseKnown.en}" in the current pack, not "${names.en}"`);
    const flags: string[] = [];
    if (review === 'duplicate_name_review') flags.push('DUPLICATE_NAME', 'NEEDS_REVIEW');
    if (review === 'translation_review') flags.push('DRAFT_TRANSLATION', 'NEEDS_REVIEW');
    if (review === 'unreviewed' || review === '') { flags.push('DRAFT_TRANSLATION'); draftCount.n++; }
    const key = nameKey(names.en);
    byName.set(key, [...(byName.get(key) ?? []), id]);
    identities.push({ id, kind: 'ilaqa', status: 'included' });
    bump('ilaqas');
    catalogAdditions.push({
      id, category: 'ilaqa', names: Object.fromEntries(Object.entries(names).filter(([, v]) => v !== '')), aliases: [], marhala,
      location: 'pending', routing: 'not-located', routingReason: 'LOCATION_PENDING', nodeIds: [],
      provenance: { source: 'client intake', ref: `${ilaqas!.sheet}${cell(r, 'source_index') ? `, source index ${cell(r, 'source_index')}` : ''}` }, flags: [...new Set(flags)].sort(),
    });
  }
  for (const [name, ids] of [...byName].sort()) if (ids.length > 1) {
    add('review', 'DUPLICATE_NAME', 'Ilaqas', undefined, 'name_en', `${ids.length} ilaqas share the name "${name}" (${ids.join(', ')}); they stay separate records until the organizer decides`);
    for (const rec of catalogAdditions) if (ids.includes(rec.id as string)) rec.flags = [...new Set([...(rec.flags as string[]), 'DUPLICATE_NAME', 'NEEDS_REVIEW'])].sort();
  }
  if (draftCount.n) add('review', 'TRANSLATIONS_UNREVIEWED', 'Ilaqas', undefined, 'name_review', `${draftCount.n} ilaqa name(s) are unreviewed drafts; they are labelled DRAFT_TRANSLATION and not presented as approved`);

  // ---- Tents and facilities: located things, kept independent of any route ----
  const blocks = baseline.blocks.map((b) => ({ id: b.id, ring: b.ring }));
  const placed = new Set<string>(ilaqaIds);
  const locate = (t: Table, r: TableRow, p: GeoPoint, hintField: string, label: string): { blockId?: string; nodeIds: readonly string[]; reason: string } => {
    if (blocks.length === 0) { add('warning', 'NO_BLOCK_GEOMETRY', t.sheet, r.line, undefined, 'the current pack has no block polygons, so no block can be assigned'); return { nodeIds: [], reason: 'NO_VERIFIED_CONNECTOR' }; }
    const a = assignToRings(p, blocks);
    const hint = cell(r, hintField);
    if (a.status === 'inside' || a.status === 'boundary') {
      if (a.status === 'boundary') add('review', 'BLOCK_BOUNDARY', t.sheet, r.line, undefined, `${label} lies within 2 m of the edge of ${a.ids[0]}; confirm which side of the boundary it is on`);
      if (hint !== '' && hint !== a.ids[0]) add('review', 'BLOCK_HINT_MISMATCH', t.sheet, r.line, hintField, `${label} is inside ${a.ids[0]}, not the suggested ${hint}`);
      const base = baseline.blocks.find((b) => b.id === a.ids[0])!;
      return { blockId: a.ids[0], nodeIds: base.nodeIds, reason: 'LEGACY_BOUNDARY_ACCESS' };
    }
    if (a.status === 'ambiguous') add('review', 'BLOCK_AMBIGUOUS', t.sheet, r.line, undefined, `${label} could belong to ${a.ids.join(' or ')}; no block was assigned`);
    else add('warning', 'OUTSIDE_ALL_BLOCKS', t.sheet, r.line, undefined, `${label} is outside every block (${a.nearestId} is ${Math.round(a.nearestDistanceM ?? 0)} m away); no block was assigned`);
    return { nodeIds: [], reason: 'NO_VERIFIED_CONNECTOR' };
  };
  const located = (t: Table, r: TableRow, kind: 'tent' | 'facility', latF: string, lngF: string): void => {
    const idF = kind === 'tent' ? 'tent_id' : 'facility_id';
    if (!idOk(t, r, idF)) return;
    const id = cell(r, idF);
    if (placed.has(id) || baseline.catalogIds.has(id)) { add('error', 'ID_DUPLICATE', t.sheet, r.line, idF, `'${id}' is already used`); return; }
    placed.add(id);
    const status = cell(r, 'status') || 'pending';
    if (!STATUS.includes(status)) { add('error', 'STATUS_UNKNOWN', t.sheet, r.line, 'status', `'${status}' is not one of ${STATUS.join(', ')}`); return; }
    if (status === 'deprecated') { identities.push({ id, kind, status: 'excluded', reason: 'DEPRECATED' }); return; }
    let parentId: string | undefined;
    if (kind === 'tent') {
      if (!require(t, r, ['ilaqa_id'])) return;
      parentId = cell(r, 'ilaqa_id');
      if (!ilaqaIds.has(parentId) && !baseline.catalogIds.has(parentId)) { add('error', 'PARENT_UNKNOWN', t.sheet, r.line, 'ilaqa_id', `'${parentId}' is not an ilaqa in this workbook or the current pack`); return; }
    }
    if (!require(t, r, kind === 'tent' ? [] : ['facility_kind', 'name_en'])) return;
    const point = pair(t, r, latF, lngF);
    if (point === 'invalid') return;
    const fkind = cell(r, 'facility_kind');
    if (kind === 'facility' && !(fkind in FACILITY_CATEGORY) && !['toilet', 'prayer_area', 'parking', 'other'].includes(fkind)) { add('error', 'FACILITY_KIND_UNKNOWN', t.sheet, r.line, 'facility_kind', `'${fkind}' is not a known facility kind`); return; }
    const en = kind === 'tent' ? cell(r, 'tent_label') || id : cell(r, 'name_en');
    const names = { en, ...(cell(r, 'name_ur') ? { ur: cell(r, 'name_ur') } : {}), ...(cell(r, 'name_ur_latn') ? { 'ur-Latn': cell(r, 'name_ur_latn') } : {}) };
    const category = kind === 'tent' ? 'tent' : FACILITY_CATEGORY[fkind] ?? 'facility';
    identities.push({ id, kind, status: 'included' });
    bump(`${kind}s`);
    const base = { id, category, names, aliases: [], ...(parentId ? { parentId } : {}), provenance: { source: 'client intake', ref: `${t.sheet}${cell(r, 'evidence_ref') ? `, evidence ${cell(r, 'evidence_ref')}` : ''}` }, flags: [] as string[] };
    if (point === null) {
      if (status !== 'pending') add('warning', 'STATUS_WITHOUT_POINT', t.sheet, r.line, 'status', `status '${status}' but no coordinate: kept as pending`);
      catalogAdditions.push({ ...base, location: 'pending', routing: 'not-located', routingReason: 'LOCATION_PENDING', nodeIds: [] });
      bump('pending');
      return;
    }
    provenance(t, r, status, true);
    if (status === 'pending') add('warning', 'POINT_WITH_PENDING_STATUS', t.sheet, r.line, 'status', `a coordinate is given but the status is still 'pending'; it is treated as proposed`);
    const where = locate(t, r, point, 'block_id_hint', `${kind} '${id}'`);
    const verified = status === 'verified';
    catalogAdditions.push({
      ...base, coordinate: { lat: point.lat, lng: point.lng }, ...(where.blockId ? { blockId: where.blockId } : {}),
      location: verified ? 'verified' : 'provisional',
      routing: where.nodeIds.length ? 'provisional' : 'unreachable', routingReason: where.reason, nodeIds: where.nodeIds,
    });
    geometryAdditions.push({ type: 'Feature', id: `${id}#point`, geometry: { type: 'Point', coordinates: [point.lng, point.lat] }, properties: { kind, placeId: id, ...(kind === 'facility' ? { facilityKind: fkind } : {}) } });
  };
  for (const r of tables.get('Tents')?.rows ?? []) located(tables.get('Tents')!, r, 'tent', 'latitude', 'longitude');
  for (const r of tables.get('Facilities')?.rows ?? []) located(tables.get('Facilities')!, r, 'facility', 'latitude', 'longitude');

  // ---- Access points: only a VERIFIED one on a block becomes geometry; a block corner is never an access point by itself ----
  const accessT = tables.get('Access_Points');
  const seenAccess = new Set<string>();
  for (const r of accessT?.rows ?? []) {
    const t = accessT!;
    if (!require(t, r, ['access_id', 'parent_type', 'parent_id', 'role']) || !idOk(t, r, 'access_id')) continue;
    const id = cell(r, 'access_id');
    if (seenAccess.has(id)) { add('error', 'ID_DUPLICATE', t.sheet, r.line, 'access_id', `'${id}' appears more than once`); continue; }
    seenAccess.add(id);
    const status = cell(r, 'status') || 'pending';
    const point = pair(t, r, 'latitude', 'longitude');
    if (point === 'invalid') continue;
    if (point === null) { add('warning', 'ACCESS_PENDING', t.sheet, r.line, undefined, `access point '${id}' has no coordinate yet`); continue; }
    provenance(t, r, status, true);
    const parent = cell(r, 'parent_id');
    const blockOk = cell(r, 'parent_type') === 'block' && blocks.some((b) => b.id === parent);
    if (status === 'verified' && blockOk) {
      geometryAdditions.push({ type: 'Feature', id, geometry: { type: 'Point', coordinates: [point.lng, point.lat] }, properties: { kind: 'access-point', blockId: parent, verification: 'VERIFIED' } });
      bump('verifiedAccessPoints');
      add('review', 'ACCESS_NEEDS_CONNECTOR', t.sheet, r.line, undefined, `access point '${id}' is recorded, but no route can end there until a reviewed graph change connects it to the walkways`);
    } else {
      add('review', 'ACCESS_PROPOSAL_UNVERIFIED', t.sheet, r.line, 'status', `access point '${id}' is recorded as a proposal only (${blockOk ? `status '${status}'` : 'parent is not a known block'}); it does not change any route`);
    }
  }

  // ---- Gate and block change requests: recorded with the size of the change, never applied ----
  const gatesT = tables.get('Gates_Changes');
  for (const r of gatesT?.rows ?? []) {
    const t = gatesT!;
    if (!require(t, r, ['gate_id', 'change_reason', 'review_status'])) continue;
    const id = cell(r, 'gate_id');
    const current = baseline.gates.get(id);
    if (!current) { add('error', 'GATE_UNKNOWN', t.sheet, r.line, 'gate_id', `'${id}' is not a gate of the current pack`); continue; }
    const point = pair(t, r, 'proposed_latitude', 'proposed_longitude');
    if (point === 'invalid') continue;
    if (point === null) { add('warning', 'CHANGE_WITHOUT_POINT', t.sheet, r.line, undefined, `no proposed coordinate for ${id}`); continue; }
    const metres = haversineM(current, point);
    add('review', 'GATE_COORDINATE_CHANGE', t.sheet, r.line, undefined, `${id}: the proposal is ${metres.toFixed(1)} m from the current verified coordinate; the current one stays authoritative until the owner approves`);
    changeRequests.push({ kind: 'gate-coordinate', id, current: { lat: current.lat, lng: current.lng }, proposed: { lat: point.lat, lng: point.lng }, distanceM: Math.round(metres * 10) / 10, reason: cell(r, 'change_reason'), reviewStatus: cell(r, 'review_status') });
  }
  const blocksT = tables.get('Blocks_Changes');
  const geomT = tables.get('Geometry_Files');
  const registered = new Map<string, TableRow>();
  for (const r of geomT?.rows ?? []) {
    const t = geomT!;
    if (!require(t, r, ['geometry_file_id', 'filename', 'geometry_type'])) continue;
    const file = cell(r, 'filename');
    if (!/^[A-Za-z0-9][A-Za-z0-9_. -]{0,100}\.(geojson|json)$/.test(file) || file.includes('..')) { add('error', 'FILENAME_UNSAFE', t.sheet, r.line, 'filename', `'${file}' must be a plain .geojson/.json file name (no folders or links)`); continue; }
    registered.set(cell(r, 'geometry_file_id'), r);
    const text = input.geojson.get(file);
    if (text === undefined) { add('error', 'GEOJSON_MISSING', t.sheet, r.line, 'filename', `'${file}' is registered but was not supplied`); continue; }
    let doc: unknown;
    try { doc = parseStrictJson(text); } catch (e) { add('error', 'GEOJSON_INVALID', t.sheet, r.line, 'filename', `'${file}' is not valid strict JSON: ${(e as Error).message}`); continue; }
    const features = (doc as { type?: string; features?: unknown[]; geometry?: unknown })?.type === 'FeatureCollection' ? (doc as { features: unknown[] }).features : (doc as { type?: string })?.type === 'Feature' ? [doc] : null;
    if (!Array.isArray(features)) { add('error', 'GEOJSON_INVALID', t.sheet, r.line, 'filename', `'${file}' must be a Feature or FeatureCollection`); continue; }
    const gtype = cell(r, 'geometry_type');
    features.forEach((raw, i) => {
      const f = raw as { geometry?: { type?: string; coordinates?: unknown }; properties?: Record<string, unknown>; id?: unknown };
      const where = `${file} feature ${i}`;
      if (gtype === 'block_polygon') {
        const blockId = String(f.properties?.block_id ?? f.id ?? cell(r, 'related_entity_ids'));
        if (f.geometry?.type !== 'Polygon' || !Array.isArray(f.geometry.coordinates) || f.geometry.coordinates.length !== 1) { add('error', 'GEOJSON_GEOMETRY', t.sheet, r.line, 'geometry_type', `${where}: a block polygon must be one Polygon with a single outer ring`); return; }
        const ring = fromGeoJsonRing(f.geometry.coordinates[0]);
        if (!ring) { add('error', 'GEOJSON_RING', t.sheet, r.line, 'filename', `${where}: the ring must be closed and use finite [longitude, latitude] positions`); return; }
        const bad = ring.map((p) => diagnoseCoordinate(p, baseline.bounds)).find(Boolean);
        const problems = ringProblems(ring);
        if (bad || problems.length) { add('error', 'GEOJSON_RING', t.sheet, r.line, 'filename', `${where}: ${bad ? `a position is ${bad}` : `the ring is ${problems.join(', ')}`}`); return; }
        if (!baseline.blocks.some((b) => b.id === blockId)) { add('error', 'BLOCK_UNKNOWN', t.sheet, r.line, 'related_entity_ids', `${where}: '${blockId}' is not a block of the current pack`); return; }
        const normalized = counterClockwise(ring);
        if (signedAreaM2(ring) < 0) add('review', 'RING_REWOUND', t.sheet, r.line, undefined, `${where}: the ring was clockwise and was rewound counter-clockwise (same shape)`);
        add('review', 'BLOCK_POLYGON_CHANGE', t.sheet, r.line, undefined, `${where}: a replacement outline for ${blockId} is recorded; the current surveyed outline stays until the owner approves`);
        changeRequests.push({ kind: 'block-polygon', id: blockId, file, ring: normalized.map((p) => ({ lat: p.lat, lng: p.lng })), reviewStatus: cell(r, 'review_status') });
      } else if (gtype === 'walkable_path') {
        if (!['LineString', 'MultiLineString'].includes(f.geometry?.type ?? '')) { add('error', 'GEOJSON_GEOMETRY', t.sheet, r.line, 'geometry_type', `${where}: a path must be a LineString or MultiLineString`); return; }
        add('review', 'PATH_NEEDS_GRAPH_REVIEW', t.sheet, r.line, undefined, `${where}: a walkable path is recorded only; it adds no route until a reviewed graph change connects it`);
        changeRequests.push({ kind: 'walkable-path', file, feature: i, reviewStatus: cell(r, 'review_status') });
      } else add('warning', 'GEOMETRY_TYPE_UNUSED', t.sheet, r.line, 'geometry_type', `'${gtype}' files are registered but not used by this importer`);
    });
  }
  for (const file of input.geojson.keys()) if (![...registered.values()].some((r) => cell(r, 'filename') === file)) add('warning', 'GEOJSON_UNREGISTERED', 'Geometry_Files', undefined, 'filename', `'${file}' was supplied but is not listed in Geometry_Files; it was ignored`);
  for (const r of blocksT?.rows ?? []) {
    const t = blocksT!;
    if (!require(t, r, ['block_id', 'update_type', 'change_reason', 'review_status'])) continue;
    const id = cell(r, 'block_id');
    const block = baseline.blocks.find((b) => b.id === id);
    if (!block) { add('error', 'BLOCK_UNKNOWN', t.sheet, r.line, 'block_id', `'${id}' is not a block of the current pack`); continue; }
    const point = pair(t, r, 'center_latitude', 'center_longitude');
    if (point === 'invalid') continue;
    if (cell(r, 'update_type') === 'polygon' && !registered.has(cell(r, 'geometry_file_id'))) { add('error', 'GEOMETRY_FILE_MISSING', t.sheet, r.line, 'geometry_file_id', 'a polygon change needs a registered GeoJSON file; corners listed as columns are never a polygon'); continue; }
    if (point) {
      add('review', 'BLOCK_CENTER_CHANGE', t.sheet, r.line, undefined, `${id}: a new centre is proposed; the current surveyed centre stays until the owner approves`);
      changeRequests.push({ kind: 'block-center', id, proposed: { lat: point.lat, lng: point.lng }, reason: cell(r, 'change_reason'), reviewStatus: cell(r, 'review_status') });
    } else if (cell(r, 'update_type') === 'name') {
      changeRequests.push({ kind: 'block-name', id, en: cell(r, 'proposed_name_en'), ur: cell(r, 'proposed_name_ur'), reason: cell(r, 'change_reason'), reviewStatus: cell(r, 'review_status') });
      add('review', 'BLOCK_NAME_CHANGE', t.sheet, r.line, undefined, `${id}: a new name is proposed; it is not applied automatically`);
    }
  }

  findings.sort((a, b) => (a.sheet < b.sheet ? -1 : a.sheet > b.sheet ? 1 : (a.row ?? 0) - (b.row ?? 0) || (a.code < b.code ? -1 : a.code > b.code ? 1 : 0) || (a.field ?? '') .localeCompare(b.field ?? '')));
  const hasError = findings.some((f) => f.severity === 'error');
  const hasReview = findings.some((f) => f.severity === 'review' && f.code !== 'RIGHTS_UNCONFIRMED' && f.code !== 'TRANSLATIONS_UNREVIEWED');
  const pending = catalogAdditions.some((p) => p.location === 'pending');
  const outcome: Outcome = hasError ? 'REJECT' : hasReview ? 'NEEDS_REVIEW' : pending ? 'ACCEPT_AS_PENDING' : 'ACCEPT';
  const byId = (a: CandidateRecord, b: CandidateRecord) => ((a.id as string) < (b.id as string) ? -1 : (a.id as string) > (b.id as string) ? 1 : 0);
  for (const sev of ['error', 'warning', 'review'] as const) counts[`${sev}s`] = findings.filter((f) => f.severity === sev).length;
  return {
    schemaVersion: 1, venueId: baseline.venueId, outcome, distribution: authorized ? 'distribution-authorized' : 'internal-only', counts: Object.fromEntries(Object.entries(counts).sort()),
    findings,
    // A REJECTed intake carries no records: nothing half-valid can be merged by mistake.
    catalogAdditions: hasError ? [] : catalogAdditions.sort(byId), geometryAdditions: hasError ? [] : geometryAdditions.sort(byId),
    identities: identities.sort((a, b) => (a.id < b.id ? -1 : 1)), changeRequests: hasError ? [] : changeRequests,
    sources: input.sources,
  };
};

/** A short, human-readable summary of a candidate for the reviewer. */
export const summarize = (c: Candidate): string => {
  const lines = [`Outcome: ${c.outcome}`, `Venue: ${c.venueId}`, `Distribution: ${c.distribution}`, ''];
  lines.push('Counts:', ...Object.entries(c.counts).map(([k, v]) => `  ${k}: ${v}`), '');
  for (const sev of ['error', 'warning', 'review'] as const) {
    const items = c.findings.filter((f) => f.severity === sev);
    if (!items.length) continue;
    lines.push(`${sev.toUpperCase()} (${items.length})`, ...items.slice(0, 200).map((f) => `  [${f.code}] ${f.sheet}${f.row ? ` row ${f.row}` : ''}${f.field ? ` / ${f.field}` : ''}: ${f.message}`));
    if (items.length > 200) lines.push(`  ... and ${items.length - 200} more (see findings.json)`);
    lines.push('');
  }
  if (c.outcome === 'NEEDS_REVIEW') lines.push('A person must review the items above before this candidate can be compiled.');
  return `${lines.join('\n')}\n`;
};

export const candidateDigest = (c: Candidate): string => sha256(JSON.stringify(c));
export { normalizeHeader };

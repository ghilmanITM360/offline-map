/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { createHash } from 'node:crypto';
import { copyFileSync, lstatSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { parsePackManifest, parsePackPlaceCatalog, parsePackVenueGeometry } from '../../../packages/offline-navigation/src/index';
import { createPackOutput } from '../output';
import { loadBaseline } from './baseline';
import { candidateDigest, importIntake, sourceFingerprint, summarize, type Candidate } from './importer';
import { legacyIlaqaGrid } from './legacy';
import { parseCsv } from './table';
import { readXlsx, XlsxError } from './xlsx';

export class IntakeError extends Error { constructor(readonly code: string, message: string, readonly hint?: string) { super(message); } }
const fail = (code: string, message: string, hint?: string): never => { throw new IntakeError(code, message, hint); };
const MAX_FILE = 8 * 1024 * 1024;
const json = (v: unknown): string => `${JSON.stringify(v, null, 1)}\n`;

/** A regular file only: a link, a folder or an oversized file is refused before it is read. */
const readRegular = (path: string, max: number): Buffer => {
  const st = lstatSync(path, { throwIfNoEntry: false });
  if (!st) return fail('input-missing', `not found: ${path}`);
  if (st.isSymbolicLink() || !st.isFile()) return fail('input-unsafe', `only regular files are read (no links or folders): ${path}`);
  if (st.size > max) return fail('input-too-large', `${path} is larger than ${Math.round(max / 1024 / 1024)} MB`);
  return readFileSync(path);
};
const regularNames = (dir: string, ext: RegExp, max: number): string[] => {
  const st = lstatSync(dir, { throwIfNoEntry: false });
  if (!st || st.isSymbolicLink() || !st.isDirectory()) return fail('input-unsafe', `not a real folder: ${dir}`);
  const names = readdirSync(dir).filter((n) => ext.test(n)).sort();
  if (names.length > max) fail('input-too-large', `more than ${max} files in ${dir}`);
  return names;
};

export interface ImportArgs { workbook: string; base: string; out: string; geojson?: string }

export const runImport = (a: ImportArgs, io: { out(l: string): void }): Candidate => {
  const sheets = new Map<string, string[][]>();
  const sources: Array<{ name: string; sha256: string }> = [];
  const wb = lstatSync(a.workbook, { throwIfNoEntry: false });
  if (!wb) fail('input-missing', `not found: ${a.workbook}`);
  if (wb!.isDirectory()) {
    if (wb!.isSymbolicLink()) fail('input-unsafe', 'the CSV folder must not be a link');
    for (const n of regularNames(a.workbook, /\.csv$/i, 40)) {
      const bytes = readRegular(join(a.workbook, n), MAX_FILE);
      sources.push(sourceFingerprint(n, bytes));
      try { sheets.set(n.replace(/\.csv$/i, ''), parseCsv(bytes.toString('utf8'))); } catch (e) { fail('csv-invalid', `${n}: ${(e as Error).message}`); }
    }
  } else {
    const bytes = readRegular(a.workbook, 20 * 1024 * 1024);
    sources.push(sourceFingerprint(a.workbook.split('/').pop()!, bytes));
    try { for (const s of readXlsx(bytes)) sheets.set(s.name, s.rows); } catch (e) {
      if (e instanceof XlsxError) fail(`xlsx-${e.code}`, e.message);
      throw e;
    }
  }
  // The owner's original single-sheet workbook is accepted as an Ilaqas list in the template's shape.
  if (!sheets.has('Ilaqas')) {
    const only = [...sheets.values()];
    const legacy = only.length === 1 ? legacyIlaqaGrid(only[0]) : null;
    if (legacy) { sheets.clear(); sheets.set('Ilaqas', legacy); io.out('note: read as the original ilaqa list (ids assigned from the source Index); no Metadata sheet'); }
  }
  const geojson = new Map<string, string>();
  if (a.geojson) for (const n of regularNames(a.geojson, /\.(geo)?json$/i, 200)) {
    const bytes = readRegular(join(a.geojson, n), MAX_FILE);
    sources.push(sourceFingerprint(n, bytes));
    geojson.set(n, bytes.toString('utf8'));
  }
  let baseline;
  try { baseline = loadBaseline(a.base); } catch (e) { return fail('base-invalid', (e as Error).message); }
  const candidate = importIntake({ sheets, geojson, baseline, sources: sources.sort((x, y) => (x.name < y.name ? -1 : 1)) });

  const root = createPackOutput(a.out, null);
  writeFileSync(join(root, 'candidate.json'), json(candidate));
  writeFileSync(join(root, 'candidate.sha256'), `${createHash('sha256').update(readFileSync(join(root, 'candidate.json'))).digest('hex')}  candidate.json\n`);
  writeFileSync(join(root, 'findings.json'), json(candidate.findings));
  writeFileSync(join(root, 'SUMMARY.txt'), summarize(candidate));
  io.out(`outcome: ${candidate.outcome}`);
  io.out(`${Object.entries(candidate.counts).map(([k, v]) => `${k} ${v}`).join(', ')}`);
  io.out(`candidate folder: ${root} (candidate.json, findings.json, SUMMARY.txt)`);
  return candidate;
};

export interface MergeArgs { candidate: string; base: string; out: string; packVersion: string; approval?: string }

/** Applies an approved candidate to a copy of the base pack's resources and writes a spec for the existing compiler. Existing venue data is never edited. */
export const runMerge = (a: MergeArgs, io: { out(l: string): void }): void => {
  const candidateBytes = readRegular(join(a.candidate, 'candidate.json'), 64 * 1024 * 1024);
  const candidateSha = createHash('sha256').update(candidateBytes).digest('hex');
  const candidate = JSON.parse(candidateBytes.toString('utf8')) as Candidate;
  if (candidate.schemaVersion !== 1) fail('candidate-invalid', 'unsupported candidate version');
  if (candidate.outcome === 'REJECT') fail('candidate-rejected', 'a rejected intake cannot be merged', 'Fix the errors in findings.json and import again.');
  const reviewCodes = [...new Set(candidate.findings.filter((f) => f.severity === 'review').map((f) => f.code))].sort();
  let approvedOn = '2000-01-01', approvedBy = '';
  if (candidate.outcome === 'NEEDS_REVIEW') {
    if (!a.approval) fail('approval-required', `this candidate needs review (${reviewCodes.join(', ')}); no approval file was given`, 'A responsible person writes approval.json: {"candidateSha256", "approvedBy", "approvedOn", "acknowledge": [...codes]}.');
    const ap = JSON.parse(readRegular(a.approval!, 1024 * 1024).toString('utf8')) as { candidateSha256?: string; approvedBy?: string; approvedOn?: string; acknowledge?: string[] };
    if (ap.candidateSha256 !== candidateSha) fail('approval-mismatch', 'the approval is for a different candidate (its sha-256 does not match candidate.json)');
    if (!ap.approvedBy?.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(ap.approvedOn ?? '')) fail('approval-incomplete', 'approval needs approvedBy and approvedOn (YYYY-MM-DD)');
    const missing = reviewCodes.filter((c) => !(ap.acknowledge ?? []).includes(c));
    if (missing.length) fail('approval-incomplete', `the approval does not acknowledge: ${missing.join(', ')}`);
    approvedOn = ap.approvedOn!; approvedBy = ap.approvedBy!;
  }
  const manifestText = readFileSync(join(a.base, 'pack.manifest.json'), 'utf8');
  const m = parsePackManifest(manifestText);
  if (!m.ok) return fail('base-invalid', m.error.message);
  const pathOf = (kind: string) => m.manifest.resources.find((r) => r.kind === kind)?.path;
  const [catalogPath, geometryPath, provenancePath] = [pathOf('place-catalog'), pathOf('venue-geometry'), pathOf('provenance')];
  if (!catalogPath || !geometryPath || !provenancePath) return fail('base-invalid', 'the base pack has no place-catalog, venue-geometry and provenance resources');
  if (candidate.venueId !== m.manifest.venueId) fail('venue-mismatch', `the candidate is for '${candidate.venueId}', the base pack for '${m.manifest.venueId}'`);
  if (a.packVersion === m.manifest.packVersion) fail('version-unchanged', 'the new pack needs a new packVersion');

  const catalog = JSON.parse(readFileSync(join(a.base, catalogPath), 'utf8')) as { places: Array<{ id: string }> };
  const geometry = JSON.parse(readFileSync(join(a.base, geometryPath), 'utf8')) as { features: Array<{ id: string }> };
  const ids = new Set(catalog.places.map((p) => p.id));
  for (const p of candidate.catalogAdditions as Array<{ id: string }>) if (ids.has(p.id)) fail('id-collision', `'${p.id}' already exists in the base catalog`);
  const fids = new Set(geometry.features.map((f) => f.id));
  for (const f of candidate.geometryAdditions as Array<{ id: string }>) if (fids.has(f.id)) fail('id-collision', `feature '${f.id}' already exists in the base geometry`);
  catalog.places.push(...(candidate.catalogAdditions as Array<{ id: string }>));
  geometry.features.push(...(candidate.geometryAdditions as Array<{ id: string }>));
  // The merged files must satisfy the SDK's own strict parsers before anything is written.
  const check = (text: string, kind: 'catalog' | 'geometry') => {
    const r = kind === 'catalog' ? parsePackPlaceCatalog(text, { venueId: m.manifest.venueId, bounds: m.manifest.bounds, languages: m.manifest.languages })
      : parsePackVenueGeometry(text, { venueId: m.manifest.venueId, bounds: m.manifest.bounds });
    if (!r.ok) fail('merged-invalid', `${kind}: ${r.error.path ?? ''} ${r.error.message}`);
  };
  const catalogText = json(catalog), geometryText = json(geometry);
  check(catalogText, 'catalog'); check(geometryText, 'geometry');

  const root = createPackOutput(a.out, null);
  const inputDir = join(root, 'input');
  for (const r of m.manifest.resources) {
    mkdirSync(dirname(join(inputDir, r.path)), { recursive: true });
    if (r.path === catalogPath) writeFileSync(join(inputDir, r.path), catalogText);
    else if (r.path === geometryPath) writeFileSync(join(inputDir, r.path), geometryText);
    else if (r.path === provenancePath) {
      const prov = JSON.parse(readFileSync(join(a.base, r.path), 'utf8')) as Record<string, unknown>;
      prov.intake = { candidateSha256: candidateSha, outcome: candidate.outcome, distribution: candidate.distribution, approvedBy, approvedOn, sources: candidate.sources, changeRequestsNotApplied: candidate.changeRequests.length };
      writeFileSync(join(inputDir, r.path), json(prov));
    } else copyFileSync(join(a.base, r.path), join(inputDir, r.path));
  }
  const mm = m.manifest;
  const spec = {
    packId: `${mm.venueId}@${a.packVersion}`, venueId: mm.venueId, packVersion: a.packVersion, sdkCompatibility: mm.sdkCompatibility, routingPolicyVersion: mm.routingPolicyVersion,
    createdAt: `${approvedOn === '2000-01-01' ? mm.createdAt.slice(0, 10) : approvedOn}T00:00:00Z`, minimumPlatformCapabilities: mm.minimumPlatformCapabilities, bounds: mm.bounds,
    languages: mm.languages, resources: mm.resources.map((r) => ({ path: r.path, kind: r.kind })), attributions: mm.attributions,
    provenance: { ...mm.provenance, generatedBy: `${mm.provenance.generatedBy ?? 'venue-pack'} + client intake ${candidateSha.slice(0, 12)}` },
  };
  writeFileSync(join(root, 'pack.spec.json'), json(spec));
  if (candidate.distribution === 'internal-only') writeFileSync(join(root, 'INTERNAL_ONLY.txt'), 'The intake did not confirm redistribution rights with a named authority. Do not share this pack outside the owner organization.\n');
  io.out(`merged ${candidate.catalogAdditions.length} place(s) and ${candidate.geometryAdditions.length} geometry feature(s); ${candidate.changeRequests.length} change request(s) were recorded and NOT applied`);
  io.out(`next: venue-pack compile --spec ${join(root, 'pack.spec.json')} --input ${inputDir} --out <new folder>`);
  if (candidate.distribution === 'internal-only') io.out('note: distribution is internal-only (rights unconfirmed)');
};
export { candidateDigest };

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Real files end to end: the .xlsx reader's safety limits, then import -> review -> merge -> compile -> verify with the CLI against the
// real Karachi preset pack. Tests that need the owner's actual workbooks run only where those files exist, and say so otherwise.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPlaceCatalog, parsePackPlaceCatalog } from '@muslim-ummah/offline-navigation';
import { main } from '../../scripts/sdk-pack/cli';
import { buildKarachiPack } from '../../scripts/sdk-pack/karachi';
import { readXlsx, XlsxError } from '../../scripts/sdk-pack/intake/xlsx';
import { xlsx, zip } from './helpers/xlsxWriter';

jest.setTimeout(120_000);
const work = mkdtempSync(join(tmpdir(), 'sdk-intake-'));
const base = join(work, 'base');
beforeAll(async () => { await buildKarachiPack(base, { write: true, preset: true }); });
afterAll(() => rmSync(work, { recursive: true, force: true }));

const run = async (...args: string[]) => {
  const out: string[] = [], err: string[] = [];
  const code = await main(args, { out: (l) => out.push(l), err: (l) => err.push(l) });
  return { code, out: out.join('\n'), err: err.join('\n') };
};
const sha = (p: string) => createHash('sha256').update(readFileSync(p)).digest('hex');
const refused = (buf: Buffer): string => { try { readXlsx(buf); return 'OK'; } catch (e) { return e instanceof XlsxError ? e.code : `other:${(e as Error).message}`; } };

describe('xlsx reader', () => {
  const grid = { Ilaqas: [['ilaqa_id*', 'name_ur*'], ['IL-1', 'اسن آباد & "x" <y>'], ['IL-2', '']] };
  it('reads inline strings, Urdu text and entities; blank cells are empty', () => {
    expect(readXlsx(xlsx(grid))[0]).toEqual({ name: 'Ilaqas', rows: [['ilaqa_id*', 'name_ur*'], ['IL-1', 'اسن آباد & "x" <y>'], ['IL-2']] });
  });
  it('reads workbooks whose XML uses a namespace prefix (as the Open XML SDK writes it)', () => {
    expect(readXlsx(xlsx(grid, [], 'x'))[0].rows[1]).toEqual(['IL-1', 'اسن آباد & "x" <y>']);
  });
  it('refuses what an intake never needs', () => {
    const ok = xlsx(grid);
    expect(refused(Buffer.from('not a zip at all'))).toBe('not-xlsx');
    expect(refused(zip([{ name: 'readme.txt', data: 'x' }]))).toBe('not-xlsx');
    expect(refused(xlsx(grid, [{ name: 'xl/vbaProject.bin', data: 'macro' }]))).toBe('active-content');
    expect(refused(xlsx(grid, [{ name: 'xl/externalLinks/externalLink1.xml', data: '<x/>' }]))).toBe('active-content');
    expect(refused(xlsx(grid, [{ name: '../evil.xml', data: 'x' }]))).toBe('unsafe-name');
    expect(refused(xlsx(grid, [{ name: 'xl/media\\evil.xml', data: 'x' }]))).toBe('unsafe-name');
    expect(refused(xlsx(grid, [{ name: 'xl/worksheets/enc.xml', data: 'x', flags: 1 }]))).toBe('encrypted');
    expect(refused(zip([...Array.from({ length: 401 }, (_, i) => ({ name: `p${i}.xml`, data: 'x' }))]))).toBe('too-many-entries');
    expect(refused(xlsx(grid, [{ name: 'xl/big.xml', data: Buffer.alloc(33 * 1024 * 1024) }]))).toBe('entry-too-large');
    expect(refused(Buffer.alloc(21 * 1024 * 1024))).toBe('file-too-large');
    const doctype = xlsx({ A: [['x']] }).toString('latin1');
    expect(doctype).toBeTruthy();
    expect(refused(xlsx(grid, [{ name: 'xl/sharedStrings.xml', data: '<!DOCTYPE x [<!ENTITY a "b">]><sst/>' }]))).toBe('active-content');
    expect(readXlsx(ok)).toHaveLength(1);
  });
});

describe('import -> review -> merge -> compile -> verify (CLI, real Karachi preset base)', () => {
  const csvDir = join(work, 'csv');
  beforeAll(() => {
    mkdirSync(csvDir);
    writeFileSync(join(csvDir, 'Ilaqas.csv'), '﻿Title\r\n\r\nilaqa_id*,source_index,marhala*,name_ur*,name_ur_latn*,name_en*,catalog_status*,name_review*\r\nIL-0001,1,1,اسن آباد,Asan Abad,Asan Abad,pending_location,duplicate_name_review\r\nIL-0002,2,1,اسن آباد,Asan Abad,Asan Abad,pending_location,duplicate_name_review\r\nIL-0003,3,2,"نام, کاما",Name Comma,"Name, Comma",pending_location,approved\r\n');
    writeFileSync(join(csvDir, 'Tents.csv'), 'tent_id*,ilaqa_id*,latitude,longitude,status*\r\nTN-1,IL-0003,,,pending\r\nTN-2,IL-0003,,,pending\r\n');
    writeFileSync(join(csvDir, 'Metadata.csv'), 'field,client_entry\r\nvenue_id,karachi-ijtema\r\ncoordinate_system,WGS84\r\nredistribution_allowed,Unconfirmed\r\n');
  });
  let cand: string;
  it('imports CSV into a fresh candidate folder: NEEDS_REVIEW because of the duplicate pair, nothing written anywhere else', async () => {
    cand = join(work, 'cand');
    const r = await run('import', '--workbook', csvDir, '--base', base, '--out', cand);
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/outcome: NEEDS_REVIEW/);
    const c = JSON.parse(readFileSync(join(cand, 'candidate.json'), 'utf8'));
    expect(c.catalogAdditions.map((p: { id: string }) => p.id)).toEqual(['IL-0001', 'IL-0002', 'IL-0003', 'TN-1', 'TN-2']);
    expect(c.distribution).toBe('internal-only');
    expect(readFileSync(join(cand, 'SUMMARY.txt'), 'utf8')).toMatch(/DUPLICATE_NAME/);
  });
  it('never overwrites: a repeated import into the same folder is refused and the first candidate is untouched', async () => {
    const before = sha(join(cand, 'candidate.json'));
    const again = await run('import', '--workbook', csvDir, '--base', base, '--out', cand);
    expect(again.code).toBe(1);
    expect(again.err).toMatch(/already exists/);
    expect(sha(join(cand, 'candidate.json'))).toBe(before);
    await run('import', '--workbook', csvDir, '--base', base, '--out', join(work, 'cand2'));
    expect(sha(join(work, 'cand2', 'candidate.json'))).toBe(before); // reproducible
  });
  it('merge needs a matching, complete approval for a NEEDS_REVIEW candidate', async () => {
    const out = (n: string) => join(work, n);
    expect((await run('merge', '--candidate', cand, '--base', base, '--pack-version', '1.2.0', '--out', out('m0'))).err).toMatch(/approval-required/);
    const ap = (o: object) => { const f = join(work, `ap-${Math.random()}.json`); writeFileSync(f, JSON.stringify(o)); return f; };
    const good = { candidateSha256: sha(join(cand, 'candidate.json')), approvedBy: 'Owner', approvedOn: '2026-11-11', acknowledge: ['DUPLICATE_NAME', 'RIGHTS_UNCONFIRMED', 'TRANSLATIONS_UNREVIEWED'] };
    expect((await run('merge', '--candidate', cand, '--base', base, '--pack-version', '1.2.0', '--approval', ap({ ...good, candidateSha256: 'f'.repeat(64) }), '--out', out('m1'))).err).toMatch(/approval-mismatch/);
    expect((await run('merge', '--candidate', cand, '--base', base, '--pack-version', '1.2.0', '--approval', ap({ ...good, acknowledge: ['DUPLICATE_NAME'] }), '--out', out('m2'))).err).toMatch(/does not acknowledge/);
    expect((await run('merge', '--candidate', cand, '--base', base, '--pack-version', '1.1.0', '--approval', ap(good), '--out', out('m3'))).err).toMatch(/version-unchanged/);
    const merged = await run('merge', '--candidate', cand, '--base', base, '--pack-version', '1.2.0', '--approval', ap(good), '--out', out('m4'));
    expect(merged.code).toBe(0);
    expect(merged.out).toMatch(/merged 5 place\(s\)/);
    expect(existsSync(join(out('m4'), 'INTERNAL_ONLY.txt'))).toBe(true);
  });
  it('the merged inputs go through the EXISTING compiler and verifier; routing data is byte-identical to the base', async () => {
    const m = join(work, 'm4');
    const packOut = join(work, 'final');
    const compiled = await run('compile', '--spec', join(m, 'pack.spec.json'), '--input', join(m, 'input'), '--out', packOut);
    expect(compiled.code).toBe(0);
    expect((await run('verify', join(packOut, 'pack'))).code).toBe(0);
    for (const f of ['data/routing-graph.json', 'data/place-directory.json', 'data/gate-metadata.json', 'map/ijtema-basemap.pmtiles']) expect(sha(join(packOut, 'pack', f))).toBe(sha(join(base, f)));
    const cat = parsePackPlaceCatalog(readFileSync(join(packOut, 'pack/data/place-catalog.json'), 'utf8'), { venueId: 'karachi-ijtema' });
    if (!cat.ok) throw new Error(cat.error.message);
    const c = createPlaceCatalog(cat.catalog);
    expect(c.list()).toHaveLength(60 + 5);
    expect(c.search('asan abad').map((h) => h.place.id).sort()).toEqual(['IL-0001', 'IL-0002']);
    expect(c.search('asan abad')[0].sameNameAs).toHaveLength(1); // the namesake is reported, never merged
    expect(c.availability('IL-0001')).toMatchObject({ message: 'location_pending', canRoute: false });
    expect(c.availability('B5')).toMatchObject({ message: 'provisional_access', canRoute: true });
    expect(c.availability('GATE_18')).toMatchObject({ message: 'unreachable', canRoute: false });
    expect(JSON.parse(readFileSync(join(packOut, 'pack/PROVENANCE.json'), 'utf8')).intake).toMatchObject({ outcome: 'NEEDS_REVIEW', distribution: 'internal-only', approvedBy: 'Owner' });
  });
  it('a REJECT candidate exits non-zero and cannot be merged', async () => {
    const bad = join(work, 'csv-bad');
    mkdirSync(bad);
    writeFileSync(join(bad, 'Ilaqas.csv'), 'ilaqa_id*,marhala*,name_ur*,name_ur_latn*,name_en*,catalog_status*,name_review*\r\nIL-1,1,a,a,a,pending_location,approved\r\n');
    writeFileSync(join(bad, 'Tents.csv'), 'tent_id*,ilaqa_id*,latitude,longitude,status*\r\nTN-1,IL-1,67.0015,24.9705,proposed\r\n');
    const r = await run('import', '--workbook', bad, '--base', base, '--out', join(work, 'cand-bad'));
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/outcome: REJECT/);
    expect(readFileSync(join(work, 'cand-bad', 'SUMMARY.txt'), 'utf8')).toMatch(/COORDINATE_/);
    expect((await run('merge', '--candidate', join(work, 'cand-bad'), '--base', base, '--pack-version', '1.3.0', '--out', join(work, 'm-bad'))).err).toMatch(/candidate-rejected/);
  });
  it('refuses links, oversized and missing inputs, and a base pack that lacks geometry', async () => {
    const link = join(work, 'link.xlsx');
    writeFileSync(join(work, 'real.xlsx'), xlsx({ Ilaqas: [['ilaqa_id']] }));
    symlinkSync(join(work, 'real.xlsx'), link);
    expect((await run('import', '--workbook', link, '--base', base, '--out', join(work, 'c-link'))).err).toMatch(/input-unsafe/);
    expect((await run('import', '--workbook', join(work, 'nope.xlsx'), '--base', base, '--out', join(work, 'c-none'))).err).toMatch(/input-missing/);
    const v1 = join(work, 'v1');
    await buildKarachiPack(v1, { write: true });
    expect((await run('import', '--workbook', csvDir, '--base', v1, '--out', join(work, 'c-v1'))).err).toMatch(/base-invalid.*venue-geometry/);
  });
});

const OWNER = join(homedir(), 'Downloads', 'Map data.xlsx');
const TEMPLATE = join(homedir(), 'Downloads', 'Karachi_Ijtema_Client_Location_Data_Template.xlsx');
(existsSync(OWNER) ? describe : describe.skip)("the owner's actual Map data.xlsx (skipped where the file is absent)", () => {
  it('100 rows: 99 named ilaqas kept with stable ids, the Index 48 placeholder excluded, five duplicate pairs flagged, zero coordinates', async () => {
    const out = join(work, 'cand-owner');
    const before = sha(OWNER);
    const r = await run('import', '--workbook', OWNER, '--base', base, '--out', out);
    expect(r.code).toBe(0);
    const c = JSON.parse(readFileSync(join(out, 'candidate.json'), 'utf8'));
    expect(c.outcome).toBe('NEEDS_REVIEW');
    expect(c.identities).toHaveLength(100);
    expect(c.identities.filter((i: { status: string }) => i.status === 'excluded')).toEqual([{ id: 'IL-0048', kind: 'ilaqa', status: 'excluded', reason: 'PLACEHOLDER' }]);
    expect(c.catalogAdditions).toHaveLength(99);
    const dup = c.catalogAdditions.filter((p: { flags: string[] }) => p.flags.includes('DUPLICATE_NAME'));
    expect(dup).toHaveLength(10);
    expect(c.catalogAdditions.filter((p: { marhala: number }) => p.marhala === 1)).toHaveLength(47);
    expect(c.catalogAdditions.filter((p: { marhala: number }) => p.marhala === 2)).toHaveLength(52);
    expect(c.catalogAdditions.every((p: Record<string, unknown>) => p.location === 'pending' && !('coordinate' in p))).toBe(true);
    expect(c.geometryAdditions).toEqual([]);
    expect(sha(OWNER)).toBe(before); // the original workbook is never modified
  });
});
(existsSync(TEMPLATE) ? describe : describe.skip)("the client template workbook (skipped where the file is absent)", () => {
  it('reads all nine sheets; its Ilaqas sheet gives the same identities and names as the original list', async () => {
    const out = join(work, 'cand-template');
    const r = await run('import', '--workbook', TEMPLATE, '--base', base, '--out', out);
    expect(r.code).toBe(0);
    const c = JSON.parse(readFileSync(join(out, 'candidate.json'), 'utf8'));
    expect(c.catalogAdditions).toHaveLength(99);
    expect(c.identities).toHaveLength(100);
    if (existsSync(OWNER)) {
      const o = JSON.parse(readFileSync(join(work, 'cand-owner', 'candidate.json'), 'utf8'));
      const key = (p: { id: string; names: object; marhala: number }) => JSON.stringify([p.id, p.names, p.marhala]);
      expect(c.catalogAdditions.map(key)).toEqual(o.catalogAdditions.map(key));
    }
    expect(c.findings.filter((f: { code: string }) => f.code === 'METADATA_INCOMPLETE').length).toBeGreaterThan(0); // the template ships with blank rights fields
  });
});

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// A small, dependency-free .xlsx reader for the client intake workbook. It reads cell VALUES only (a formula's cached result, never the
// formula), keeps everything in memory (nothing is extracted to disk, so no entry name can become a path), and refuses what an intake file
// never needs: encrypted or ZIP64 archives, macros, external links, DOCTYPE/ENTITY declarations, and anything over the size limits below.
import { inflateRawSync } from 'node:zlib';

export const XLSX_LIMITS = { fileBytes: 20 * 1024 * 1024, entries: 400, entryBytes: 32 * 1024 * 1024, totalBytes: 96 * 1024 * 1024, cells: 2_000_000 } as const;
export class XlsxError extends Error { constructor(readonly code: string, message: string) { super(message); } }
const bad = (code: string, message: string): never => { throw new XlsxError(code, message); };

type Entry = { name: string; method: number; csize: number; usize: number; offset: number };

const readEntries = (buf: Buffer): Entry[] => {
  if (buf.length > XLSX_LIMITS.fileBytes) bad('file-too-large', `the workbook is larger than ${XLSX_LIMITS.fileBytes / 1024 / 1024} MB`);
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65535); i--) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) return bad('not-xlsx', 'not an .xlsx file (no zip directory found)');
  const count = buf.readUInt16LE(eocd + 10), dirSize = buf.readUInt32LE(eocd + 12), dirOffset = buf.readUInt32LE(eocd + 16);
  if (count === 0xffff || dirOffset === 0xffffffff) bad('zip64-refused', 'ZIP64 archives are not accepted');
  if (count > XLSX_LIMITS.entries) bad('too-many-entries', `the workbook has more than ${XLSX_LIMITS.entries} parts`);
  if (dirOffset + dirSize > eocd) bad('not-xlsx', 'corrupt zip directory');
  const entries: Entry[] = [];
  let p = dirOffset, total = 0;
  for (let i = 0; i < count; i++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== 0x02014b50) return bad('not-xlsx', 'corrupt zip directory entry');
    const flags = buf.readUInt16LE(p + 8), method = buf.readUInt16LE(p + 10), csize = buf.readUInt32LE(p + 20), usize = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28), extraLen = buf.readUInt16LE(p + 30), commentLen = buf.readUInt16LE(p + 32), offset = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    if (flags & 1) bad('encrypted', 'encrypted workbooks are not accepted');
    if (csize === 0xffffffff || usize === 0xffffffff) bad('zip64-refused', 'ZIP64 archives are not accepted');
    if (name.startsWith('/') || name.includes('..') || name.includes('\\') || /^[A-Za-z]:/.test(name)) bad('unsafe-name', `unsafe part name: ${name}`);
    if (/vbaProject|externalLinks\/|\/activeX|\.bin$/i.test(name)) bad('active-content', `macros, external links and embedded objects are not accepted (${name})`);
    if (usize > XLSX_LIMITS.entryBytes) bad('entry-too-large', `part ${name} is too large`);
    total += usize;
    if (total > XLSX_LIMITS.totalBytes) bad('archive-too-large', 'the workbook expands to too much data');
    if (!name.endsWith('/')) entries.push({ name, method, csize, usize, offset });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
};

const read = (buf: Buffer, e: Entry): string => {
  if (e.offset + 30 > buf.length || buf.readUInt32LE(e.offset) !== 0x04034b50) return bad('not-xlsx', `corrupt local header for ${e.name}`);
  const start = e.offset + 30 + buf.readUInt16LE(e.offset + 26) + buf.readUInt16LE(e.offset + 28);
  const raw = buf.subarray(start, start + e.csize);
  if (raw.length !== e.csize) bad('not-xlsx', `truncated part ${e.name}`);
  let data: Buffer;
  if (e.method === 0) data = raw;
  else if (e.method === 8) { try { data = inflateRawSync(raw, { maxOutputLength: e.usize + 1 }); } catch { return bad('not-xlsx', `cannot decompress ${e.name}`); } }
  else return bad('not-xlsx', `unsupported compression in ${e.name}`);
  if (data.length !== e.usize) bad('not-xlsx', `size mismatch in ${e.name}`);
  const text = data.toString('utf8');
  if (/<!DOCTYPE|<!ENTITY/i.test(text)) bad('active-content', `${e.name} declares a DOCTYPE or ENTITY, which is not accepted`);
  return text;
};

const decode = (s: string): string =>
  s.replace(/&(#x[0-9a-fA-F]+|#\d+|amp|lt|gt|quot|apos);/g, (_, g: string) => {
    if (g[0] === '#') return String.fromCodePoint(g[1] === 'x' ? parseInt(g.slice(2), 16) : parseInt(g.slice(1), 10));
    return ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" } as Record<string, string>)[g];
  });
// Elements may carry any namespace prefix (`<x:row>` from the Open XML SDK as well as plain `<row>`), so every pattern allows one.
const P = '(?:[A-Za-z_][\\w.-]*:)?';
const re = (source: string, flags = 'g'): RegExp => new RegExp(source.replaceAll('<', `<${P}`).replaceAll('</', `</${P}`).replaceAll(`<${P}/`, '</'.concat(P)), flags);
const textOf = (xml: string): string => [...xml.replace(re('<rPh[\\s\\S]*?</rPh>'), '').matchAll(re('<t(?:\\s[^>]*)?>([\\s\\S]*?)</t>'))].map((m) => decode(m[1])).join('');
const colIndex = (ref: string): number => [...ref.replace(/\d+/g, '')].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;

export interface Sheet { name: string; rows: string[][] }

/** Every worksheet as a grid of strings (row 0 = spreadsheet row 1). Empty cells are ''. */
export const readXlsx = (buf: Buffer): Sheet[] => {
  const entries = readEntries(buf);
  const byName = new Map(entries.map((e) => [e.name, e]));
  const part = (name: string): string | undefined => { const e = byName.get(name); return e ? read(buf, e) : undefined; };
  const workbook = part('xl/workbook.xml');
  if (!workbook) return bad('not-xlsx', 'no xl/workbook.xml: not an .xlsx workbook');
  const rels = new Map([...(part('xl/_rels/workbook.xml.rels') ?? '').matchAll(re('<Relationship\\b[^>]*>'))].map((m) => {
    const id = /\bId="([^"]*)"/.exec(m[0])?.[1], target = /\bTarget="([^"]*)"/.exec(m[0])?.[1];
    return [id ?? '', target ?? ''] as const;
  }));
  const shared = [...(part('xl/sharedStrings.xml') ?? '').matchAll(re('<si>([\\s\\S]*?)</si>'))].map((m) => textOf(m[1]));
  let cells = 0;
  return [...workbook.matchAll(re('<sheet\\b[^>]*>'))].map((m): Sheet => {
    const name = decode(/\bname="([^"]*)"/.exec(m[0])?.[1] ?? '');
    const target = rels.get(/\br:id="([^"]*)"/.exec(m[0])?.[1] ?? '') ?? '';
    const xml = part(target.startsWith('/') ? target.slice(1) : `xl/${target}`) ?? bad('not-xlsx', `worksheet ${name} is missing`);
    const rows: string[][] = [];
    for (const row of xml.matchAll(re('<row\\b([^>]*?)(?:/>|>([\\s\\S]*?)</row>)'))) {
      const r = parseInt(/\br="(\d+)"/.exec(row[1])?.[1] ?? '0', 10) - 1;
      if (r < 0 || r > 200_000) continue;
      const out: string[] = rows[r] ?? [];
      for (const c of (row[2] ?? '').matchAll(re('<c\\b([^>]*?)(?:/>|>([\\s\\S]*?)</c>)'))) {
        if (++cells > XLSX_LIMITS.cells) bad('too-many-cells', 'the workbook has too many cells');
        const ref = /\br="([A-Z]+\d+)"/.exec(c[1])?.[1];
        if (!ref) continue;
        const type = /\bt="([^"]*)"/.exec(c[1])?.[1] ?? 'n';
        const body = c[2] ?? '';
        const v = re('<v>([\\s\\S]*?)</v>', '').exec(body)?.[1];
        const value = type === 's' ? shared[Number(v)] ?? '' : type === 'inlineStr' ? textOf(body) : v === undefined ? '' : decode(v);
        const col = colIndex(ref);
        if (col > 500) continue;
        while (out.length <= col) out.push('');
        out[col] = value;
      }
      rows[r] = out;
    }
    for (let i = 0; i < rows.length; i++) rows[i] ??= [];
    return { name, rows };
  });
};

/** Excel stores dates as day counts (1900 system). Returns YYYY-MM-DD, or the input unchanged when it is not a plausible serial. */
export const excelSerialToIso = (value: string): string => {
  const n = Number(value);
  if (!/^\d+(\.\d+)?$/.test(value) || n < 20000 || n > 80000) return value;
  return new Date(Date.UTC(1899, 11, 30) + Math.floor(n) * 86400000).toISOString().slice(0, 10);
};

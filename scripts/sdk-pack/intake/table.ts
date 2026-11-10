/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { excelSerialToIso } from './xlsx';

// Grids (from .xlsx or UTF-8 CSV) become tables of named columns. Columns are matched by HEADER NAME, never by position, so a client can
// reorder or add columns. A trailing `*` (required marker) and case are ignored; `Logitude` (the owner's original spelling) is a documented
// alias of `longitude`.
export const HEADER_ALIASES: Readonly<Record<string, string>> = { logitude: 'longitude', lng: 'longitude', lon: 'longitude', long: 'longitude', lat: 'latitude' };
export const normalizeHeader = (h: string): string => {
  const key = h.trim().toLowerCase().replace(/\*+$/, '').replace(/[\s-]+/g, '_');
  return HEADER_ALIASES[key] ?? key;
};

export interface TableRow { /** 1-based spreadsheet row, for diagnostics. */ line: number; cells: Readonly<Record<string, string>> }
export interface Table { sheet: string; headerLine: number; columns: readonly string[]; rows: readonly TableRow[] }

const DATE_COLUMNS = /(_on|_date)$/;
/** Finds the header row (the first row that contains `anchor`) and reads every following row that has any value. Formula-check columns are dropped. */
export const readTable = (sheet: string, grid: readonly (readonly string[])[], anchor: string): Table | null => {
  const headerIdx = grid.findIndex((row) => row.some((c) => normalizeHeader(c) === anchor));
  if (headerIdx < 0) return null;
  const header = grid[headerIdx].map(normalizeHeader);
  const rows: TableRow[] = [];
  for (let i = headerIdx + 1; i < grid.length; i++) {
    const cells: Record<string, string> = Object.create(null);
    let any = false;
    header.forEach((name, c) => {
      if (!name || name === 'entry_check') return;
      let value = (grid[i][c] ?? '').trim();
      if (DATE_COLUMNS.test(name)) value = excelSerialToIso(value);
      if (value !== '') any = true;
      cells[name] = value;
    });
    if (any) rows.push({ line: i + 1, cells });
  }
  return { sheet, headerLine: headerIdx + 1, columns: header.filter((h) => h && h !== 'entry_check'), rows };
};

/** RFC 4180 CSV (UTF-8, optional BOM, quoted fields, "" escapes, CRLF or LF). Refuses input over `maxBytes`. */
export const parseCsv = (text: string, maxBytes = 8 * 1024 * 1024): string[][] => {
  if (Buffer.byteLength(text) > maxBytes) throw new Error('csv-too-large');
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [], field = '', quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') { if (src[i + 1] === '"') { field += '"'; i++; } else quoted = false; } else field += ch;
    } else if (ch === '"' && field === '') quoted = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && src[i + 1] === '\n') i++; row.push(field); rows.push(row); row = []; field = ''; }
    else field += ch;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
};

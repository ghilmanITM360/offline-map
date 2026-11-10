/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { crc32, deflateRawSync } from 'node:zlib';

// Test-only: builds a real .xlsx (zip of XML parts) from grids, with inline strings, so the reader and the importer are tested on genuine
// files. `extra` adds raw parts (a macro, an external link...) and `raw` lets a test write any part name/bytes/flags it needs.
const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const col = (i: number): string => { let n = i + 1, s = ''; while (n > 0) { s = String.fromCharCode(65 + ((n - 1) % 26)) + s; n = Math.floor((n - 1) / 26); } return s; };

export interface ZipPart { name: string; data: Buffer | string; deflate?: boolean; flags?: number }
export const zip = (parts: ZipPart[]): Buffer => {
  const chunks: Buffer[] = [], central: Buffer[] = [];
  let offset = 0;
  for (const p of parts) {
    const raw = Buffer.from(p.data);
    const body = p.deflate === false ? raw : deflateRawSync(raw);
    const name = Buffer.from(p.name);
    const h = Buffer.alloc(30);
    h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(p.flags ?? 0, 6); h.writeUInt16LE(p.deflate === false ? 0 : 8, 8);
    h.writeUInt32LE(crc32(raw), 14); h.writeUInt32LE(body.length, 18); h.writeUInt32LE(raw.length, 22); h.writeUInt16LE(name.length, 26);
    chunks.push(h, name, body);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(p.flags ?? 0, 8); c.writeUInt16LE(p.deflate === false ? 0 : 8, 10);
    c.writeUInt32LE(crc32(raw), 16); c.writeUInt32LE(body.length, 20); c.writeUInt32LE(raw.length, 24); c.writeUInt16LE(name.length, 28); c.writeUInt32LE(offset, 42);
    central.push(c, name);
    offset += 30 + name.length + body.length;
  }
  const dir = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(parts.length, 8); end.writeUInt16LE(parts.length, 10); end.writeUInt32LE(dir.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...chunks, dir, end]);
};

export const xlsx = (sheets: Record<string, string[][]>, extra: ZipPart[] = [], prefix = ''): Buffer => {
  const names = Object.keys(sheets);
  const p = prefix ? `${prefix}:` : '';
  const ns = prefix ? ` xmlns:${prefix}="http://schemas.openxmlformats.org/spreadsheetml/2006/main"` : ' xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"';
  const parts: ZipPart[] = [
    { name: 'xl/workbook.xml', data: `<?xml version="1.0"?><${p}workbook${ns} xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><${p}sheets>${names.map((n, i) => `<${p}sheet name="${esc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</${p}sheets></${p}workbook>` },
    { name: 'xl/_rels/workbook.xml.rels', data: `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${names.map((_, i) => `<Relationship Id="rId${i + 1}" Type="x" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}</Relationships>` },
    ...names.map((n, i): ZipPart => ({
      name: `xl/worksheets/sheet${i + 1}.xml`,
      data: `<?xml version="1.0"?><${p}worksheet${ns}><${p}sheetData>${sheets[n].map((row, r) => `<${p}row r="${r + 1}">${row.map((v, c) => (v === '' ? '' : `<${p}c r="${col(c)}${r + 1}" t="inlineStr"><${p}is><${p}t>${esc(v)}</${p}t></${p}is></${p}c>`)).join('')}</${p}row>`).join('')}</${p}sheetData></${p}worksheet>`,
    })),
    ...extra,
  ];
  return zip(parts);
};

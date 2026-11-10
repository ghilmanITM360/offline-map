/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { normalizeHeader } from './table';

// The owner's original 100-row workbook (`Map data.xlsx`: Marhala, #, Index, Urdu, Roman, English, Logitude, Latitude) as an Ilaqas grid in the
// intake template's shape. Ids are assigned from the source Index (`IL-0001`..), once, exactly as the template does, so both entry routes
// give the same provisional identities. Names are carried unchanged; nothing is merged, corrected or invented. Coordinate columns are not
// read: an ilaqa is a named group, and a tent point has to come from a survey.
export const legacyIlaqaGrid = (grid: readonly (readonly string[])[]): string[][] | null => {
  const headerIdx = grid.findIndex((row) => row.some((c) => normalizeHeader(c) === 'index') && row.some((c) => normalizeHeader(c) === 'roman'));
  if (headerIdx < 0) return null;
  const col = Object.fromEntries(grid[headerIdx].map((c, i) => [normalizeHeader(c), i]));
  const src = grid.slice(headerIdx + 1).filter((r) => (r[col.index] ?? '').trim() !== '' && (r[col.urdu] ?? '').trim() !== '');
  const nameKey = (r: readonly string[]) => `${(r[col.english] ?? '').trim().toLowerCase()}|${(r[col.urdu] ?? '').trim()}`;
  const seen = new Map<string, number>();
  for (const r of src) seen.set(nameKey(r), (seen.get(nameKey(r)) ?? 0) + 1);
  const out: string[][] = [['ilaqa_id', 'source_index', 'marhala', 'name_ur', 'name_ur_latn', 'name_en', 'catalog_status', 'name_review', 'client_notes']];
  for (const r of src) {
    const index = Math.round(Number(r[col.index]));
    const [ur, latn, en] = [(r[col.urdu] ?? '').trim(), (r[col.roman] ?? '').trim(), (r[col.english] ?? '').trim()];
    const placeholder = /^[\s\-–—_.?]*$/.test(en) && /^[\s\-–—_.?]*$/.test(ur);
    out.push([
      `IL-${String(index).padStart(4, '0')}`, String(index), String(Math.round(Number(r[col.marhala]))), ur, latn, en, 'pending_location',
      placeholder ? 'missing_name' : (seen.get(nameKey(r)) ?? 0) > 1 ? 'duplicate_name_review' : 'unreviewed', placeholder ? 'source uses a placeholder name' : '',
    ]);
  }
  return out;
};

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Coordinate and translation checks that run on every venue pack before it is compiled or verified. Pure functions over already-parsed data.
// Three levels, never mixed:
//   errors  - the data is wrong (a swapped or zero coordinate, a point outside the venue, a place with no English name); nothing is written.
//   warnings - real findings that can be intentional (a place with no Urdu name, an unreachable gate); they block only under --strict.
//   review  - needs a human decision (a translation identical to English, which may be a draft or fallback); never blocks, always listed.
// Each message names the file, the record and the field. Decimal places are never read as survey accuracy.
import { diagnoseCoordinate, haversineM, type CoordinateProblem, type GeoBounds, type VenueDataSource } from '../../packages/offline-navigation/src/index';

export interface Findings { errors: string[]; warnings: string[]; review: string[] }
export const emptyFindings = (): Findings => ({ errors: [], warnings: [], review: [] });

const WHY: Record<CoordinateProblem, string> = {
  'not-finite': 'is not a finite number',
  'out-of-wgs84': 'is outside the valid latitude/longitude range',
  'null-island': 'is exactly (0, 0), which is a missing value, not a place',
  swapped: 'looks swapped: latitude and longitude are in the wrong fields (it fits the venue only the other way round)',
  'outside-bounds': 'lies outside the venue bounds declared in the spec',
};

/** The venue bounds themselves must be a real, non-degenerate WGS84 box that does not contain (0, 0) by accident. */
export const checkBounds = (b: GeoBounds, out: Findings): void => {
  const where = 'spec.bounds';
  const finite = [b.west, b.south, b.east, b.north].every(Number.isFinite);
  if (!finite || Math.abs(b.south) > 90 || Math.abs(b.north) > 90 || Math.abs(b.west) > 180 || Math.abs(b.east) > 180) { out.errors.push(`${where}: west/south/east/north must be finite WGS84 degrees`); return; }
  if (b.west >= b.east || b.south >= b.north) out.errors.push(`${where}: west must be less than east and south less than north`);
  if (b.west <= 0 && b.east >= 0 && b.south <= 0 && b.north >= 0) out.errors.push(`${where}: the bounds contain (0, 0); a venue box that large is almost certainly a mistake`);
};

export const checkGraphCoordinates = (source: VenueDataSource, bounds: GeoBounds, file: string, out: Findings): void => {
  const degree = new Map<string, number>();
  for (const id of source.graph.nodeIds()) {
    const node = source.graph.getNode(id)!;
    const problem = diagnoseCoordinate(node.coordinate, bounds);
    if (problem) out.errors.push(`${file}: nodes['${id}'].lat/lng (${node.coordinate.lat}, ${node.coordinate.lng}) ${WHY[problem]}`);
    for (const e of source.graph.edgesFrom(id)) {
      degree.set(id, (degree.get(id) ?? 0) + 1);
      degree.set(e.to, (degree.get(e.to) ?? 0) + 1);
      const to = source.graph.getNode(e.to);
      if (to && !problem) {
        const straight = haversineM(node.coordinate, to.coordinate);
        // A walkway far longer than the straight line is either a real detour or a wrong distance; either way a person should look.
        if (e.distanceM > straight * 4 && e.distanceM - straight > 100) out.warnings.push(`${file}: edge ${id}->${e.to}.distanceM ${e.distanceM.toFixed(0)} m is over 4x the straight line (${straight.toFixed(0)} m)`);
      }
    }
  }
  for (const id of source.graph.nodeIds()) if (!degree.get(id)) out.warnings.push(`${file}: nodes['${id}'] has no edges, so no route can use it`);
};

/** Gate/facility records: any coordinate they carry gets the same swapped/zero/outside treatment as a graph node. */
export const checkGateCoordinates = (gateText: string, bounds: GeoBounds, file: string, out: Findings): void => {
  let doc: { gates?: Array<{ id?: unknown; lat?: unknown; lng?: unknown }> };
  try { doc = JSON.parse(gateText); } catch { return; } // the compiler already requires this file to be JSON naming the venue
  (Array.isArray(doc.gates) ? doc.gates : []).forEach((g, i) => {
    if (typeof g.lat !== 'number' && typeof g.lng !== 'number') return; // a gate with no coordinate is a known gap, reported by the data, not invented here
    const problem = diagnoseCoordinate({ lat: Number(g.lat), lng: Number(g.lng) }, bounds);
    if (problem) out.errors.push(`${file}: gates[${i}] ('${String(g.id)}').lat/lng (${String(g.lat)}, ${String(g.lng)}) ${WHY[problem]}`);
  });
};

/** Every place needs an English name (the fallback every other language relies on); other declared languages are reported per place. */
export const checkTranslations = (locText: string, source: VenueDataSource, languages: readonly string[], file: string, out: Findings): void => {
  let loc: { entries?: Array<{ id?: unknown; names?: Record<string, unknown> }> };
  try { loc = JSON.parse(locText); } catch { return; }
  const entries = Array.isArray(loc.entries) ? loc.entries : [];
  const byId = new Map<string, Record<string, unknown>>();
  entries.forEach((entry, i) => {
    if (typeof entry.id !== 'string') return;
    if (byId.has(entry.id)) out.errors.push(`${file}: entries[${i}].id '${entry.id}' appears twice; one place cannot have two name records`);
    else byId.set(entry.id, entry.names ?? {});
  });
  const identical = new Map<string, string[]>();
  for (const pid of source.placeIds()) {
    const names = byId.get(pid);
    if (!names) { out.warnings.push(`${file}: place '${pid}' has no localization entry`); continue; }
    const text = (lang: string): string => (typeof names[lang] === 'string' ? (names[lang] as string).trim() : '');
    if (!text('en')) out.errors.push(`${file}: place '${pid}'.names.en is missing or empty (English is the fallback for every language)`);
    for (const lang of languages) {
      if (lang === 'en') continue;
      if (!text(lang)) out.warnings.push(`${file}: place '${pid}'.names.${lang} is missing`);
      else if (text(lang) === text('en')) identical.set(lang, [...(identical.get(lang) ?? []), pid]);
    }
  }
  for (const [lang, ids] of identical) out.review.push(`${file}: ${ids.length} place(s) have names.${lang} identical to names.en (a draft, a fallback, or a name that really is the same): ${ids.slice(0, 5).join(', ')}${ids.length > 5 ? ', ...' : ''}`);
};

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { diagnoseCoordinate, type GeoBounds, type GeoPoint } from '../geo/geometry';
import type { PackError } from './PackError';
import { parseStrictJson, StrictJsonError } from './StrictJson';

// File format of the optional `place-catalog` pack resource (its own schemaVersion). The catalog is what a person can SEARCH; the
// `place-directory` is what a router can REACH. A catalog place may have no coordinate and no graph node at all (a pending ilaqa): it is
// still listed, with an honest reason, and never receives an invented position. "Not located", "unreachable" and "provisional" are
// three different states and are kept apart so an app can explain each one.
export const PACK_CATALOG_SCHEMA_VERSION = 1;

export const PLACE_CATEGORIES = ['block', 'gate', 'ilaqa', 'tent', 'rasta', 'water', 'canteen', 'medical', 'library', 'power', 'facility'] as const;
export type PlaceCategory = typeof PLACE_CATEGORIES[number];
/** verified = surveyed in the field; provisional = supplied but not field-verified; pending = no coordinate exists yet. */
export type LocationStatus = 'verified' | 'provisional' | 'pending';
/** routable = a verified route; provisional = the route ends at an unverified boundary point; unreachable = located, but no connector exists; not-located = nowhere to route to. */
export type RoutingStatus = 'routable' | 'provisional' | 'unreachable' | 'not-located';
export type ReviewFlag = 'NEEDS_REVIEW' | 'PLACEHOLDER' | 'DUPLICATE_NAME' | 'DRAFT_TRANSLATION';
const LOCATIONS: readonly string[] = ['verified', 'provisional', 'pending'];
const ROUTINGS: readonly string[] = ['routable', 'provisional', 'unreachable', 'not-located'];
const FLAGS: readonly string[] = ['NEEDS_REVIEW', 'PLACEHOLDER', 'DUPLICATE_NAME', 'DRAFT_TRANSLATION'];

export interface CatalogPlace {
  id: string;
  category: PlaceCategory;
  /** Language tag -> display name. `en` is always present and is the fallback. */
  names: Readonly<Record<string, string>>;
  /** Extra search words in any language; searched regardless of the UI language. */
  aliases: readonly string[];
  parentId?: string;
  marhala?: number;
  coordinate?: GeoPoint;
  blockId?: string;
  location: LocationStatus;
  routing: RoutingStatus;
  /** Stable machine reason for anything other than 'routable' (e.g. LOCATION_PENDING, NO_VERIFIED_CONNECTOR, LEGACY_BOUNDARY_ACCESS). */
  routingReason?: string;
  /** Routing-graph nodes a route may end at. Empty unless the place can actually be routed to or is a known-unreachable located place. */
  nodeIds: readonly string[];
  provenance: { source: string; ref?: string };
  flags: readonly ReviewFlag[];
}
export interface PlaceCatalogData { venueId: string; places: readonly CatalogPlace[]; byId: ReadonlyMap<string, CatalogPlace> }
export type ParsePackPlaceCatalogResult = { ok: true; catalog: PlaceCatalogData } | { ok: false; error: PackError };

const MAX_PLACES = 100_000;
const MAX_ID = 128;
const CONTROL = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/;
class Invalid extends Error { constructor(readonly error: PackError) { super(error.message); } }
const bad = (message: string, path?: string, code: PackError['code'] = 'resource-invalid'): never => { throw new Invalid({ code, message, path }); };
type Obj = Record<string, unknown>;
const obj = (v: unknown, path: string, required: string[], optional: string[] = []): Obj => {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return bad(`${path} must be an object`, path);
  const o = v as Obj;
  for (const k of Object.keys(o)) if (!required.includes(k) && !optional.includes(k)) bad(`unknown field '${k}'`, `${path}.${k}`);
  for (const k of required) if (!(k in o)) bad(`missing field '${k}'`, `${path}.${k}`);
  return o;
};
const id = (v: unknown, path: string): string =>
  typeof v === 'string' && v.length > 0 && v.length <= MAX_ID && !CONTROL.test(v) ? v : bad(`${path} must be a short id without control characters`, path);
const label = (v: unknown, path: string): string =>
  typeof v === 'string' && v.trim().length > 0 && v.length <= 256 && !CONTROL.test(v) ? v : bad(`${path} must be a non-empty text of at most 256 characters without control characters`, path);

export const parsePackPlaceCatalog = (
  catalogText: string, expected: { venueId?: string; bounds?: GeoBounds; nodeIds?: ReadonlySet<string>; languages?: readonly string[] } = {},
): ParsePackPlaceCatalogResult => {
  try {
    let doc: unknown;
    try { doc = parseStrictJson(catalogText); } catch (e) { if (e instanceof StrictJsonError) return bad(`place-catalog is not valid strict JSON: ${e.message}`, 'place-catalog'); throw e; }
    const top = obj(doc, 'place-catalog', ['schemaVersion', 'venueId', 'places']);
    if (top.schemaVersion !== PACK_CATALOG_SCHEMA_VERSION) bad(`unsupported schemaVersion ${JSON.stringify(top.schemaVersion)}`, 'place-catalog.schemaVersion', 'schema-unsupported');
    const venueId = id(top.venueId, 'place-catalog.venueId');
    if (expected.venueId !== undefined && venueId !== expected.venueId) bad(`catalog is for '${venueId}', not '${expected.venueId}'`, 'place-catalog.venueId', 'venue-mismatch');
    if (!Array.isArray(top.places) || top.places.length > MAX_PLACES) return bad(`places must be a list of at most ${MAX_PLACES}`, 'place-catalog.places');

    const byId = new Map<string, CatalogPlace>();
    const places: CatalogPlace[] = [];
    top.places.forEach((raw, i) => {
      const path = `place-catalog.places[${i}]`;
      const o = obj(raw, path, ['id', 'category', 'names', 'location', 'routing', 'nodeIds', 'provenance'],
        ['aliases', 'parentId', 'marhala', 'coordinate', 'blockId', 'routingReason', 'flags']);
      const pid = id(o.id, `${path}.id`);
      if (byId.has(pid)) bad(`duplicate place id '${pid}'`, `${path}.id`);
      const category = (PLACE_CATEGORIES as readonly string[]).includes(o.category as string) ? (o.category as PlaceCategory) : bad(`unknown category ${JSON.stringify(o.category)}`, `${path}.category`);
      if (typeof o.names !== 'object' || o.names === null || Array.isArray(o.names) || !('en' in o.names)) bad("names must be an object with at least an 'en' name", `${path}.names`);
      const names: Record<string, string> = Object.create(null);
      const entries = Object.entries(o.names as Obj);
      if (entries.length > 16) bad('names may list at most 16 languages', `${path}.names`);
      for (const [lang, value] of entries) {
        if (!/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(lang)) bad(`'${lang}' is not a language tag`, `${path}.names.${lang}`);
        if (expected.languages && !expected.languages.includes(lang)) bad(`language '${lang}' is not declared by the pack`, `${path}.names.${lang}`);
        names[lang] = label(value, `${path}.names.${lang}`);
      }
      const location = LOCATIONS.includes(o.location as string) ? (o.location as LocationStatus) : bad(`unknown location status ${JSON.stringify(o.location)}`, `${path}.location`);
      const routing = ROUTINGS.includes(o.routing as string) ? (o.routing as RoutingStatus) : bad(`unknown routing status ${JSON.stringify(o.routing)}`, `${path}.routing`);
      const nodeIds = (Array.isArray(o.nodeIds) && o.nodeIds.length <= 1024 ? o.nodeIds : bad('nodeIds must be a list', `${path}.nodeIds`)).map((n, j) => {
        const nid = id(n, `${path}.nodeIds[${j}]`);
        return expected.nodeIds && !expected.nodeIds.has(nid) ? bad(`references unknown graph node '${nid}'`, `${path}.nodeIds[${j}]`) : nid;
      });
      let coordinate: GeoPoint | undefined;
      if (o.coordinate !== undefined) {
        const c = obj(o.coordinate, `${path}.coordinate`, ['lat', 'lng']);
        coordinate = { lat: Number(c.lat), lng: Number(c.lng) };
        const problem = typeof c.lat === 'number' && typeof c.lng === 'number' ? diagnoseCoordinate(coordinate, expected.bounds) : 'not-finite';
        if (problem) bad(`coordinate (${String(c.lat)}, ${String(c.lng)}) is not plausible for this venue: ${problem}`, `${path}.coordinate`);
      }
      // The invariants that keep "not located", "unreachable" and "routable" from being confused.
      if (location === 'pending' && (coordinate || routing !== 'not-located' || nodeIds.length)) bad("a 'pending' place has no coordinate, no graph node and routing 'not-located'", path);
      if (location !== 'pending' && !coordinate) bad(`a '${location}' place needs a coordinate`, `${path}.coordinate`);
      if (routing === 'not-located' && (location !== 'pending' || nodeIds.length)) bad("routing 'not-located' is only for a pending place with no graph node", path);
      if ((routing === 'routable' || routing === 'provisional') && !nodeIds.length) bad(`a '${routing}' place needs at least one graph node to route to`, `${path}.nodeIds`);
      if (routing !== 'routable' && o.routingReason === undefined) bad(`a place whose routing is '${routing}' must say why (routingReason)`, `${path}.routingReason`);
      const flagList = o.flags === undefined ? [] : Array.isArray(o.flags) ? o.flags : bad('flags must be a list', `${path}.flags`);
      const flags = flagList.map((f, j) => (FLAGS.includes(f as string) ? (f as ReviewFlag) : bad(`unknown flag ${JSON.stringify(f)}`, `${path}.flags[${j}]`)));
      const aliasList = o.aliases === undefined ? [] : Array.isArray(o.aliases) && o.aliases.length <= 256 ? o.aliases : bad('aliases must be a list of at most 256', `${path}.aliases`);
      const prov = obj(o.provenance, `${path}.provenance`, ['source'], ['ref']);
      const place: CatalogPlace = {
        id: pid, category, names: Object.freeze(names), aliases: Object.freeze(aliasList.map((a, j) => label(a, `${path}.aliases[${j}]`))),
        ...(o.parentId === undefined ? {} : { parentId: id(o.parentId, `${path}.parentId`) }),
        ...(o.marhala === undefined ? {} : { marhala: typeof o.marhala === 'number' && Number.isSafeInteger(o.marhala) && o.marhala > 0 ? o.marhala : bad('marhala must be a positive integer', `${path}.marhala`) }),
        ...(coordinate ? { coordinate: Object.freeze(coordinate) } : {}),
        ...(o.blockId === undefined ? {} : { blockId: id(o.blockId, `${path}.blockId`) }),
        location, routing, ...(o.routingReason === undefined ? {} : { routingReason: label(o.routingReason, `${path}.routingReason`) }),
        nodeIds: Object.freeze(nodeIds),
        provenance: Object.freeze({ source: label(prov.source, `${path}.provenance.source`), ...(prov.ref === undefined ? {} : { ref: label(prov.ref, `${path}.provenance.ref`) }) }),
        flags: Object.freeze(flags),
      };
      byId.set(pid, place);
      places.push(place);
    });
    for (const p of places) {
      if (p.parentId !== undefined && (p.parentId === p.id || !byId.has(p.parentId))) bad(`parentId '${p.parentId}' is not another place of this catalog`, `place-catalog.places['${p.id}'].parentId`);
      if (p.blockId !== undefined && byId.get(p.blockId)?.category !== 'block') bad(`blockId '${p.blockId}' is not a block of this catalog`, `place-catalog.places['${p.id}'].blockId`);
    }
    return { ok: true, catalog: { venueId, places: Object.freeze(places), byId } };
  } catch (e) {
    if (e instanceof Invalid) return { ok: false, error: e.error };
    throw e;
  }
};

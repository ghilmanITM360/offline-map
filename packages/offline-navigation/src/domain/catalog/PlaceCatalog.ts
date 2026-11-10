/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { GeoPoint } from '../geo/geometry';
import { haversineM } from '../venue/VenueRouting';
import type { CatalogPlace, PlaceCatalogData, PlaceCategory } from '../pack/PackPlaceCatalog';
import type { AccessVerification, VenueGeometry } from '../pack/PackVenueGeometry';

// Headless search and availability over the pack's place-catalog. Catalog visibility is separate from routability: a place can be listed
// (and found by name in any language) without being something a route can be drawn to.

/** Stable machine codes the UI maps to localized text. No prose lives here. */
export type AvailabilityMessage = 'available' | 'provisional_access' | 'unreachable' | 'location_pending';
export interface PlaceAvailability {
  readonly placeId: string;
  readonly status: CatalogPlace['routing'];
  readonly message: AvailabilityMessage;
  /** Why, in the data's own stable code (e.g. NO_VERIFIED_CONNECTOR); undefined for a plainly routable place. */
  readonly reason?: string;
  /** Preview, Manual Guide and Live may be offered. False for an unreachable or not-located place: no route is ever drawn to it. */
  readonly canRoute: boolean;
}

export const availabilityOf = (place: CatalogPlace): PlaceAvailability => {
  const base = { placeId: place.id, status: place.routing, ...(place.routingReason === undefined ? {} : { reason: place.routingReason }) };
  switch (place.routing) {
    case 'routable': return { ...base, message: 'available', canRoute: true };
    case 'provisional': return { ...base, message: 'provisional_access', canRoute: true };
    case 'unreachable': return { ...base, message: 'unreachable', canRoute: false };
    default: return { ...base, message: 'location_pending', canRoute: false };
  }
};

// Matching key: Latin lower-cased; Arabic-script harakat, tatweel and the Arabic/Persian letter variants Urdu keyboards mix are folded, so
// the same word typed on different keyboards matches. Display text is never changed.
const HARAKAT = /[ً-ٰٟۖ-ۭـ]/g;
const FOLD: Record<string, string> = { 'ي': 'ی', 'ى': 'ی', 'ے': 'ی', 'ك': 'ک', 'ه': 'ہ', 'ھ': 'ہ', 'ة': 'ہ', 'ۃ': 'ہ' };
export const searchKey = (text: string): string =>
  text.normalize('NFKC').replace(HARAKAT, '').replace(/[يىےكهھةۃ]/g, (c) => FOLD[c]).toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ').replace(/\s+/g, ' ').trim();

export interface CatalogSearchOptions { categories?: readonly PlaceCategory[]; limit?: number }
export interface CatalogSearchHit {
  readonly place: CatalogPlace;
  /** Higher is a better match: 3 exact name, 2 name word starts with the query word(s), 1 any word contains them. */
  readonly rank: number;
  /** Other places whose display name is identical in the searched language: the UI must show something that tells them apart. */
  readonly sameNameAs: readonly string[];
}

export interface PlaceCatalog {
  readonly venueId: string;
  list(options?: Pick<CatalogSearchOptions, 'categories'>): readonly CatalogPlace[];
  get(id: string): CatalogPlace | undefined;
  availability(id: string): PlaceAvailability | undefined;
  /** Across every language and alias at once, whichever language the UI shows. Every typed word must match. */
  search(query: string, options?: CatalogSearchOptions): readonly CatalogSearchHit[];
  /** The name to display: the requested language, else English. */
  displayName(place: CatalogPlace, language: string): string;
}

export const createPlaceCatalog = (data: PlaceCatalogData): PlaceCatalog => {
  const keys = new Map<string, { names: string[]; words: string[] }>();
  for (const p of data.places) {
    const names = [...Object.values(p.names), ...p.aliases, p.id].map(searchKey).filter(Boolean);
    keys.set(p.id, { names, words: [...new Set(names.flatMap((n) => n.split(' ')))] });
  }
  const inCategories = (p: CatalogPlace, categories?: readonly PlaceCategory[]) => !categories || categories.length === 0 || categories.includes(p.category);
  const displayName = (p: CatalogPlace, language: string): string => p.names[language] ?? p.names.en;
  return {
    venueId: data.venueId,
    list: (o) => data.places.filter((p) => inCategories(p, o?.categories)),
    get: (id) => data.byId.get(id),
    availability: (id) => { const p = data.byId.get(id); return p ? availabilityOf(p) : undefined; },
    displayName,
    search(query, options = {}) {
      const words = searchKey(query).split(' ').filter(Boolean);
      const pool = data.places.filter((p) => inCategories(p, options.categories));
      const hits: CatalogSearchHit[] = [];
      for (const place of pool) {
        const k = keys.get(place.id)!;
        let rank = words.length === 0 ? 1 : 0;
        if (words.length) {
          if (!words.every((w) => k.names.some((n) => n.includes(w)))) continue;
          const q = words.join(' ');
          rank = k.names.slice(0, Object.keys(place.names).length).includes(q) ? 3
            : words.every((w) => k.words.some((x) => x.startsWith(w))) ? 2 : 1;
        }
        hits.push({ place, rank, sameNameAs: [] });
      }
      hits.sort((a, b) => b.rank - a.rank || (a.place.id < b.place.id ? -1 : 1));
      const limited = options.limit === undefined ? hits : hits.slice(0, options.limit);
      // Duplicate names are reported across the whole catalog, not just the hits, so a single hit still says it has a namesake.
      const byName = new Map<string, string[]>();
      for (const p of data.places) { const n = searchKey(p.names.en); byName.set(n, [...(byName.get(n) ?? []), p.id]); }
      return limited.map((h) => ({ ...h, sameNameAs: (byName.get(searchKey(h.place.names.en)) ?? []).filter((id) => id !== h.place.id) }));
    },
  };
};

export type DestinationEndpointKind = 'verified-access' | 'legacy-boundary' | 'gate' | 'graph-node';
export interface DestinationPresentation {
  readonly placeId: string;
  /** Where the destination's own marker is drawn: the block centre (or the place's own point), never a route node. */
  readonly marker: GeoPoint | null;
  /** Where the route actually ends. Arrival is judged here, and it gets its own marker. */
  readonly endpoint: GeoPoint | null;
  readonly endpointKind: DestinationEndpointKind;
  /** Straight-line distance between the two, so the UI can say how far from the block's centre the route stops. */
  readonly offsetM: number | null;
  /** True when the route ends at an unverified boundary point: it must never be described as reaching a tent or an entrance. */
  readonly provisional: boolean;
}

/**
 * The destination marker, the route endpoint and what kind of point that endpoint is. `endNodeId` is the last node of the route.
 * An access point counts as verified only when the geometry says so; a graph node matching a legacy alias is a boundary point.
 */
export const describeDestination = (
  placeId: string, endNodeId: string | null, endNodeCoordinate: GeoPoint | null, geometry: VenueGeometry | null, catalog: PlaceCatalog | null,
): DestinationPresentation => {
  const features = geometry?.features ?? [];
  const own = features.find((f) => f.shape === 'point' && f.placeId === placeId && (f.role === 'block-center' || f.role === 'gate' || f.role === 'tent' || f.role === 'facility'));
  const catalogPoint = catalog?.get(placeId)?.coordinate;
  const marker = own && own.shape === 'point' ? own.point : catalogPoint ?? null;
  const access = endNodeId === null ? undefined : features.find((f) => f.shape === 'point' && f.role === 'access-point' && f.nodeId === endNodeId);
  let kind: DestinationEndpointKind = 'graph-node';
  let verification: AccessVerification | undefined;
  if (access && access.shape === 'point') { verification = access.verification; kind = verification === 'VERIFIED' ? 'verified-access' : 'legacy-boundary'; }
  else if (catalog?.get(placeId)?.category === 'gate' && endNodeId === placeId) kind = 'gate';
  const provisional = kind === 'legacy-boundary' || catalog?.get(placeId)?.routing === 'provisional';
  return {
    placeId, marker, endpoint: endNodeCoordinate, endpointKind: kind,
    offsetM: marker && endNodeCoordinate ? haversineM(marker, endNodeCoordinate) : null,
    provisional,
  };
};

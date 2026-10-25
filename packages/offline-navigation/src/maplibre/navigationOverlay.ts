/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { NavigationRoute } from '../domain/navigation';
import type { VenueCoordinate, VenueDataSource } from '../domain/venue';

// Pure map data: the journey as GeoJSON ([lng, lat], as MapLibre expects). No React, no native module.

export interface Feature<G, P> { type: 'Feature'; properties: P; geometry: G }
export interface Collection<F> { type: 'FeatureCollection'; features: F[] }
export type MarkerRole = 'place' | 'origin' | 'destination' | 'position';
export type MarkerFeature = Feature<{ type: 'Point'; coordinates: [number, number] }, { id: string; role: MarkerRole }>;
export type RouteFeature = Feature<{ type: 'LineString'; coordinates: [number, number][] }, Record<string, never>>;

export interface PlacePoint { id: string; kind: string; coordinate: VenueCoordinate }

const valid = (c: VenueCoordinate | null | undefined): c is VenueCoordinate =>
  !!c && Number.isFinite(c.lat) && Number.isFinite(c.lng) && Math.abs(c.lat) <= 90 && Math.abs(c.lng) <= 180;

/** Every place that has a drawable position: the first of its graph nodes with a valid coordinate. */
export function placePoints(venue: VenueDataSource): PlacePoint[] {
  return venue.placeIds().flatMap((id) => {
    const place = venue.getPlace(id);
    const coordinate = place?.nodeIds.map((n) => venue.graph.getNode(n)?.coordinate).find(valid);
    return place && coordinate ? [{ id, kind: place.kind, coordinate }] : [];
  });
}

export function routeCollection(route: NavigationRoute | null): Collection<RouteFeature> {
  const points = route?.line?.points.filter(valid) ?? [];
  return {
    type: 'FeatureCollection',
    features: points.length < 2 ? [] : [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: points.map((p) => [p.lng, p.lat]) } }],
  };
}

const point = (id: string, role: MarkerRole, c: VenueCoordinate): MarkerFeature =>
  ({ type: 'Feature', properties: { id, role }, geometry: { type: 'Point', coordinates: [c.lng, c.lat] } });

/** Origin and destination are looked up among `places`; an unknown id draws nothing. The walker is drawn only at a valid position. */
export function markerCollection(places: readonly PlacePoint[], originId: string | null, destinationId: string | null, position: VenueCoordinate | null): Collection<MarkerFeature> {
  const at = (id: string | null) => places.find((p) => p.id === id)?.coordinate;
  const features: MarkerFeature[] = [];
  const origin = at(originId);
  const destination = at(destinationId);
  if (origin) features.push(point(originId!, 'origin', origin));
  if (destination) features.push(point(destinationId!, 'destination', destination));
  if (valid(position)) features.push(point('position', 'position', position));
  return { type: 'FeatureCollection', features };
}

export const placeCollection = (places: readonly PlacePoint[]): Collection<MarkerFeature> =>
  ({ type: 'FeatureCollection', features: places.map((p) => point(p.id, 'place', p.coordinate)) });

/** [west, south, east, north], widened to at least `minSpanDeg` each way so a point or a tiny route still frames an area. */
export function boundsOfPoints(points: readonly VenueCoordinate[], minSpanDeg: number): [number, number, number, number] | null {
  const ok = points.filter(valid);
  if (ok.length === 0) return null;
  let [west, south, east, north] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const p of ok) [west, south, east, north] = [Math.min(west, p.lng), Math.min(south, p.lat), Math.max(east, p.lng), Math.max(north, p.lat)];
  const widen = (lo: number, hi: number): [number, number] => (hi - lo < minSpanDeg ? [(lo + hi) / 2 - minSpanDeg / 2, (lo + hi) / 2 + minSpanDeg / 2] : [lo, hi]);
  [west, east] = widen(west, east);
  [south, north] = widen(south, north);
  return [west, south, east, north];
}

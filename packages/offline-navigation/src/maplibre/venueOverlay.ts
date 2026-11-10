/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { PlaceCatalog, DestinationPresentation } from '../domain/catalog';
import type { GeoPoint } from '../domain/geo/geometry';
import type { VenueGeometry } from '../domain/pack';
import type { Collection, Feature, MarkerFeature, MarkerRole } from './navigationOverlay';

// Pure map data for the venue itself (block outlines, gates, rastas, facilities, tents) and for the destination. GeoJSON positions are
// [longitude, latitude]; the only place a named {lat, lng} becomes one is `lngLat` below.
const lngLat = (p: GeoPoint): [number, number] => [p.lng, p.lat];
type Poly = Feature<{ type: 'Polygon'; coordinates: [number, number][][] }, { id: string; kind: string }>;
type Line = Feature<{ type: 'MultiLineString'; coordinates: [number, number][][] }, { id: string; kind: string }>;
type Pt = Feature<{ type: 'Point'; coordinates: [number, number] }, { id: string; kind: string; status?: string; facilityKind?: string }>;

export interface OverlayLabel { id: string; kind: 'block' | 'gate'; lngLat: [number, number]; text: string }
export interface VenueOverlayData {
  blocks: Collection<Poly>;
  lines: Collection<Line>;
  gates: Collection<Pt>;
  facilities: Collection<Pt>;
  tents: Collection<Pt>;
  labels: OverlayLabel[];
}

/** Everything a pack's venue-geometry can draw. A feature that is not in the geometry is never drawn: nothing is inferred. */
export const venueOverlay = (geometry: VenueGeometry | null, catalog: PlaceCatalog | null, language: string): VenueOverlayData => {
  const out: VenueOverlayData = {
    blocks: { type: 'FeatureCollection', features: [] }, lines: { type: 'FeatureCollection', features: [] }, gates: { type: 'FeatureCollection', features: [] },
    facilities: { type: 'FeatureCollection', features: [] }, tents: { type: 'FeatureCollection', features: [] }, labels: [],
  };
  const nameOf = (id: string): string => { const p = catalog?.get(id); return p && catalog ? catalog.displayName(p, language) : id; };
  for (const f of geometry?.features ?? []) {
    if (f.shape === 'polygon' && f.role === 'block' && f.placeId) {
      out.blocks.features.push({ type: 'Feature', properties: { id: f.placeId, kind: 'block' }, geometry: { type: 'Polygon', coordinates: [[...f.ring, f.ring[0]].map(lngLat)] } });
    } else if (f.shape === 'line') {
      out.lines.features.push({ type: 'Feature', properties: { id: f.id, kind: f.role }, geometry: { type: 'MultiLineString', coordinates: f.paths.map((path) => path.map(lngLat)) } });
    } else if (f.shape === 'point' && f.role === 'gate' && f.placeId) {
      out.gates.features.push({ type: 'Feature', properties: { id: f.placeId, kind: 'gate', status: f.status ?? 'routable' }, geometry: { type: 'Point', coordinates: lngLat(f.point) } });
      out.labels.push({ id: f.placeId, kind: 'gate', lngLat: lngLat(f.point), text: nameOf(f.placeId) });
    } else if (f.shape === 'point' && f.role === 'block-center' && f.placeId) {
      out.labels.push({ id: f.placeId, kind: 'block', lngLat: lngLat(f.point), text: nameOf(f.placeId) });
    } else if (f.shape === 'point' && (f.role === 'facility' || f.role === 'tent')) {
      (f.role === 'tent' ? out.tents : out.facilities).features.push({
        type: 'Feature', properties: { id: f.placeId ?? f.id, kind: f.role, ...(f.facilityKind ? { facilityKind: f.facilityKind } : {}) }, geometry: { type: 'Point', coordinates: lngLat(f.point) },
      });
    }
  }
  out.labels.sort((a, b) => (a.id < b.id ? -1 : 1));
  return out;
};

const pt = (id: string, role: MarkerRole, c: GeoPoint): MarkerFeature => ({ type: 'Feature', properties: { id, role }, geometry: { type: 'Point', coordinates: lngLat(c) } });

/**
 * Origin, destination, route endpoint and walker. The destination marker is where the destination IS (a block's centre); the endpoint marker is
 * where the route actually stops and arrival is judged. They are drawn apart only when they really are apart, so a gate gets one marker.
 */
export const presentationMarkers = (
  origin: { id: string; coordinate: GeoPoint } | null, destination: DestinationPresentation | null, position: GeoPoint | null, minOffsetM = 3,
): Collection<MarkerFeature> => {
  const features: MarkerFeature[] = [];
  if (origin) features.push(pt(origin.id, 'origin', origin.coordinate));
  if (destination?.marker) features.push(pt(destination.placeId, 'destination', destination.marker));
  if (destination?.endpoint && (destination.marker === null || (destination.offsetM ?? Infinity) >= minOffsetM)) features.push(pt(`${destination.placeId}#endpoint`, 'endpoint', destination.endpoint));
  if (position) features.push(pt('position', 'position', position));
  return { type: 'FeatureCollection', features };
};

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { PACK_CATALOG_SCHEMA_VERSION, PACK_GEOMETRY_SCHEMA_VERSION, toGeoJsonRing, type GeoPoint } from '@muslim-ummah/offline-navigation';
import { IJTEMA_BLOCK_GEOMETRY } from './blockAccess';
import { IJTEMA_BLOCKS } from './blocks';
import { IJTEMA_GATES } from './gates';
import { IJTEMA_NAVIGATION_GRAPH_V2 } from './navigationGraph';
import { IJTEMA_RASTAS } from './rastas';
import { IJTEMA_SPECIAL_ROUTES } from './specialRoutes';
import { IJTEMA_VENUE_SOURCE } from './venueAdapter';
import type { LocalizedLabel } from './types';

// The Karachi pack's `venue-geometry` and `place-catalog` resources, derived from the committed TypeScript data. Nothing is measured,
// estimated or added here: every coordinate is one the repository already holds, and a gate with no graph connector stays unreachable.
const VENUE_ID = IJTEMA_VENUE_SOURCE.venueId;
const lnglat = (p: GeoPoint): [number, number] => [p.lng, p.lat];
const point = (id: string, kind: string, p: GeoPoint, props: Record<string, unknown> = {}) => ({ type: 'Feature', id, geometry: { type: 'Point', coordinates: lnglat(p) }, properties: { kind, ...props } });
const names = (n: LocalizedLabel) => ({ en: n.en, ur: n.ur ?? n.en, 'ur-Latn': n.romanUrdu ?? n.en });
const gateReachable = (id: string): boolean => (IJTEMA_NAVIGATION_GRAPH_V2.adjacency[id] ?? []).length > 0;

export const buildKarachiVenueGeometry = () => {
  const features: unknown[] = [];
  for (const block of IJTEMA_BLOCKS) {
    const model = IJTEMA_BLOCK_GEOMETRY.get(block.id)!;
    features.push({ type: 'Feature', id: block.id, geometry: { type: 'Polygon', coordinates: [toGeoJsonRing(model.boundary)] }, properties: { kind: 'block', placeId: block.id } });
    features.push(point(`${block.id}#center`, 'block-center', model.destinationDisplay, { placeId: block.id }));
    for (const a of [...model.verifiedAccessPoints, ...model.legacyAccessAliases]) {
      features.push(point(a.id, 'access-point', a.coordinate, { blockId: block.id, verification: a.verification, nodeId: a.nodeId }));
    }
  }
  for (const gate of IJTEMA_GATES) {
    if (gate.coordinate) features.push(point(`${gate.id}#point`, 'gate', gate.coordinate, { placeId: gate.id, status: gateReachable(gate.id) ? 'routable' : 'unreachable' }));
  }
  for (const rasta of IJTEMA_RASTAS) {
    const byId = new Map(rasta.points.map((p) => [p.id, p]));
    const paths = rasta.segments.map((s) => s.pointIds.map((pid) => lnglat(byId.get(pid)!.coordinate)));
    features.push({ type: 'Feature', id: rasta.id, geometry: { type: 'MultiLineString', coordinates: paths }, properties: { kind: 'rasta', label: rasta.name.en } });
  }
  for (const route of IJTEMA_SPECIAL_ROUTES) {
    const line = [...route.points].sort((a, b) => a.sequence - b.sequence).map((p) => lnglat(p.coordinate));
    features.push({ type: 'Feature', id: route.id, geometry: { type: 'MultiLineString', coordinates: [line] }, properties: { kind: 'special-route', label: route.name.en } });
  }
  return { schemaVersion: PACK_GEOMETRY_SCHEMA_VERSION, venueId: VENUE_ID, type: 'FeatureCollection', features };
};

export const buildKarachiPlaceCatalog = () => {
  const source = { source: 'src/data/ijtema (committed baseline-2026-10-05)' };
  const places: unknown[] = [];
  for (const block of IJTEMA_BLOCKS) {
    places.push({
      id: block.id, category: 'block', names: names(block.name), aliases: block.aliases, location: 'verified',
      coordinate: { lat: block.center.lat, lng: block.center.lng },
      // The route stops at a corner-derived boundary node, not at an entrance: provisional until a field survey supplies real access points.
      routing: 'provisional', routingReason: 'LEGACY_BOUNDARY_ACCESS',
      nodeIds: IJTEMA_VENUE_SOURCE.getPlace(block.id)?.nodeIds ?? [], provenance: source, flags: [],
    });
  }
  for (const gate of IJTEMA_GATES) {
    const located = !!gate.coordinate && gate.status !== 'missing_coordinate';
    const inGraph = IJTEMA_VENUE_SOURCE.getPlace(gate.id)?.nodeIds ?? [];
    const reachable = located && gateReachable(gate.id);
    places.push({
      id: gate.id, category: 'gate', names: names(gate.name), aliases: gate.aliases,
      location: !located ? 'pending' : gate.status === 'provided' ? 'verified' : 'provisional',
      ...(located ? { coordinate: { lat: gate.coordinate!.lat, lng: gate.coordinate!.lng } } : {}),
      routing: !located ? 'not-located' : reachable ? 'routable' : 'unreachable',
      ...(!located ? { routingReason: 'LOCATION_PENDING' } : reachable ? {} : { routingReason: 'NO_VERIFIED_CONNECTOR' }),
      nodeIds: located ? inGraph : [], provenance: { ...source, ...(gate.sourceNotes?.length ? { ref: gate.sourceNotes[0].slice(0, 200) } : {}) }, flags: [],
    });
  }
  return { schemaVersion: PACK_CATALOG_SCHEMA_VERSION, venueId: VENUE_ID, places };
};

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { diagnoseCoordinate, fromGeoJsonRing, ringProblems, signedAreaM2, type GeoBounds, type GeoPoint, type GeoRing } from '../geo/geometry';
import type { PackError } from './PackError';
import { parseStrictJson, StrictJsonError } from './StrictJson';

// File format of the optional `venue-geometry` pack resource (its own schemaVersion; the pack manifest stays at version 1, so a version-1
// pack without this file loads exactly as before). A GeoJSON FeatureCollection in WGS84 with [longitude, latitude] positions. Every
// feature has a stable `id` and a `properties.kind`; the allowed kinds and their fields are closed, so nothing security-relevant is
// accepted silently. Polygons are single closed exterior rings, wound counter-clockwise (RFC 7946), simple and non-degenerate.
export const PACK_GEOMETRY_SCHEMA_VERSION = 1;

/** How much a location can be trusted. LEGACY_UNVERIFIED is a boundary point inherited from the original data, never a surveyed entrance. */
export type AccessVerification = 'VERIFIED' | 'LEGACY_UNVERIFIED';
export type GeometryPolygonRole = 'block' | 'venue-boundary';
export type GeometryPointRole = 'block-center' | 'access-point' | 'gate' | 'facility' | 'tent';
export type GeometryLineRole = 'rasta' | 'special-route';

export type VenueGeometryFeature =
  | { shape: 'polygon'; role: GeometryPolygonRole; id: string; placeId?: string; ring: GeoRing }
  | { shape: 'point'; role: GeometryPointRole; id: string; placeId?: string; blockId?: string; point: GeoPoint; verification?: AccessVerification; nodeId?: string; status?: string; facilityKind?: string }
  | { shape: 'line'; role: GeometryLineRole; id: string; label?: string; paths: GeoPoint[][] };

export interface VenueGeometry {
  venueId: string;
  features: readonly VenueGeometryFeature[];
  byId: ReadonlyMap<string, VenueGeometryFeature>;
}
export type ParsePackVenueGeometryResult = { ok: true; geometry: VenueGeometry } | { ok: false; error: PackError };

const MAX_FEATURES = 50_000;
const MAX_POSITIONS = 200_000;
const MAX_ID = 128;
const CONTROL = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/;
const POLYGON_ROLES: readonly string[] = ['block', 'venue-boundary'];
const POINT_ROLES: readonly string[] = ['block-center', 'access-point', 'gate', 'facility', 'tent'];
const LINE_ROLES: readonly string[] = ['rasta', 'special-route'];

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
const text = (v: unknown, path: string): string =>
  typeof v === 'string' && v.length > 0 && v.length <= 256 && !CONTROL.test(v) ? v : bad(`${path} must be a short text without control characters`, path);

export const parsePackVenueGeometry = (
  geometryText: string, expected: { venueId?: string; bounds?: GeoBounds; placeIds?: ReadonlySet<string>; nodeIds?: ReadonlySet<string> } = {},
): ParsePackVenueGeometryResult => {
  try {
    let doc: unknown;
    try { doc = parseStrictJson(geometryText); } catch (e) { if (e instanceof StrictJsonError) return bad(`venue-geometry is not valid strict JSON: ${e.message}`, 'venue-geometry'); throw e; }
    const top = obj(doc, 'venue-geometry', ['schemaVersion', 'venueId', 'type', 'features']);
    if (top.schemaVersion !== PACK_GEOMETRY_SCHEMA_VERSION) bad(`unsupported schemaVersion ${JSON.stringify(top.schemaVersion)}`, 'venue-geometry.schemaVersion', 'schema-unsupported');
    const venueId = id(top.venueId, 'venue-geometry.venueId');
    if (expected.venueId !== undefined && venueId !== expected.venueId) bad(`geometry is for '${venueId}', not '${expected.venueId}'`, 'venue-geometry.venueId', 'venue-mismatch');
    if (top.type !== 'FeatureCollection') bad("type must be 'FeatureCollection'", 'venue-geometry.type');
    if (!Array.isArray(top.features) || top.features.length > MAX_FEATURES) return bad(`features must be a list of at most ${MAX_FEATURES}`, 'venue-geometry.features');

    let positions = 0;
    const point = (raw: unknown, path: string): GeoPoint => {
      if (!Array.isArray(raw) || raw.length !== 2 || typeof raw[0] !== 'number' || typeof raw[1] !== 'number') return bad(`${path} must be [longitude, latitude]`, path);
      if (++positions > MAX_POSITIONS) bad('too many positions', path);
      const p = { lat: raw[1], lng: raw[0] };
      const problem = diagnoseCoordinate(p, expected.bounds);
      return problem ? bad(`${path} (${raw[0]}, ${raw[1]}) is not a plausible [longitude, latitude] for this venue: ${problem}`, path) : p;
    };
    const features: VenueGeometryFeature[] = [];
    const byId = new Map<string, VenueGeometryFeature>();
    top.features.forEach((rawFeature, i) => {
      const path = `venue-geometry.features[${i}]`;
      const f = obj(rawFeature, path, ['type', 'id', 'geometry', 'properties']);
      if (f.type !== 'Feature') bad("type must be 'Feature'", `${path}.type`);
      const fid = id(f.id, `${path}.id`);
      if (byId.has(fid)) bad(`duplicate feature id '${fid}'`, `${path}.id`);
      const g = obj(f.geometry, `${path}.geometry`, ['type', 'coordinates']);
      const props = obj(f.properties, `${path}.properties`, ['kind'], ['placeId', 'blockId', 'verification', 'nodeId', 'status', 'facilityKind', 'label']);
      const role = typeof props.kind === 'string' ? props.kind : bad('properties.kind must be a string', `${path}.properties.kind`);
      const placeId = props.placeId === undefined ? undefined : id(props.placeId, `${path}.properties.placeId`);
      if (placeId !== undefined && expected.placeIds && !expected.placeIds.has(placeId)) bad(`placeId '${placeId}' is not a place of this venue`, `${path}.properties.placeId`);
      const nodeId = props.nodeId === undefined ? undefined : id(props.nodeId, `${path}.properties.nodeId`);
      if (nodeId !== undefined && expected.nodeIds && !expected.nodeIds.has(nodeId)) bad(`nodeId '${nodeId}' is not a node of the routing graph`, `${path}.properties.nodeId`);
      let feature: VenueGeometryFeature;
      if (POLYGON_ROLES.includes(role)) {
        if (g.type !== 'Polygon') bad(`'${role}' needs a Polygon geometry`, `${path}.geometry.type`);
        const rings = g.coordinates;
        if (!Array.isArray(rings) || rings.length !== 1) return bad('a polygon must be exactly one exterior ring (no holes)', `${path}.geometry.coordinates`);
        const ring = fromGeoJsonRing(rings[0]);
        if (!ring) return bad('polygon ring must be closed, have at least 3 distinct finite points, and use [longitude, latitude]', `${path}.geometry.coordinates[0]`);
        ring.forEach((p, j) => point([p.lng, p.lat], `${path}.geometry.coordinates[0][${j}]`));
        const problems = ringProblems(ring);
        if (problems.length) bad(`polygon ring is invalid (${problems.join(', ')})`, `${path}.geometry.coordinates[0]`);
        if (signedAreaM2(ring) <= 0) bad('polygon exterior ring must be counter-clockwise (RFC 7946)', `${path}.geometry.coordinates[0]`);
        feature = { shape: 'polygon', role: role as GeometryPolygonRole, id: fid, ...(placeId === undefined ? {} : { placeId }), ring };
        if (role === 'block' && placeId === undefined) bad("a 'block' polygon needs properties.placeId", `${path}.properties.placeId`);
      } else if (POINT_ROLES.includes(role)) {
        if (g.type !== 'Point') bad(`'${role}' needs a Point geometry`, `${path}.geometry.type`);
        const p = point(g.coordinates, `${path}.geometry.coordinates`);
        const verification = props.verification === undefined ? undefined : props.verification === 'VERIFIED' || props.verification === 'LEGACY_UNVERIFIED' ? props.verification : bad("verification must be 'VERIFIED' or 'LEGACY_UNVERIFIED'", `${path}.properties.verification`);
        if (role === 'access-point' && verification === undefined) bad("an 'access-point' must say whether it is VERIFIED or LEGACY_UNVERIFIED", `${path}.properties.verification`);
        if (role === 'access-point' && props.blockId === undefined) bad("an 'access-point' needs properties.blockId", `${path}.properties.blockId`);
        feature = {
          shape: 'point', role: role as GeometryPointRole, id: fid, point: p,
          ...(placeId === undefined ? {} : { placeId }), ...(props.blockId === undefined ? {} : { blockId: id(props.blockId, `${path}.properties.blockId`) }),
          ...(verification === undefined ? {} : { verification }), ...(nodeId === undefined ? {} : { nodeId }),
          ...(props.status === undefined ? {} : { status: text(props.status, `${path}.properties.status`) }),
          ...(props.facilityKind === undefined ? {} : { facilityKind: text(props.facilityKind, `${path}.properties.facilityKind`) }),
        };
      } else if (LINE_ROLES.includes(role)) {
        if (g.type !== 'MultiLineString') bad(`'${role}' needs a MultiLineString geometry`, `${path}.geometry.type`);
        if (!Array.isArray(g.coordinates) || g.coordinates.length === 0) return bad('a line needs at least one path', `${path}.geometry.coordinates`);
        const paths = g.coordinates.map((line, j) => {
          if (!Array.isArray(line) || line.length < 2) return bad('each path needs at least two positions', `${path}.geometry.coordinates[${j}]`);
          return line.map((pos, k) => point(pos, `${path}.geometry.coordinates[${j}][${k}]`));
        });
        feature = { shape: 'line', role: role as GeometryLineRole, id: fid, paths, ...(props.label === undefined ? {} : { label: text(props.label, `${path}.properties.label`) }) };
      } else {
        return bad(`unknown feature kind '${role}'`, `${path}.properties.kind`);
      }
      byId.set(fid, feature);
      features.push(feature);
    });
    return { ok: true, geometry: { venueId, features: Object.freeze(features), byId } };
  } catch (e) {
    if (e instanceof Invalid) return { ok: false, error: e.error };
    throw e;
  }
};

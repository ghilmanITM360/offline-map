/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// One shared, headless geographic module: coordinate sanity, polygon construction, point-in-polygon, boundary proximity, overlap
// and block assignment. Everything works on WGS84 `{lat, lng}` points (the SDK's named form). GeoJSON uses [lng, lat]; the only
// conversions are `toGeoJsonRing` / `fromGeoJsonRing` below, so the swap risk lives in exactly one place.
// Distances use a local equirectangular projection around the shape: accurate to well under a centimetre at venue scale.

export interface GeoPoint { readonly lat: number; readonly lng: number }
export interface GeoBounds { readonly west: number; readonly south: number; readonly east: number; readonly north: number }
/** An open ring: the first point is NOT repeated at the end. */
export type GeoRing = readonly GeoPoint[];
/** GeoJSON position, [longitude, latitude]. */
export type LngLat = readonly [number, number];

const M_PER_DEG = (6371000 * Math.PI) / 180;

export type CoordinateProblem = 'not-finite' | 'out-of-wgs84' | 'null-island' | 'swapped' | 'outside-bounds';

export const isFiniteWgs84 = (p: GeoPoint): boolean =>
  Number.isFinite(p.lat) && Number.isFinite(p.lng) && Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180;

export const isInBounds = (p: GeoPoint, b: GeoBounds): boolean => p.lat >= b.south && p.lat <= b.north && p.lng >= b.west && p.lng <= b.east;

/**
 * Why a coordinate cannot be right, or null when it is plausible. Bounds are the venue's own, so a venue anywhere on Earth passes
 * as long as its data is inside its own area. 'swapped' means the point is outside the bounds but its (lng, lat) reading is inside:
 * the classic GeoJSON/named-field mix-up. Decimal places say nothing about survey accuracy; this never looks at them.
 */
export const diagnoseCoordinate = (p: GeoPoint, bounds?: GeoBounds): CoordinateProblem | null => {
  if (!Number.isFinite(p.lat) || !Number.isFinite(p.lng)) return 'not-finite';
  if (Math.abs(p.lat) > 90 || Math.abs(p.lng) > 180) return bounds && isInBounds({ lat: p.lng, lng: p.lat }, bounds) ? 'swapped' : 'out-of-wgs84';
  if (p.lat === 0 && p.lng === 0) return 'null-island';
  if (bounds && !isInBounds(p, bounds)) return isFiniteWgs84({ lat: p.lng, lng: p.lat }) && isInBounds({ lat: p.lng, lng: p.lat }, bounds) ? 'swapped' : 'outside-bounds';
  return null;
};

export const toGeoJsonRing = (ring: GeoRing): LngLat[] => {
  const out = ring.map((p): LngLat => [p.lng, p.lat]);
  if (out.length) out.push(out[0]);
  return out;
};

/** A GeoJSON linear ring back to an open ring; null unless it is closed, finite and has at least 3 distinct positions. */
export const fromGeoJsonRing = (coords: unknown): GeoRing | null => {
  if (!Array.isArray(coords) || coords.length < 4) return null;
  const pts: GeoPoint[] = [];
  for (const c of coords) {
    if (!Array.isArray(c) || c.length < 2 || typeof c[0] !== 'number' || typeof c[1] !== 'number') return null;
    pts.push({ lat: c[1], lng: c[0] });
  }
  const first = pts[0], last = pts[pts.length - 1];
  if (first.lat !== last.lat || first.lng !== last.lng) return null;
  pts.pop();
  return pts.every(isFiniteWgs84) ? pts : null;
};

interface XY { x: number; y: number }
const projector = (points: readonly GeoPoint[]): ((p: GeoPoint) => XY) => {
  const lat0 = points.reduce((s, p) => s + p.lat, 0) / Math.max(1, points.length);
  const lng0 = points.reduce((s, p) => s + p.lng, 0) / Math.max(1, points.length);
  const k = Math.cos((lat0 * Math.PI) / 180);
  return (p) => ({ x: (p.lng - lng0) * k * M_PER_DEG, y: (p.lat - lat0) * M_PER_DEG });
};

const cross = (o: XY, a: XY, b: XY): number => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
const onSegment = (a: XY, b: XY, p: XY): boolean => Math.min(a.x, b.x) <= p.x && p.x <= Math.max(a.x, b.x) && Math.min(a.y, b.y) <= p.y && p.y <= Math.max(a.y, b.y);
/** True when the closed segments share any point (touching counts). */
const segmentsTouch = (a: XY, b: XY, c: XY, d: XY): boolean => {
  const d1 = cross(c, d, a), d2 = cross(c, d, b), d3 = cross(a, b, c), d4 = cross(a, b, d);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true;
  return (d1 === 0 && onSegment(c, d, a)) || (d2 === 0 && onSegment(c, d, b)) || (d3 === 0 && onSegment(a, b, c)) || (d4 === 0 && onSegment(a, b, d));
};
/** True only for a genuine crossing (both segments pass through each other); shared endpoints and touching do not count. */
const segmentsCross = (a: XY, b: XY, c: XY, d: XY): boolean => {
  const d1 = cross(c, d, a), d2 = cross(c, d, b), d3 = cross(a, b, c), d4 = cross(a, b, d);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
};

/** Signed area in square metres: positive = counter-clockwise (the GeoJSON exterior-ring convention, RFC 7946). */
export const signedAreaM2 = (ring: GeoRing): number => {
  const xy = ring.map(projector(ring));
  let s = 0;
  for (let i = 0; i < xy.length; i++) { const a = xy[i], b = xy[(i + 1) % xy.length]; s += a.x * b.y - b.x * a.y; }
  return s / 2;
};

export type RingProblem = 'too-few-points' | 'not-finite' | 'duplicate-vertex' | 'zero-area' | 'self-intersecting';

/** Everything wrong with a polygon ring, in a stable order; empty means it is a simple, non-degenerate ring. */
export const ringProblems = (ring: GeoRing): RingProblem[] => {
  if (ring.length < 3) return ['too-few-points'];
  if (!ring.every(isFiniteWgs84)) return ['not-finite'];
  const out: RingProblem[] = [];
  const seen = new Set<string>();
  for (const p of ring) { const key = `${p.lat},${p.lng}`; if (seen.has(key)) { out.push('duplicate-vertex'); break; } seen.add(key); }
  if (Math.abs(signedAreaM2(ring)) < 0.01) out.push('zero-area');
  const xy = ring.map(projector(ring));
  const n = xy.length;
  outer: for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const adjacent = j === i + 1 || (i === 0 && j === n - 1);
      if (adjacent) continue;
      if (segmentsTouch(xy[i], xy[(i + 1) % n], xy[j], xy[(j + 1) % n])) { out.push('self-intersecting'); break outer; }
    }
  }
  return out;
};

/**
 * Orders unordered boundary points counter-clockwise around `around` (angle sort) and says whether the result is a valid simple ring.
 * The order a survey listed corners in (C1..C4) proves nothing about winding, so it is never trusted: only this validated result is.
 */
export const ringFromUnorderedPoints = (points: readonly GeoPoint[], around: GeoPoint): { ring: GeoRing; problems: RingProblem[] } => {
  const ring = points.map((p) => ({ lat: p.lat, lng: p.lng })).sort((a, b) => Math.atan2(a.lat - around.lat, a.lng - around.lng) - Math.atan2(b.lat - around.lat, b.lng - around.lng));
  return { ring, problems: ringProblems(ring) };
};

/** Same ring wound counter-clockwise (GeoJSON exterior); a copy, never mutated. */
export const counterClockwise = (ring: GeoRing): GeoRing => (signedAreaM2(ring) < 0 ? [...ring].reverse() : [...ring]);

/** Distance in metres from a point to the nearest edge of the ring. */
export const distanceToRingM = (p: GeoPoint, ring: GeoRing): number => {
  const proj = projector([...ring, p]);
  const q = proj(p), xy = ring.map(proj);
  let best = Infinity;
  for (let i = 0; i < xy.length; i++) {
    const a = xy[i], b = xy[(i + 1) % xy.length];
    const dx = b.x - a.x, dy = b.y - a.y, len2 = dx * dx + dy * dy;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((q.x - a.x) * dx + (q.y - a.y) * dy) / len2));
    best = Math.min(best, Math.hypot(q.x - (a.x + t * dx), q.y - (a.y + t * dy)));
  }
  return best;
};

/** Ray-casting containment. A point exactly on an edge counts as inside. */
export const pointInRing = (p: GeoPoint, ring: GeoRing): boolean => {
  if (ring.length < 3) return false;
  const proj = projector([...ring, p]);
  const q = proj(p), xy = ring.map(proj);
  let inside = false;
  for (let i = 0, j = xy.length - 1; i < xy.length; j = i++) {
    const a = xy[i], b = xy[j];
    if (cross(a, b, q) === 0 && onSegment(a, b, q)) return true;
    if ((a.y > q.y) !== (b.y > q.y) && q.x < ((b.x - a.x) * (q.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
};

/** Do the interiors of two rings intersect? Touching along a shared edge or at a corner is not an overlap. */
export const ringsOverlap = (a: GeoRing, b: GeoRing): boolean => {
  const proj = projector([...a, ...b]);
  const A = a.map(proj), B = b.map(proj);
  for (let i = 0; i < A.length; i++) for (let j = 0; j < B.length; j++) if (segmentsCross(A[i], A[(i + 1) % A.length], B[j], B[(j + 1) % B.length])) return true;
  // No edge crosses: either disjoint (or touching) or one lies inside the other. Test the centroid-ish probes, not the shared vertices.
  const mid = (r: XY[]): XY => ({ x: r.reduce((s, p) => s + p.x, 0) / r.length, y: r.reduce((s, p) => s + p.y, 0) / r.length });
  const inRing = (q: XY, r: XY[]): boolean => {
    let inside = false;
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) if ((r[i].y > q.y) !== (r[j].y > q.y) && q.x < ((r[j].x - r[i].x) * (q.y - r[i].y)) / (r[j].y - r[i].y) + r[i].x) inside = !inside;
    return inside;
  };
  return inRing(mid(A), B) || inRing(mid(B), A);
};

export type AssignmentStatus = 'inside' | 'boundary' | 'ambiguous' | 'outside';
export interface Assignment {
  status: AssignmentStatus;
  /** Every candidate that contains the point or lies within the tolerance of it, nearest first. */
  ids: string[];
  /** Nearest candidate overall (also set for 'outside', so a caller can say how far from anything the point is). */
  nearestId?: string;
  nearestDistanceM?: number;
}

/**
 * Which polygon owns a point. 'inside' = exactly one polygon contains it, clear of every edge; 'boundary' = exactly one candidate,
 * but within `boundaryToleranceM` of its edge (or just outside it): needs a human; 'ambiguous' = several candidates (overlap or a
 * shared edge); 'outside' = none. Nothing is ever guessed: a caller decides what to do with anything other than 'inside'.
 */
export const assignToRings = (p: GeoPoint, candidates: ReadonlyArray<{ id: string; ring: GeoRing }>, boundaryToleranceM = 2): Assignment => {
  const scored = candidates.map(({ id, ring }) => ({ id, contains: pointInRing(p, ring), distanceM: distanceToRingM(p, ring) }));
  scored.sort((x, y) => x.distanceM - y.distanceM || (x.id < y.id ? -1 : 1));
  const near = scored.filter((s) => s.contains || s.distanceM <= boundaryToleranceM);
  const nearest = scored[0];
  const base = { ids: near.map((s) => s.id), ...(nearest ? { nearestId: nearest.id, nearestDistanceM: nearest.distanceM } : {}) };
  if (near.length === 0) return { status: 'outside', ...base };
  if (near.length > 1) return { status: 'ambiguous', ...base };
  return { status: near[0].contains && near[0].distanceM > boundaryToleranceM ? 'inside' : 'boundary', ...base };
};

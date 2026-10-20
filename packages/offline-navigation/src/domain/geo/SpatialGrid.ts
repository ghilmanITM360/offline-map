/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface SpatialGridPoint {
  id: string;
  lat: number;
  lng: number;
}

const EARTH_RADIUS_M = 6371000;

const toRad = (deg: number): number => (deg * Math.PI) / 180;

const haversineM = (aLat: number, aLng: number, bLat: number, bLng: number): number => {
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const lat1 = toRad(aLat);
  const lat2 = toRad(bLat);
  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const h = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
};

/**
 * Uniform grid-bucket nearest-neighbor index. O(1) average lookup instead of
 * a linear scan — needed once a point set grows past a few hundred entries
 * (the outside street graph is ~14k nodes; the internal venue graph at 289
 * nodes has no need for this and keeps its existing linear scan).
 */
export class SpatialGrid {
  private readonly cellSizeDeg: number;
  private readonly cells = new Map<string, SpatialGridPoint[]>();

  constructor(points: SpatialGridPoint[], cellSizeMeters = 150) {
    // 1 degree latitude ~= 111,320m; used as a fixed approximation for cell
    // sizing (fine for a bounded few-km extract, no need for latitude-adjusted
    // longitude cell width — cells are just slightly non-square near the poles,
    // irrelevant at Karachi's latitude).
    this.cellSizeDeg = cellSizeMeters / 111320;
    for (const point of points) this.insert(point);
  }

  private cellKey(lat: number, lng: number): string {
    const row = Math.floor(lat / this.cellSizeDeg);
    const col = Math.floor(lng / this.cellSizeDeg);
    return `${row}:${col}`;
  }

  private insert(point: SpatialGridPoint): void {
    const key = this.cellKey(point.lat, point.lng);
    const bucket = this.cells.get(key);
    if (bucket) bucket.push(point);
    else this.cells.set(key, [point]);
  }

  /**
   * Nearest point to (lat, lng), or undefined if the grid is empty.
   * Expands search ring-by-ring until the closest candidate found is
   * provably nearer than any point that could exist just outside the
   * scanned rings.
   */
  nearest(lat: number, lng: number): { point: SpatialGridPoint; distanceM: number } | undefined {
    if (this.cells.size === 0) return undefined;

    const centerRow = Math.floor(lat / this.cellSizeDeg);
    const centerCol = Math.floor(lng / this.cellSizeDeg);
    const cellSizeM = this.cellSizeDeg * 111320;

    let best: { point: SpatialGridPoint; distanceM: number } | undefined;
    const maxRadius = Math.max(200, this.cells.size); // hard stop, grid is finite

    for (let radius = 0; radius <= maxRadius; radius += 1) {
      for (let row = centerRow - radius; row <= centerRow + radius; row += 1) {
        for (let col = centerCol - radius; col <= centerCol + radius; col += 1) {
          const onRing = Math.max(Math.abs(row - centerRow), Math.abs(col - centerCol)) === radius;
          if (!onRing) continue;
          const bucket = this.cells.get(`${row}:${col}`);
          if (!bucket) continue;
          for (const point of bucket) {
            const distanceM = haversineM(lat, lng, point.lat, point.lng);
            if (!best || distanceM < best.distanceM) best = { point, distanceM };
          }
        }
      }

      // Once a candidate is found, any point outside the next ring is at
      // least `radius * cellSizeM` away in the lat direction, but a degree of
      // longitude is shorter than a degree of latitude away from the equator
      // (by cos(lat)), so the same degree-sized cell is narrower in meters
      // east-west. Scale the bound down by cos(lat) so it stays conservative
      // in both directions instead of only holding near the equator.
      const lngCorrectedCellSizeM = cellSizeM * Math.cos(toRad(lat));
      if (best && best.distanceM <= radius * lngCorrectedCellSizeM) break;
    }

    return best;
  }
}

export { haversineM };

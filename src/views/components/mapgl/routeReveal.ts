/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { OverlaySpec } from './overlaySpec';

type LngLat = [number, number];

const METERS_PER_DEGREE = 111320;

function segmentMeters(a: LngLat, b: LngLat): number {
  const dLat = (b[1] - a[1]) * METERS_PER_DEGREE;
  const dLon = (b[0] - a[0]) * METERS_PER_DEGREE * Math.cos((a[1] * Math.PI) / 180);
  return Math.hypot(dLat, dLon);
}

export function lineLengthMeters(coords: readonly LngLat[]): number {
  let total = 0;
  for (let i = 1; i < coords.length; i++) total += segmentMeters(coords[i - 1], coords[i]);
  return total;
}

/** The first `fraction` (0..1) of a line by length, ending on an interpolated point. Fewer than 2 points = nothing drawable. */
export function sliceLineByFraction(coords: readonly LngLat[], fraction: number): LngLat[] {
  if (fraction >= 1) return coords.map((c) => [c[0], c[1]]);
  const total = lineLengthMeters(coords);
  if (fraction <= 0 || total === 0) return [];
  const target = total * fraction;
  const out: LngLat[] = [[coords[0][0], coords[0][1]]];
  let walked = 0;
  for (let i = 1; i < coords.length; i++) {
    const seg = segmentMeters(coords[i - 1], coords[i]);
    if (walked + seg >= target) {
      const t = seg === 0 ? 0 : (target - walked) / seg;
      out.push([coords[i - 1][0] + (coords[i][0] - coords[i - 1][0]) * t, coords[i - 1][1] + (coords[i][1] - coords[i - 1][1]) * t]);
      return out;
    }
    walked += seg;
    out.push([coords[i][0], coords[i][1]]);
  }
  return out;
}

/**
 * The data to draw for a spec at overall reveal progress `progress` (0..1). A spec with a `reveal` range grows over
 * that slice of the timeline; any other spec, or a finished reveal, returns the SAME data object so no native update
 * is sent. Only line features grow; everything else is kept.
 */
export function revealSpecData(spec: OverlaySpec, progress: number): GeoJSON.FeatureCollection {
  const range = spec.reveal;
  if (!range || progress >= range.to) return spec.data;
  const local = range.to === range.from ? 1 : (progress - range.from) / (range.to - range.from);
  const features: GeoJSON.Feature[] = [];
  for (const feature of spec.data.features) {
    if (feature.geometry.type !== 'LineString') {
      features.push(feature);
      continue;
    }
    const part = sliceLineByFraction(feature.geometry.coordinates as LngLat[], local);
    if (part.length >= 2) features.push({ ...feature, geometry: { type: 'LineString', coordinates: part } });
  }
  return { type: 'FeatureCollection', features };
}

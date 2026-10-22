/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// #140: the app-owned MapLibre style for the bundled offline basemap. One vector source (the local
// PMTiles archive) and nothing else — deliberately NO `glyphs`, `sprite` or remote URL, so a render
// can never reach for the network. Venue overlays are added on top by the canvas.

export const BASEMAP_SOURCE_ID = 'ijtema-basemap';
// iOS URL sources replace sibling metadata with archive TileJSON. Inline tiles retain this credit.
export const BASEMAP_ATTRIBUTION = '© OpenStreetMap contributors';
const IOS_BASEMAP_ATTRIBUTION = `<a href="https://www.openstreetmap.org/copyright">${BASEMAP_ATTRIBUTION}</a>`;

// Calm, low-contrast ground so the route, destination and venue overlays carry the visual weight.
export const BASEMAP_COLORS = {
  land: '#F4F1EA',
  green: '#DDE8D2',
  otherLanduse: '#EDE8DE',
  water: '#BBD6EA',
  building: '#E3DDD0',
  roadCasing: '#E0D9CB',
  road: '#FFFFFF',
  path: '#D8D1C3',
} as const;

const GREEN_CLASSES = ['park', 'garden', 'forest', 'wood', 'grass', 'meadow', 'recreation_ground', 'nature_reserve', 'village_green', 'scrub', 'orchard', 'pitch', 'playground'];

const widthByZoom = (z12: number, z16: number, z19: number) => ['interpolate', ['exponential', 1.6], ['zoom'], 12, z12, 16, z16, 19, z19];

export interface BasemapStyle {
  version: 8;
  sources: Record<string, { type: 'vector'; url?: string; tiles?: string[]; minzoom: number; maxzoom: number; attribution: string }>;
  layers: Record<string, unknown>[];
}

/** `archiveFileUri` null (install failed): a plain land-coloured canvas — venue overlays still render. */
export function buildBasemapStyle(archiveFileUri: string | null, zoom: { min: number; max: number }, platform = 'android'): BasemapStyle {
  const c = BASEMAP_COLORS;
  if (archiveFileUri === null) return { version: 8, sources: {}, layers: [{ id: 'bg', type: 'background', paint: { 'background-color': c.land } }] };
  const src = BASEMAP_SOURCE_ID;
  const roads = (cls: string) => ['==', ['get', 'class'], cls];
  return {
    version: 8,
    sources: { [src]: platform === 'ios'
      ? { type: 'vector', tiles: [`pmtiles://${archiveFileUri}`], minzoom: zoom.min, maxzoom: zoom.max, attribution: IOS_BASEMAP_ATTRIBUTION }
      : { type: 'vector', url: `pmtiles://${archiveFileUri}`, minzoom: zoom.min, maxzoom: zoom.max, attribution: BASEMAP_ATTRIBUTION } },
    layers: [
      { id: 'bg', type: 'background', paint: { 'background-color': c.land } },
      {
        id: 'landuse',
        type: 'fill',
        source: src,
        'source-layer': 'landuse',
        paint: { 'fill-color': ['match', ['get', 'class'], GREEN_CLASSES, c.green, c.otherLanduse] },
      },
      { id: 'water-fill', type: 'fill', source: src, 'source-layer': 'water', filter: ['==', ['geometry-type'], 'Polygon'], paint: { 'fill-color': c.water } },
      { id: 'water-line', type: 'line', source: src, 'source-layer': 'water', filter: ['==', ['geometry-type'], 'LineString'], paint: { 'line-color': c.water, 'line-width': widthByZoom(1, 3, 8) } },
      { id: 'buildings', type: 'fill', source: src, 'source-layer': 'buildings', paint: { 'fill-color': c.building } },
      {
        id: 'paths',
        type: 'line',
        source: src,
        'source-layer': 'roads',
        filter: roads('path'),
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': c.path, 'line-width': widthByZoom(0.4, 1, 2.5), 'line-dasharray': [2, 1.5] },
      },
      {
        id: 'roads-minor',
        type: 'line',
        source: src,
        'source-layer': 'roads',
        filter: roads('minor'),
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': c.road, 'line-width': widthByZoom(0.6, 3, 11) },
      },
      {
        id: 'roads-major-casing',
        type: 'line',
        source: src,
        'source-layer': 'roads',
        filter: roads('major'),
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': c.roadCasing, 'line-width': widthByZoom(3, 8, 20) },
      },
      {
        id: 'roads-major',
        type: 'line',
        source: src,
        'source-layer': 'roads',
        filter: roads('major'),
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': c.road, 'line-width': widthByZoom(2, 6, 17) },
      },
    ],
  };
}

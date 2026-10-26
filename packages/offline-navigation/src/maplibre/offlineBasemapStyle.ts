/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// The MapLibre style for an offline basemap: one vector source (a local PMTiles archive) and nothing else. There is
// deliberately NO `glyphs`, `sprite` or remote URL, so a render can never reach for the network. The layer set expects
// OpenStreetMap-derived tiles with `landuse`, `water`, `buildings` and `roads` (class: path | minor | major) source layers.

export const OFFLINE_BASEMAP_SOURCE_ID = 'sdk-basemap';
// iOS URL sources replace sibling metadata with the archive's TileJSON, so inline tiles keep this credit.
export const OSM_ATTRIBUTION = '© OpenStreetMap contributors';
const IOS_ATTRIBUTION = `<a href="https://www.openstreetmap.org/copyright">${OSM_ATTRIBUTION}</a>`;

export interface BasemapColors {
  land: string;
  green: string;
  otherLanduse: string;
  water: string;
  building: string;
  roadCasing: string;
  /** Minor roads. */
  road: string;
  /** Major roads; light draws them in the same white as minor roads, dark lifts them above the minor ones. */
  roadMajor: string;
  path: string;
}

export const BASEMAP_COLORS: BasemapColors = {
  land: '#F4F1EA',
  green: '#DDE8D2',
  otherLanduse: '#EDE8DE',
  water: '#BBD6EA',
  building: '#E3DDD0',
  roadCasing: '#E0D9CB',
  road: '#FFFFFF',
  roadMajor: '#FFFFFF',
  path: '#D8D1C3',
};

// The same layers in a dark palette, so switching appearance changes colours only. Roads and paths stay at least 3:1 against the land
// and the dashed paths are lighter than the buildings, so walking routes remain legible with no light tile source.
export const BASEMAP_COLORS_DARK: BasemapColors = {
  land: '#161C18',
  green: '#1D2A20',
  otherLanduse: '#1B221E',
  water: '#16293A',
  building: '#262E29',
  roadCasing: '#0C100E',
  road: '#6F7D74',
  roadMajor: '#9AA9A1',
  path: '#7B8981',
};

export type BasemapScheme = 'light' | 'dark';
export const basemapColors = (scheme: BasemapScheme = 'light'): BasemapColors => (scheme === 'dark' ? BASEMAP_COLORS_DARK : BASEMAP_COLORS);

const GREEN_CLASSES = ['park', 'garden', 'forest', 'wood', 'grass', 'meadow', 'recreation_ground', 'nature_reserve', 'village_green', 'scrub', 'orchard', 'pitch', 'playground'];
const widthByZoom = (z12: number, z16: number, z19: number) => ['interpolate', ['exponential', 1.6], ['zoom'], 12, z12, 16, z16, 19, z19];

export interface OfflineBasemapStyle {
  version: 8;
  sources: Record<string, { type: 'vector'; url?: string; tiles?: string[]; minzoom: number; maxzoom: number; attribution: string }>;
  layers: Record<string, unknown>[];
}

/** `archiveFileUri` null (not installed): a plain land-coloured canvas; the route and markers still render over it. */
export function buildOfflineBasemapStyle(archiveFileUri: string | null, zoom: { min: number; max: number }, platform: string = 'android', scheme: BasemapScheme = 'light'): OfflineBasemapStyle {
  const c = basemapColors(scheme);
  const bg = { id: 'bg', type: 'background', paint: { 'background-color': c.land } };
  if (archiveFileUri === null) return { version: 8, sources: {}, layers: [bg] };
  const src = OFFLINE_BASEMAP_SOURCE_ID;
  const roads = (cls: string) => ['==', ['get', 'class'], cls];
  const road = (id: string, cls: string, paint: Record<string, unknown>) =>
    ({ id, type: 'line', source: src, 'source-layer': 'roads', filter: roads(cls), layout: { 'line-cap': 'round', 'line-join': 'round' }, paint });
  const tiles = `pmtiles://${archiveFileUri}`;
  return {
    version: 8,
    sources: { [src]: platform === 'ios'
      ? { type: 'vector', tiles: [tiles], minzoom: zoom.min, maxzoom: zoom.max, attribution: IOS_ATTRIBUTION }
      : { type: 'vector', url: tiles, minzoom: zoom.min, maxzoom: zoom.max, attribution: OSM_ATTRIBUTION } },
    layers: [
      bg,
      { id: 'landuse', type: 'fill', source: src, 'source-layer': 'landuse', paint: { 'fill-color': ['match', ['get', 'class'], GREEN_CLASSES, c.green, c.otherLanduse] } },
      { id: 'water-fill', type: 'fill', source: src, 'source-layer': 'water', filter: ['==', ['geometry-type'], 'Polygon'], paint: { 'fill-color': c.water } },
      { id: 'water-line', type: 'line', source: src, 'source-layer': 'water', filter: ['==', ['geometry-type'], 'LineString'], paint: { 'line-color': c.water, 'line-width': widthByZoom(1, 3, 8) } },
      { id: 'buildings', type: 'fill', source: src, 'source-layer': 'buildings', paint: { 'fill-color': c.building } },
      road('paths', 'path', { 'line-color': c.path, 'line-width': widthByZoom(0.4, 1, 2.5), 'line-dasharray': [2, 1.5] }),
      road('roads-minor', 'minor', { 'line-color': c.road, 'line-width': widthByZoom(0.6, 3, 11) }),
      road('roads-major-casing', 'major', { 'line-color': c.roadCasing, 'line-width': widthByZoom(3, 8, 20) }),
      road('roads-major', 'major', { 'line-color': c.roadMajor, 'line-width': widthByZoom(2, 6, 17) }),
    ],
  };
}

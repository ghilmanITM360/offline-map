/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// The dark basemap is the same offline style with a different palette: no network reference of any kind, the same layers, and roads,
// paths, route and markers that stay legible on dark land.
import {
  BASEMAP_COLORS, BASEMAP_COLORS_DARK, basemapColors, buildOfflineBasemapStyle, DEFAULT_MAP_COLORS, DEFAULT_MAP_COLORS_DARK,
} from '@muslim-ummah/offline-navigation/maplibre';

const channel = (v: number) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
const luminance = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
};
const contrast = (a: string, b: string) => { const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };

const zoom = { min: 12, max: 16 };

describe('dark basemap', () => {
  it('has exactly the light style\'s layers and sources; only colours differ', () => {
    for (const platform of ['android', 'ios']) {
      const light = buildOfflineBasemapStyle('file:///v.pmtiles', zoom, platform, 'light');
      const dark = buildOfflineBasemapStyle('file:///v.pmtiles', zoom, platform, 'dark');
      expect(dark.layers.map((l) => l.id)).toEqual(light.layers.map((l) => l.id));
      expect(dark.sources).toEqual(light.sources);
      expect(JSON.stringify(dark)).not.toEqual(JSON.stringify(light));
    }
  });

  it('defaults to light so existing hosts are unchanged', () => {
    expect(buildOfflineBasemapStyle('file:///v.pmtiles', zoom)).toEqual(buildOfflineBasemapStyle('file:///v.pmtiles', zoom, 'android', 'light'));
    expect(basemapColors()).toBe(BASEMAP_COLORS);
    expect(basemapColors('dark')).toBe(BASEMAP_COLORS_DARK);
  });

  it('reaches for no network: no glyphs, sprite or remote URL, and the attribution is kept', () => {
    for (const scheme of ['light', 'dark'] as const) {
      const style = buildOfflineBasemapStyle('file:///v.pmtiles', zoom, 'android', scheme);
      expect(style).not.toHaveProperty('glyphs');
      expect(style).not.toHaveProperty('sprite');
      const text = JSON.stringify(style);
      expect(text).not.toMatch(/https?:\/\/(?!www\.openstreetmap\.org\/copyright)/);
      expect(text).toContain('OpenStreetMap');
    }
  });

  it('draws only the land when the archive is missing, in the scheme\'s land colour', () => {
    expect(buildOfflineBasemapStyle(null, zoom, 'android', 'dark').layers).toEqual([{ id: 'bg', type: 'background', paint: { 'background-color': BASEMAP_COLORS_DARK.land } }]);
  });

  it('keeps roads and walking paths legible against dark land', () => {
    const c = BASEMAP_COLORS_DARK;
    expect(contrast(c.road, c.land)).toBeGreaterThanOrEqual(3);
    expect(contrast(c.roadMajor, c.land)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(c.path, c.land)).toBeGreaterThanOrEqual(3);
    expect(contrast(c.path, c.building)).toBeGreaterThanOrEqual(3);
    expect(contrast(c.road, c.green)).toBeGreaterThanOrEqual(3);
    expect(contrast(c.road, c.water)).toBeGreaterThanOrEqual(3);
  });

  it('keeps the route, origin, destination and walker visible on dark land', () => {
    const m = DEFAULT_MAP_COLORS_DARK;
    const land = BASEMAP_COLORS_DARK.land;
    for (const colour of [m.route, m.origin, m.destination, m.position, m.place]) expect(contrast(colour, land)).toBeGreaterThanOrEqual(3);
    expect(contrast(m.route, m.routeCasing)).toBeGreaterThanOrEqual(4.5);
    // The light overlay is untouched.
    expect(DEFAULT_MAP_COLORS.route).toBe('#0B6B4D');
    expect(contrast(DEFAULT_MAP_COLORS.route, BASEMAP_COLORS.land)).toBeGreaterThanOrEqual(4.5);
  });
});

import type { NavigationRoute } from '@muslim-ummah/offline-navigation';
import {
  boundsOfPoints,
  buildOfflineBasemapStyle,
  markerCollection,
  placePoints,
  routeCollection,
} from '@muslim-ummah/offline-navigation/maplibre';
import { testVenue } from './sdkTestVenue';

const line = {
  points: [{ lat: 24.9, lng: 67.0 }, { lat: 24.91, lng: 67.01 }, { lat: 24.92, lng: 67.01 }],
  cumulativeM: [0, 10, 20],
  totalM: 20,
};
const route = { originId: 'lobby', destinationId: 'hall', nodeIds: ['n/1', 'n/2', 'n/4'], distanceM: 20, steps: [], line } as NavigationRoute;

describe('MapLibre overlay data', () => {
  it('draws the route as one [lng, lat] LineString, and nothing without a line', () => {
    expect(routeCollection(route).features).toEqual([
      { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [[67.0, 24.9], [67.01, 24.91], [67.01, 24.92]] } },
    ]);
    expect(routeCollection(null).features).toEqual([]);
    expect(routeCollection({ ...route, line: null }).features).toEqual([]);
  });

  it('marks origin, destination and the walker with their role; ignores a missing or invalid position', () => {
    const points = [{ id: 'lobby', kind: 'hall', coordinate: line.points[0] }, { id: 'hall', kind: 'hall', coordinate: line.points[2] }];
    const roles = (c: ReturnType<typeof markerCollection>) => c.features.map((f) => `${f.properties.role}:${f.properties.id}`);
    expect(roles(markerCollection(points, 'lobby', 'hall', { lat: 24.905, lng: 67.005 }))).toEqual(['origin:lobby', 'destination:hall', 'position:position']);
    expect(roles(markerCollection(points, null, 'hall', null))).toEqual(['destination:hall']);
    expect(roles(markerCollection(points, 'nope', null, { lat: NaN, lng: 67 }))).toEqual([]);
  });

  it('places come from the venue: the first of their nodes with a valid coordinate', () => {
    const ids = placePoints(testVenue).map((p) => p.id);
    expect(ids).toEqual(expect.arrayContaining(['lobby', 'annex', 'hall']));
    for (const p of placePoints(testVenue)) expect(Number.isFinite(p.coordinate.lat + p.coordinate.lng)).toBe(true);
  });

  it('bounds are [west, south, east, north] and never collapse to a point', () => {
    expect(boundsOfPoints(line.points, 0.0001)).toEqual([67.0, 24.9, 67.01, 24.92]);
    const [w, s, e, n] = boundsOfPoints([{ lat: 25, lng: 67 }], 0.001)!;
    expect(e - w).toBeCloseTo(0.001);
    expect(n - s).toBeCloseTo(0.001);
    expect(boundsOfPoints([], 0.001)).toBeNull();
  });
});

describe('offline basemap style', () => {
  it('has no glyphs, sprite or remote URL: the only source is the local PMTiles archive', () => {
    const style = buildOfflineBasemapStyle('file:///data/venue.pmtiles', { min: 10, max: 17 }, 'android');
    expect(style).not.toHaveProperty('glyphs');
    expect(style).not.toHaveProperty('sprite');
    expect(JSON.stringify(style)).not.toMatch(/https?:\/\/(?!www\.openstreetmap\.org\/copyright)/);
    expect(Object.values(style.sources)).toHaveLength(1);
    expect(Object.values(style.sources)[0]).toMatchObject({ url: 'pmtiles://file:///data/venue.pmtiles', attribution: '© OpenStreetMap contributors' });
  });

  it('iOS uses inline tiles and keeps the credit; a missing archive is a plain canvas', () => {
    const ios = Object.values(buildOfflineBasemapStyle('file:///v.pmtiles', { min: 10, max: 17 }, 'ios').sources)[0];
    expect(ios).toMatchObject({ tiles: ['pmtiles://file:///v.pmtiles'] });
    expect(ios.attribution).toContain('OpenStreetMap');
    const plain = buildOfflineBasemapStyle(null, { min: 10, max: 17 });
    expect(plain.sources).toEqual({});
    expect(plain.layers).toHaveLength(1);
  });
});

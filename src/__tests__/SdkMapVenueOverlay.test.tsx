/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// The map with the pack's geometry: Karachi's real surveyed blocks, gates and rastas as GeoJSON, the destination pin apart from the route end,
// selection by stable id, labels that need no glyph server. The native map is a stand-in; this proves the data and wiring, not pixels.
import React from 'react';
import { act, render } from '@testing-library/react-native';
import type { NavigationMapProps } from '@muslim-ummah/offline-navigation/ui';
import { createMapLibreNavigationMap, presentationMarkers, venueOverlay } from '@muslim-ummah/offline-navigation/maplibre';
import {
  createPlaceCatalog, describeDestination, findBestVenuePath, parsePackPlaceCatalog, parsePackVenueGeometry, pointInRing, type NavigationRoute,
} from '@muslim-ummah/offline-navigation';
import { IJTEMA_BLOCKS } from '../data/ijtema/blocks';
import { buildKarachiPlaceCatalog, buildKarachiVenueGeometry } from '../data/ijtema/packResources';
import { IJTEMA_VENUE_SOURCE as SOURCE } from '../data/ijtema/venueAdapter';

const mockSetStop = jest.fn((stop: unknown) => Promise.resolve(stop));
jest.mock('@maplibre/maplibre-react-native', () => {
  const R = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    Map: (p: any) => R.createElement(View, { testID: 'map', ...p }, p.children),
    Camera: (p: any) => { R.useImperativeHandle(p.ref, () => ({ setStop: mockSetStop }), []); return R.createElement(View, { testID: 'camera' }); },
    GeoJSONSource: (p: any) => R.createElement(View, { testID: `source-${p.id}`, data: p.data, onPress: p.onPress }, p.children),
    Layer: (p: any) => R.createElement(View, { testID: `layer-${p.id}`, ...p }),
    Marker: (p: any) => R.createElement(View, { testID: `marker-${p.id}`, lngLat: p.lngLat, pointerEvents: p.pointerEvents }, p.children),
  };
});

const BOUNDS = { west: 66.9974, south: 24.963, east: 67.0155, north: 24.9758 };
const geoParsed = parsePackVenueGeometry(JSON.stringify(buildKarachiVenueGeometry()), { venueId: SOURCE.venueId, bounds: BOUNDS });
const catParsed = parsePackPlaceCatalog(JSON.stringify(buildKarachiPlaceCatalog()), { venueId: SOURCE.venueId, bounds: BOUNDS });
if (!geoParsed.ok || !catParsed.ok) throw new Error('Karachi resources did not parse');
const geometry = geoParsed.geometry;
const catalog = createPlaceCatalog(catParsed.catalog);

const options = { venue: SOURCE, archiveUri: 'file:///k.pmtiles', archiveZoom: { min: 10, max: 17 }, initialCenter: { lat: 24.9695, lng: 67.004 }, initialZoom: 15 };
const base: NavigationMapProps = { phase: 'browsing' as any, route: null, originId: null, destinationId: null, position: null, stepIndex: 0, onAvailabilityChange: jest.fn() };
type View = Awaited<ReturnType<typeof render>>;
const data = (api: View, id: string) => api.getByTestId(`source-${id}`).props.data;
const routeTo = (placeId: string): NavigationRoute => {
  const found = findBestVenuePath(SOURCE.graph, SOURCE.getPlace('GATE_12')!.nodeIds, SOURCE.getPlace(placeId)!.nodeIds)!;
  const points = found.nodes.map((n) => SOURCE.graph.getNode(n)!.coordinate);
  return { originId: 'GATE_12', destinationId: placeId, nodeIds: found.nodes, distanceM: found.distanceM, steps: [], line: { points, cumulativeM: points.map(() => 0), totalM: found.distanceM } } as unknown as NavigationRoute;
};

describe('venueOverlay (pure data)', () => {
  const overlay = venueOverlay(geometry, catalog, 'en');
  it('turns the pack geometry into GeoJSON in [lng, lat] order: 42 closed block rings, gates, rastas and special routes; nothing invented', () => {
    expect(overlay.blocks.features).toHaveLength(42);
    for (const f of overlay.blocks.features) {
      const ring = f.geometry.coordinates[0];
      expect(ring[0]).toEqual(ring[ring.length - 1]);
      expect(ring.length).toBe(5);
      const block = IJTEMA_BLOCKS.find((b) => b.id === f.properties.id)!;
      expect(pointInRing(block.center, ring.slice(0, -1).map(([lng, lat]) => ({ lat, lng })))).toBe(true);
    }
    expect(overlay.gates.features.map((f) => f.properties.status).filter((s) => s === 'unreachable')).toHaveLength(2);
    expect(overlay.lines.features.filter((f) => f.properties.kind === 'rasta')).toHaveLength(11);
    expect(overlay.lines.features.filter((f) => f.properties.kind === 'special-route')).toHaveLength(3);
    expect(overlay.facilities.features).toEqual([]);
    expect(overlay.tents.features).toEqual([]); // no tent exists in the data, so none is drawn
  });
  it('labels come from the catalog in the requested language and fall back to English', () => {
    const b12 = (lang: string) => venueOverlay(geometry, catalog, lang).labels.find((l) => l.id === 'B12')!.text;
    expect(b12('en')).toBe('Block 12');
    expect(b12('ur')).toBe('بلاک 12');
    expect(b12('ur-Latn')).toBe('Block 12');
    expect(b12('fr')).toBe('Block 12');
    expect(overlay.labels.filter((l) => l.kind === 'block')).toHaveLength(42);
  });
  it('presentationMarkers: a gate gets one marker; a block gets its centre pin plus a separate, labelled route end', () => {
    const route = routeTo('B5');
    const end = route.line!.points[route.line!.points.length - 1];
    const dest = describeDestination('B5', route.nodeIds[route.nodeIds.length - 1], end, geometry, catalog);
    const m = presentationMarkers({ id: 'GATE_12', coordinate: route.line!.points[0] }, dest, null);
    expect(m.features.map((f) => f.properties.role)).toEqual(['origin', 'destination', 'endpoint']);
    const centre = IJTEMA_BLOCKS.find((b) => b.id === 'B5')!.center;
    expect(m.features[1].geometry.coordinates).toEqual([centre.lng, centre.lat]);
    expect(m.features[2].geometry.coordinates).toEqual([end.lng, end.lat]);
    const gateRoute = routeTo('GATE_13');
    const g = describeDestination('GATE_13', 'GATE_13', gateRoute.line!.points[gateRoute.line!.points.length - 1], geometry, catalog);
    expect(presentationMarkers(null, g, null).features.map((f) => f.properties.role)).toEqual(['destination']);
  });
});

describe('createMapLibreNavigationMap with geometry', () => {
  const make = (extra = {}) => createMapLibreNavigationMap({ ...options, geometry, catalog, ...extra });
  beforeEach(() => { mockSetStop.mockClear(); });

  it('draws block fills and outlines, rastas, gates, and no longer draws first-node dots that would pass for entrances', async () => {
    const Map = make();
    const api = await render(<Map {...base} />);
    expect(data(api, 'sdk-blocks').features).toHaveLength(42);
    expect(data(api, 'sdk-lines').features).toHaveLength(14);
    expect(data(api, 'sdk-gates').features.length).toBeGreaterThan(10);
    expect(api.queryByTestId('source-sdk-places')).toBeNull();
    for (const id of ['sdk-block-fill', 'sdk-block-outline', 'sdk-block-selected', 'sdk-rasta', 'sdk-special-route', 'sdk-gate']) expect(api.getByTestId(`layer-${id}`)).toBeTruthy();
  });
  it('highlights the selected block by filter without rebuilding any data, and keeps the pin and route end apart', async () => {
    const Map = make();
    const api = await render(<Map {...base} />);
    const blocksBefore = data(api, 'sdk-blocks');
    const route = routeTo('B5');
    await api.rerender(<Map {...base} route={route} originId="GATE_12" destinationId="B5" />);
    expect(api.getByTestId('layer-sdk-block-selected').props.filter).toEqual(['==', ['get', 'id'], 'B5']);
    expect(data(api, 'sdk-blocks')).toBe(blocksBefore); // same object: the polygon data is not rebuilt on selection
    expect(data(api, 'sdk-markers').features.map((f: any) => f.properties.role)).toEqual(['origin', 'destination', 'endpoint']);
    const centre = IJTEMA_BLOCKS.find((b) => b.id === 'B5')!.center;
    expect(data(api, 'sdk-markers').features[1].geometry.coordinates).toEqual([centre.lng, centre.lat]);
    expect(api.getByTestId('layer-sdk-endpoint')).toBeTruthy();
  });
  it('a tap on a block or gate reports its stable id; the map never starts a route itself', async () => {
    const selected: string[] = [];
    const Map = make({ onSelectPlace: (id: string) => selected.push(id) });
    const api = await render(<Map {...base} />);
    await act(async () => api.getByTestId('source-sdk-blocks').props.onPress({ nativeEvent: { features: [{ properties: { id: 'B7' } }] } }));
    await act(async () => api.getByTestId('source-sdk-gates').props.onPress({ nativeEvent: { features: [{ properties: { id: 'GATE_13' } }] } }));
    await act(async () => api.getByTestId('source-sdk-blocks').props.onPress({ nativeEvent: { features: [] } }));
    expect(selected).toEqual(['B7', 'GATE_13']);
  });
  it('labels are React Native text markers that appear from the label zoom, ignore touches, and relabel in place for another language', async () => {
    const Map = make();
    const api = await render(<Map {...base} />);
    expect(api.queryByTestId('marker-label-B12')).toBeNull();
    await act(async () => api.getByTestId('map').props.onRegionDidChange({ nativeEvent: { zoom: 17 } }));
    expect(api.getByTestId('marker-label-B12').props.pointerEvents).toBe('none');
    expect(api.getByText('Block 12')).toBeTruthy();
    const mapBefore = api.getByTestId('map');
    await api.rerender(<Map {...base} language="ur" />);
    expect(api.getByText('بلاک 12')).toBeTruthy();
    expect(api.getByTestId('map')).toBe(mapBefore); // same native map instance: no remount, no camera command
    expect(mockSetStop).not.toHaveBeenCalled();
    await act(async () => api.getByTestId('map').props.onRegionDidChange({ nativeEvent: { zoom: 14 } }));
    expect(api.queryByTestId('marker-label-B12')).toBeNull();
  });
  it('the dark appearance restyles the overlay colours in place', async () => {
    const Map = make();
    const api = await render(<Map {...base} colorScheme="light" />);
    const light = api.getByTestId('layer-sdk-block-fill').props.paint['fill-color'];
    await api.rerender(<Map {...base} colorScheme="dark" />);
    expect(api.getByTestId('layer-sdk-block-fill').props.paint['fill-color']).not.toBe(light);
  });
  it('without geometry the map is exactly the old one', async () => {
    const Map = createMapLibreNavigationMap(options);
    const api = await render(<Map {...base} route={routeTo('B5')} originId="GATE_12" destinationId="B5" />);
    expect(api.queryByTestId('source-sdk-blocks')).toBeNull();
    expect(data(api, 'sdk-markers').features.map((f: any) => f.properties.role)).toEqual(['origin', 'destination']);
    expect(api.getByTestId('source-sdk-places')).toBeTruthy();
  });
});

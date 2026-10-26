import React from 'react';
import { act, render } from '@testing-library/react-native';
import type { NavigationMapHandle, NavigationMapProps } from '@muslim-ummah/offline-navigation/ui';
import { createMapLibreNavigationMap } from '@muslim-ummah/offline-navigation/maplibre';
import { testVenue } from './sdkTestVenue';

// A stable stand-in for the native map: it records the style, the sources/layers mounted and every camera command.
const mockSetStop = jest.fn((stop: unknown) => Promise.resolve(stop));
jest.mock('@maplibre/maplibre-react-native', () => {
  const R = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    Map: (p: any) => R.createElement(View, { testID: 'map', ...p }, p.children),
    Camera: (p: any) => {
      R.useImperativeHandle(p.ref, () => ({ setStop: mockSetStop }), []);
      return R.createElement(View, { testID: 'camera', initialViewState: p.initialViewState });
    },
    GeoJSONSource: (p: any) => R.createElement(View, { testID: `source-${p.id}`, data: p.data }, p.children),
    Layer: (p: any) => R.createElement(View, { testID: `layer-${p.id}`, ...p }),
  };
});

const points = [{ lat: 24.9, lng: 67.0 }, { lat: 24.91, lng: 67.01 }];
const route = { originId: 'lobby', destinationId: 'hall', nodeIds: [], distanceM: 1, steps: [], line: { points, cumulativeM: [0, 1], totalM: 1 } } as any;
const options = { venue: testVenue, archiveUri: 'file:///v.pmtiles', archiveZoom: { min: 10, max: 17 }, initialCenter: points[0], initialZoom: 15 };
const base: NavigationMapProps = { phase: 'browsing' as any, route: null, originId: null, destinationId: null, position: null, stepIndex: 0, onAvailabilityChange: jest.fn() };

type View = Awaited<ReturnType<typeof render>>;
const load = (api: View) => act(async () => api.getByTestId('map').props.onDidFinishLoadingMap());
const data = (api: View, id: string) => api.getByTestId(`source-${id}`).props.data;

beforeEach(() => { mockSetStop.mockClear(); (base.onAvailabilityChange as jest.Mock).mockClear(); });

describe('createMapLibreNavigationMap', () => {
  it('starts from the offline archive only and reports available once the style has loaded', async () => {
    const Map = createMapLibreNavigationMap(options);
    const api = await render(<Map {...base} />);
    expect(api.getByTestId('map').props.mapStyle.sources['sdk-basemap']).toMatchObject({ url: 'pmtiles://file:///v.pmtiles' });
    expect(api.getByTestId('camera').props.initialViewState).toEqual({ center: [67.0, 24.9], zoom: 15 });
    expect(base.onAvailabilityChange).not.toHaveBeenCalled();
    await load(api);
    expect(base.onAvailabilityChange).toHaveBeenCalledWith(true);
    expect(mockSetStop).not.toHaveBeenCalled(); // nothing to frame without a route
  });

  it('a failed load and a missing archive both tell the screen the basemap is unavailable', async () => {
    const Map = createMapLibreNavigationMap(options);
    const failed = await render(<Map {...base} />);
    await act(async () => failed.getByTestId('map').props.onDidFailLoadingMap());
    expect(base.onAvailabilityChange).toHaveBeenLastCalledWith(false);
    (base.onAvailabilityChange as jest.Mock).mockClear();
    const Plain = createMapLibreNavigationMap({ ...options, archiveUri: null });
    const plain = await render(<Plain {...base} />);
    await load(plain);
    expect(base.onAvailabilityChange).toHaveBeenCalledWith(false);
    expect(base.onAvailabilityChange).not.toHaveBeenCalledWith(true);
  });

  it('draws the route, origin and destination, and frames the route once the map is ready', async () => {
    const Map = createMapLibreNavigationMap(options);
    const api = await render(<Map {...base} route={route} originId="lobby" destinationId="hall" />);
    expect(data(api, 'sdk-route').features[0].geometry.coordinates).toEqual([[67.0, 24.9], [67.01, 24.91]]);
    expect(data(api, 'sdk-markers').features.map((f: any) => f.properties.role)).toEqual(['origin', 'destination']);
    expect(mockSetStop).not.toHaveBeenCalled(); // not before the native map has loaded
    await load(api);
    expect(mockSetStop).toHaveBeenCalledWith(expect.objectContaining({ bounds: [67.0, 24.9, 67.01, 24.91], bearing: 0, pitch: 0 }));
  });

  it('reserves only a Recenter-sized strip below the route: the screen already lays the map out above its panel', async () => {
    const Map = createMapLibreNavigationMap(options);
    const api = await render(<Map {...base} route={route} originId="lobby" destinationId="hall" />);
    await load(api);
    expect(mockSetStop).toHaveBeenLastCalledWith(expect.objectContaining({ padding: { top: 48, right: 40, bottom: 56, left: 40 } }));
    const Overlay = createMapLibreNavigationMap({ ...options, bottomPadding: 300 });
    const overlay = await render(<Overlay {...base} route={route} originId="lobby" destinationId="hall" />);
    await load(overlay);
    expect(mockSetStop).toHaveBeenLastCalledWith(expect.objectContaining({ padding: expect.objectContaining({ bottom: 300 }) }));
  });

  it('follows the snapped walker only while live, and recenter() reapplies the current framing', async () => {
    const Map = createMapLibreNavigationMap({ ...options, followZoom: 17 });
    const handle = React.createRef<NavigationMapHandle>();
    const api = await render(<Map {...base} ref={handle} route={route} phase={'guide' as any} />);
    await load(api);
    mockSetStop.mockClear();
    await api.rerender(<Map {...base} ref={handle} route={route} phase={'live' as any} position={{ lat: 24.905, lng: 67.005 }} />);
    expect(mockSetStop).toHaveBeenLastCalledWith(expect.objectContaining({ center: [67.005, 24.905], zoom: 17 }));
    expect(data(api, 'sdk-markers').features.map((f: any) => f.properties.role)).toContain('position');
    mockSetStop.mockClear();
    await act(async () => handle.current!.recenter());
    expect(mockSetStop).toHaveBeenCalledWith(expect.objectContaining({ center: [67.005, 24.905] }));
    await api.rerender(<Map {...base} ref={handle} route={route} phase={'guide' as any} />);
    mockSetStop.mockClear();
    await act(async () => handle.current!.recenter());
    expect(mockSetStop).toHaveBeenCalledWith(expect.objectContaining({ bounds: [67.0, 24.9, 67.01, 24.91] }));
  });

  it('a camera command that rejects natively never becomes an unhandled rejection', async () => {
    mockSetStop.mockImplementationOnce(() => Promise.reject(new Error('view gone')));
    const Map = createMapLibreNavigationMap(options);
    const api = await render(<Map {...base} route={route} />);
    await load(api);
    await act(async () => { await Promise.resolve(); });
    expect(mockSetStop).toHaveBeenCalled();
  });

  it('clearing the route empties the line and markers', async () => {
    const Map = createMapLibreNavigationMap(options);
    const api = await render(<Map {...base} route={route} originId="lobby" destinationId="hall" />);
    await api.rerender(<Map {...base} />);
    expect(data(api, 'sdk-route').features).toEqual([]);
    expect(data(api, 'sdk-markers').features).toEqual([]);
  });

  it('keeps the OpenStreetMap credit visible and clear of the panel; no logo, no glyphs', async () => {
    const Map = createMapLibreNavigationMap({ ...options, attributionBottomInset: 40 });
    const props = (await render(<Map {...base} />)).getByTestId('map').props;
    expect(props.attribution).toBe(true);
    expect(props.attributionPosition).toEqual({ bottom: 40, left: 8 });
    expect(props.logo).toBe(false);
    expect(props.mapStyle).not.toHaveProperty('glyphs');
    expect(JSON.stringify(props.mapStyle)).toContain('OpenStreetMap');
  });
});

import React from 'react';
import { render, act } from '@testing-library/react-native';
import { buildBasemapStyle, BASEMAP_ATTRIBUTION } from '../views/components/mapgl/basemapStyle';
import { regionFromViewState } from '../views/components/mapgl/OfflineMapCanvas';

type MapProps = Record<string, (...args: unknown[]) => unknown> & { mapStyle: unknown };
let mockLastMapProps: MapProps | undefined;
const mockQueryRenderedFeatures = jest.fn();

jest.mock('@maplibre/maplibre-react-native', () => {
  const React = require('react');
  const Map = (props: any) => {
    mockLastMapProps = props;
    React.useImperativeHandle(props.ref, () => ({ queryRenderedFeatures: mockQueryRenderedFeatures }));
    return React.createElement('MockMap', null, props.children);
  };
  const Noop = () => null;
  return { Map, Camera: Noop, GeoJSONSource: Noop, Layer: Noop };
});

import { OfflineMapCanvas } from '../views/components/mapgl/OfflineMapCanvas';

const REGION = { latitude: 25, longitude: 67, latitudeDelta: 0.01, longitudeDelta: 0.01 };
const mount = async (over = {}) =>
  await render(<OfflineMapCanvas archiveUri="file:///data/map/a.pmtiles" archiveZoom={{ min: 12, max: 16 }} initialRegion={REGION} overlays={[]} {...over} />);

describe('buildBasemapStyle', () => {
  const style = buildBasemapStyle('file:///data/map/a.pmtiles', { min: 12, max: 16 });

  it('reads only the local PMTiles archive and carries ODbL attribution', () => {
    expect(Object.values(style.sources)).toEqual([
      { type: 'vector', url: 'pmtiles://file:///data/map/a.pmtiles', minzoom: 12, maxzoom: 16, attribution: BASEMAP_ATTRIBUTION },
    ]);
  });

  it('has no glyphs, sprite or remote URL anywhere, so a render cannot touch the network', () => {
    expect(style).not.toHaveProperty('glyphs');
    expect(style).not.toHaveProperty('sprite');
    expect(JSON.stringify(style)).not.toMatch(/https?:\/\//);
  });

  it('references only layers the archive pipeline produces', () => {
    const used = new Set(style.layers.map((l) => l['source-layer']).filter(Boolean));
    expect([...used].sort()).toEqual(['buildings', 'landuse', 'roads', 'water']);
  });
});

describe('regionFromViewState', () => {
  it('turns MapLibre centre+bounds into a Region', () => {
    expect(regionFromViewState({ center: [67, 25], bounds: [66.99, 24.99, 67.01, 25.02] })).toEqual({
      latitude: 25, longitude: 67, latitudeDelta: expect.closeTo(0.03, 6), longitudeDelta: expect.closeTo(0.02, 6),
    });
  });
});

describe('OfflineMapCanvas', () => {
  beforeEach(() => {
    mockQueryRenderedFeatures.mockReset();
    mockLastMapProps = undefined;
  });

  it('fires onReady once when the map finishes loading', async () => {
    const onReady = jest.fn();
    await mount({ onReady });
    await act(async () => { mockLastMapProps!.onDidFinishLoadingMap(null); mockLastMapProps!.onDidFinishLoadingMap(null); });
    expect(onReady).toHaveBeenCalledTimes(1);
  });

  it('turns a tap on overlapping features into one press per distinct feature, at the tap coordinate', async () => {
    const onFeaturePress = jest.fn();
    const onBackgroundPress = jest.fn();
    mockQueryRenderedFeatures.mockResolvedValue([
      { properties: { id: 'G1', kind: 'gate' } },
      { properties: { id: 'R1', kind: 'rasta' } },
      { properties: { id: 'R1', kind: 'rasta' } },
      { properties: { label: 'no id' } },
    ]);
    await mount({ onFeaturePress, onBackgroundPress });
    await act(async () => { await mockLastMapProps!.onPress({ nativeEvent: { lngLat: [67.5, 25.5], point: [10, 20] } }); });
    expect(mockQueryRenderedFeatures).toHaveBeenCalledWith([10, 20], { layers: expect.arrayContaining(['hit-gates', 'hit-rastas']) });
    expect(onFeaturePress.mock.calls.map(([p]) => [p.id, p.kind])).toEqual([['G1', 'gate'], ['R1', 'rasta']]);
    expect(onFeaturePress.mock.calls[0][0].coordinate).toEqual({ latitude: 25.5, longitude: 67.5 });
    expect(onBackgroundPress).not.toHaveBeenCalled();
  });

  it('reports a background press when no feature is hit', async () => {
    const onFeaturePress = jest.fn();
    const onBackgroundPress = jest.fn();
    mockQueryRenderedFeatures.mockResolvedValue([]);
    await mount({ onFeaturePress, onBackgroundPress });
    await act(async () => { await mockLastMapProps!.onPress({ nativeEvent: { lngLat: [67, 25], point: [1, 1] } }); });
    expect(onBackgroundPress).toHaveBeenCalledTimes(1);
    expect(onFeaturePress).not.toHaveBeenCalled();
  });

  it('treats only user-driven region changes as a pan that cancels programmatic replay', async () => {
    const onUserPan = jest.fn();
    await mount({ onUserPan });
    await act(async () => { mockLastMapProps!.onRegionWillChange({ nativeEvent: { userInteraction: false } }); });
    expect(onUserPan).not.toHaveBeenCalled();
    await act(async () => { mockLastMapProps!.onRegionWillChange({ nativeEvent: { userInteraction: true } }); });
    expect(onUserPan).toHaveBeenCalledTimes(1);
  });

  it('disables gestures together (scroll, zoom, rotate) when the host asks', async () => {
    await mount({ gesturesEnabled: false });
    expect(mockLastMapProps).toMatchObject({ dragPan: false, touchZoom: false, touchRotate: false });
  });
});

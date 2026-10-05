import React from 'react';
import { render, act } from '@testing-library/react-native';
import { buildBasemapStyle, BASEMAP_ATTRIBUTION } from '../views/components/mapgl/basemapStyle';
import { regionFromViewState } from '../views/components/mapgl/OfflineMapCanvas';

type MapProps = Record<string, (...args: unknown[]) => unknown> & { mapStyle: unknown };
let mockLastMapProps: MapProps | undefined;
const mockQueryRenderedFeatures = jest.fn();
const mockImageSets: string[][] = [];

jest.mock('@maplibre/maplibre-react-native', () => {
  const React = require('react');
  const Map = (props: any) => {
    mockLastMapProps = props;
    React.useImperativeHandle(props.ref, () => ({ queryRenderedFeatures: mockQueryRenderedFeatures }));
    return React.createElement('MockMap', null, props.children);
  };
  const Noop = () => null;
  const Images = (props: any) => { mockImageSets.push(Object.keys(props.images)); return null; };
  return { Map, Camera: Noop, GeoJSONSource: Noop, Layer: Noop, Images };
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

  it('falls back to a plain land canvas (no source) when the archive is unavailable', () => {
    const plain = buildBasemapStyle(null, { min: 12, max: 16 });
    expect(plain.sources).toEqual({});
    expect(plain.layers.map((l) => l.id)).toEqual(['bg']);
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
    mockImageSets.length = 0;
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

  it('ignores a region event without bounds/centre instead of throwing inside the native event handler', async () => {
    const onRegionChangeComplete = jest.fn();
    await mount({ onRegionChangeComplete });
    await act(async () => { mockLastMapProps!.onRegionDidChange({ nativeEvent: {} }); });
    expect(onRegionChangeComplete).not.toHaveBeenCalled();
  });

  it('a rejected feature query is swallowed, not an unhandled rejection', async () => {
    mockQueryRenderedFeatures.mockRejectedValue(new Error('view gone'));
    await mount({});
    await act(async () => { await mockLastMapProps!.onPress({ nativeEvent: { lngLat: [67, 25], point: [1, 1] } }); });
  });

  // Registering images at load delayed the map becoming ready (16 facility images ≈ 1.7 s on the emulator), so only the
  // few needed at first paint are registered up front.
  it('registers the facility badges only after the map is ready', async () => {
    await mount({});
    const upfront = mockImageSets.flat();
    expect(upfront).toEqual(expect.arrayContaining(['pin-destination', 'pin-start', 'user-heading']));
    expect(upfront.some((n) => n.startsWith('facility-'))).toBe(false);

    await act(async () => { mockLastMapProps!.onDidFinishLoadingMap(null); });
    expect(mockImageSets.flat().filter((n) => n.startsWith('facility-')).length).toBeGreaterThanOrEqual(8);
  });
});

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// #140 POC harness — isolated, NOT wired into HomeScreen. Proves MapLibre renders a bundled
// PMTiles archive with the network off. Enabled only when EXPO_PUBLIC_OFFLINE_MAP_POC=1.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Camera, GeoJSONSource, Layer, Map, type CameraRef } from '@maplibre/maplibre-react-native';
import type { StyleSpecification } from '@maplibre/maplibre-gl-style-spec';
import { getBundledBasemap } from '../services/BundledBasemap';

// Confirmed official gate coordinates (AGENTS.md).
const GATE_12: [number, number] = [67.006339, 24.963676];
const GATE_13: [number, number] = [67.006862, 24.963718];
const GATE_14: [number, number] = [67.007675, 24.965516];
const ROUTE: GeoJSON.Feature<GeoJSON.LineString> = {
  type: 'Feature',
  properties: {},
  geometry: { type: 'LineString', coordinates: [GATE_12, GATE_13, GATE_14] },
};
const POINTS: GeoJSON.FeatureCollection<GeoJSON.Point> = {
  type: 'FeatureCollection',
  features: [
    { type: 'Feature', properties: { role: 'destination' }, geometry: { type: 'Point', coordinates: GATE_14 } },
    { type: 'Feature', properties: { role: 'user' }, geometry: { type: 'Point', coordinates: GATE_13 } },
  ],
};

function buildStyle(archiveFileUri: string): StyleSpecification {
  return {
    version: 8,
    // No glyphs/sprite on purpose: the POC has no symbol layers, so nothing can reach for a remote font/sprite.
    sources: { base: { type: 'vector', url: `pmtiles://${archiveFileUri}` } },
    layers: [
      { id: 'bg', type: 'background', paint: { 'background-color': '#F4F1EA' } },
      { id: 'landuse', type: 'fill', source: 'base', 'source-layer': 'landuse', paint: { 'fill-color': '#DDE8D2' } },
      { id: 'water', type: 'fill', source: 'base', 'source-layer': 'water', paint: { 'fill-color': '#BBD6EA' } },
      { id: 'buildings', type: 'fill', source: 'base', 'source-layer': 'buildings', paint: { 'fill-color': '#E3DDD0' } },
      {
        id: 'roads',
        type: 'line',
        source: 'base',
        'source-layer': 'roads',
        paint: { 'line-color': '#FFFFFF', 'line-width': ['interpolate', ['linear'], ['zoom'], 12, 0.5, 17, 4] },
      },
    ],
  };
}

export function OfflineMapPoc() {
  const camera = useRef<CameraRef>(null);
  const [archiveUri, setArchiveUri] = useState<string | null>(null);
  const [status, setStatus] = useState('copying archive…');

  useEffect(() => {
    (async () => {
      try {
        const { uri, reused } = await getBundledBasemap();
        setStatus(`archive ${reused ? 'reused' : 'installed'}`);
        setArchiveUri(uri);
      } catch (e) {
        setStatus(`ARCHIVE ERROR: ${String(e)}`);
      }
    })();
  }, []);

  const style = useMemo(() => (archiveUri ? buildStyle(archiveUri) : null), [archiveUri]);

  return (
    <View style={styles.fill}>
      {style && (
        <Map
          style={styles.fill}
          mapStyle={style}
          onDidFinishLoadingStyle={() => setStatus((s) => `${s} | style loaded`)}
          onDidFinishRenderingMapFully={() => setStatus((s) => (s.includes('rendered') ? s : `${s} | rendered`))}
          onDidFailLoadingMap={() => setStatus((s) => `${s} | LOAD FAILED`)}
        >
          <Camera ref={camera} initialViewState={{ center: GATE_13, zoom: 14 }} />
          <GeoJSONSource id="route" data={ROUTE}>
            <Layer
              id="route-line"
              type="line"
              paint={{ 'line-color': '#1769E0', 'line-width': 6 }}
              layout={{ 'line-cap': 'round', 'line-join': 'round' }}
            />
          </GeoJSONSource>
          <GeoJSONSource id="points" data={POINTS}>
            <Layer
              id="points-circle"
              type="circle"
              paint={{
                'circle-radius': ['case', ['==', ['get', 'role'], 'user'], 9, 12],
                'circle-color': ['case', ['==', ['get', 'role'], 'user'], '#1769E0', '#D93025'],
                'circle-stroke-color': '#FFFFFF',
                'circle-stroke-width': 3,
              }}
            />
          </GeoJSONSource>
        </Map>
      )}
      <View style={styles.hud} pointerEvents="box-none">
        <Text style={styles.status} testID="poc-status">{status}</Text>
        <View style={styles.row}>
          <Pressable
            testID="poc-ease"
            accessibilityRole="button"
            style={styles.btn}
            onPress={() => camera.current?.easeTo({ center: GATE_14, zoom: 17, duration: 600 })}
          >
            <Text style={styles.btnText}>Ease to destination</Text>
          </Pressable>
          <Pressable
            testID="poc-fit"
            accessibilityRole="button"
            style={styles.btn}
            onPress={() => camera.current?.fitBounds([GATE_12[0], GATE_12[1], GATE_14[0], GATE_14[1]], { duration: 600, padding: { top: 80, right: 80, bottom: 160, left: 80 } })}
          >
            <Text style={styles.btnText}>Fit route</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  hud: { position: 'absolute', left: 0, right: 0, bottom: 24, paddingHorizontal: 16, gap: 8 },
  status: { backgroundColor: '#000C', color: '#FFF', padding: 8, borderRadius: 8, fontSize: 12 },
  row: { flexDirection: 'row', gap: 8 },
  btn: { backgroundColor: '#1769E0', paddingVertical: 12, paddingHorizontal: 14, borderRadius: 10 },
  btnText: { color: '#FFF', fontWeight: '600' },
});

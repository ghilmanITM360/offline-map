/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// #140 POC/acceptance harness — isolated, NOT wired into HomeScreen. Renders the real venue data through
// the production MapLibre canvas on the bundled offline basemap. Enabled only with EXPO_PUBLIC_OFFLINE_MAP_POC=1.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import provenance from '../../assets/offline-map/BASEMAP_PROVENANCE.json';
import { getBundledBasemap } from '../services/BundledBasemap';
import { LANDMARK_PLACES } from '../constants/data';
import { IJTEMA_MAP_REGION } from '../data/ijtema/mapBounds';
import { V2MapRenderingService } from '../services/V2MapRenderingService';
import { OfflineMapCanvas, type MapFeaturePress } from '../views/components/mapgl/OfflineMapCanvas';
import type { MapCameraHandle } from '../views/components/mapgl/MapCameraHandle';
import { buildHomeVenueOverlay, buildMarkerOverlay, buildRouteOverlay } from '../views/components/mapgl/overlaySpec';

const GATE_12 = { latitude: 24.963676, longitude: 67.006339 };
const GATE_13 = { latitude: 24.963718, longitude: 67.006862 };
const GATE_14 = { latitude: 24.965516, longitude: 67.007675 };
const ROUTE = [GATE_12, GATE_13, GATE_14];

export function OfflineMapPoc() {
  const camera = useRef<MapCameraHandle>(null);
  const [archiveUri, setArchiveUri] = useState<string | null>(null);
  const [status, setStatus] = useState('installing basemap…');
  const [navMode, setNavMode] = useState(false);
  const [last, setLast] = useState('tap a block, gate, rasta or facility');

  useEffect(() => {
    getBundledBasemap()
      .then(({ uri, reused }) => {
        setStatus(`basemap ${reused ? 'reused' : 'installed'}`);
        setArchiveUri(uri);
      })
      .catch((e) => setStatus(`BASEMAP ERROR: ${String(e)}`));
  }, []);

  const layers = useMemo(() => V2MapRenderingService.getHomeLayers({}), []);
  const overlays = useMemo(
    () => [
      ...buildHomeVenueOverlay({
        venueBoundary: layers.venueBoundary,
        blocks: layers.blocks,
        rastas: layers.rastas,
        specialRoutes: layers.specialRoutes,
        gates: layers.gates,
        facilities: LANDMARK_PLACES,
        activeMapFilter: 'none',
      }),
      ...buildRouteOverlay(
        navMode
          ? { outside: [], roadFollowing: false, inside: ROUTE, walked: ROUTE.slice(0, 2), remaining: ROUTE.slice(1) }
          : { outside: [], roadFollowing: false, inside: ROUTE },
      ),
      ...buildMarkerOverlay({ destination: GATE_14, start: GATE_12, user: { coordinate: GATE_13, accuracy: 25, following: navMode } }),
    ],
    [layers, navMode],
  );

  return (
    <View style={styles.fill}>
      {archiveUri && (
        <OfflineMapCanvas
          testID="poc-map"
          style={styles.fill}
          archiveUri={archiveUri}
          archiveZoom={provenance.zoom}
          initialRegion={IJTEMA_MAP_REGION}
          overlays={overlays}
          ref={camera}
          onReady={() => setStatus((s) => `${s} | ready`)}
          onLoadFailed={() => setStatus((s) => `${s} | LOAD FAILED`)}
          onFeaturePress={(p: MapFeaturePress) => setLast(`${p.kind}:${p.id}`)}
          onBackgroundPress={() => setLast('background')}
        />
      )}
      <View style={styles.hud} pointerEvents="box-none">
        <Text style={styles.status} testID="poc-status">{`${status} | ${last}`}</Text>
        <View style={styles.row}>
          <Pressable testID="poc-ease" accessibilityRole="button" style={styles.btn} onPress={() => camera.current?.animateToRegion({ ...GATE_14, latitudeDelta: 0.002, longitudeDelta: 0.002 }, 600)}>
            <Text style={styles.btnText}>Ease</Text>
          </Pressable>
          <Pressable testID="poc-fit" accessibilityRole="button" style={styles.btn} onPress={() => camera.current?.fitToCoordinates(ROUTE, { edgePadding: { top: 80, right: 60, bottom: 160, left: 60 }, animated: true })}>
            <Text style={styles.btnText}>Fit route</Text>
          </Pressable>
          <Pressable testID="poc-nav" accessibilityRole="button" style={styles.btn} onPress={() => setNavMode((v) => !v)}>
            <Text style={styles.btnText}>{navMode ? 'Preview' : 'Nav'}</Text>
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

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useImperativeHandle, useMemo, useRef } from 'react';
import { type NativeSyntheticEvent, type StyleProp, type ViewStyle, useWindowDimensions } from 'react-native';
import { Camera, Map, type CameraRef, type MapRef, type ViewStateChangeEvent } from '@maplibre/maplibre-react-native';
import type { Region } from 'react-native-maps';
import type { Coordinate } from '../../../models/types';
import { buildBasemapStyle } from './basemapStyle';
import { createMapLibreCameraHandle, regionToMapLibreZoom } from './maplibreCameraHandle';
import type { MapCameraHandle } from './MapCameraHandle';
import { HIT_LAYER_IDS, type FeatureKind, type OverlaySpec } from './overlaySpec';
import { OverlayScene } from './OverlayScene';

export interface MapFeaturePress {
  id: string;
  kind: FeatureKind;
  coordinate: Coordinate;
}

export interface OfflineMapCanvasProps {
  /** `file://` URI of the installed basemap archive (see BundledBasemap); null renders a plain canvas. */
  archiveUri: string | null;
  archiveZoom: { min: number; max: number };
  initialRegion: Region;
  /** Draw order bottom → top, on top of the basemap. */
  overlays: OverlaySpec[];
  style?: StyleProp<ViewStyle>;
  testID?: string;
  importantForAccessibility?: 'auto' | 'yes' | 'no' | 'no-hide-descendants';
  /** Keeps the OSM attribution control (bottom-left, away from the right-hand control stack) clear of sheets and the nav bar: offset from the bottom edge, dp. */
  attributionBottomInset?: number;
  gesturesEnabled?: boolean;
  rotateEnabled?: boolean;
  onLayout?: (width: number, height: number) => void;
  /** Style + archive loaded: the camera can be commanded. Fires once. */
  onReady?: () => void;
  onLoadFailed?: () => void;
  /** Continuous while the camera moves (programmatic or gesture). */
  onRegionChange?: () => void;
  onRegionChangeComplete?: (region: Region) => void;
  /** First tick of a user-driven move — cancels any stale programmatic camera replay. */
  onUserPan?: () => void;
  /** One call per tappable feature under the finger; the caller disambiguates overlapping hits. */
  onFeaturePress?: (press: MapFeaturePress) => void;
  /** A tap that hit no feature. */
  onBackgroundPress?: () => void;
  ref?: React.Ref<MapCameraHandle>;
}

export const regionFromViewState = (v: { center: [number, number]; bounds: [number, number, number, number] }): Region => ({
  latitude: v.center[1],
  longitude: v.center[0],
  latitudeDelta: Math.abs(v.bounds[3] - v.bounds[1]),
  longitudeDelta: Math.abs(v.bounds[2] - v.bounds[0]),
});

export function OfflineMapCanvas(props: OfflineMapCanvasProps) {
  const { archiveUri, archiveZoom, initialRegion, overlays, ref } = props;
  const mapRef = useRef<MapRef>(null);
  const cameraRef = useRef<CameraRef>(null);
  const viewportRef = useRef({ width: 0, height: 0 });
  const readyRef = useRef(false);
  const { width: windowWidth } = useWindowDimensions();

  const handle = useMemo(
    () =>
      createMapLibreCameraHandle({
        getCamera: () => cameraRef.current,
        getMap: () => mapRef.current,
        getViewport: () => viewportRef.current,
        isReady: () => readyRef.current,
      }),
    [],
  );
  useImperativeHandle(ref, () => handle, [handle]);

  const mapStyle = useMemo(() => buildBasemapStyle(archiveUri, archiveZoom), [archiveUri, archiveZoom]);
  const initialViewState = useMemo(
    () => ({
      center: [initialRegion.longitude, initialRegion.latitude] as [number, number],
      zoom: regionToMapLibreZoom(initialRegion, windowWidth),
    }),
    // The initial camera is applied once by the native Camera; later changes go through the handle.
    [],
  );

  const { onFeaturePress, onBackgroundPress, onReady, onLoadFailed, onRegionChange, onRegionChangeComplete, onUserPan } = props;

  const handlePress = useCallback(
    async (event: NativeSyntheticEvent<{ lngLat: [number, number]; point: [number, number] }>) => {
      const { lngLat, point } = event.nativeEvent;
      let features: GeoJSON.Feature[] = [];
      try {
        features = (await mapRef.current?.queryRenderedFeatures(point, { layers: [...HIT_LAYER_IDS] })) ?? [];
      } catch {
        return; // the native view went away mid-query: nothing was tapped
      }
      const hits = features.filter((f) => f.properties?.id && f.properties?.kind);
      if (hits.length === 0) {
        onBackgroundPress?.();
        return;
      }
      const coordinate = { latitude: lngLat[1], longitude: lngLat[0] };
      const seen = new Set<string>();
      for (const f of hits) {
        const key = `${f.properties!.kind}:${f.properties!.id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        onFeaturePress?.({ id: String(f.properties!.id), kind: f.properties!.kind as FeatureKind, coordinate });
      }
    },
    [onFeaturePress, onBackgroundPress],
  );

  return (
    <Map
      ref={mapRef}
      testID={props.testID}
      style={props.style}
      mapStyle={mapStyle as never}
      importantForAccessibility={props.importantForAccessibility}
      logo={false}
      attribution
      attributionPosition={{ bottom: props.attributionBottomInset ?? 8, left: 8 }}
      compass={false}
      dragPan={props.gesturesEnabled !== false}
      touchZoom={props.gesturesEnabled !== false}
      doubleTapZoom={props.gesturesEnabled !== false}
      doubleTapHoldZoom={props.gesturesEnabled !== false}
      touchRotate={props.gesturesEnabled !== false && props.rotateEnabled !== false}
      touchPitch={false}
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        viewportRef.current = { width, height };
        props.onLayout?.(width, height);
      }}
      onDidFinishLoadingMap={() => {
        if (readyRef.current) return;
        readyRef.current = true;
        onReady?.();
      }}
      onDidFailLoadingMap={() => onLoadFailed?.()}
      onPress={handlePress as never}
      onRegionWillChange={(e: NativeSyntheticEvent<ViewStateChangeEvent>) => {
        if (e.nativeEvent.userInteraction) onUserPan?.();
      }}
      onRegionIsChanging={() => onRegionChange?.()}
      onRegionDidChange={(e: NativeSyntheticEvent<ViewStateChangeEvent>) => {
        // The native view state is empty when the map has no size/target yet — there is no region to report.
        if (!e.nativeEvent?.center || !e.nativeEvent?.bounds) return;
        onRegionChangeComplete?.(regionFromViewState(e.nativeEvent as never));
      }}
    >
      <Camera ref={cameraRef} initialViewState={initialViewState} />
      <OverlayScene specs={overlays} />
    </Map>
  );
}

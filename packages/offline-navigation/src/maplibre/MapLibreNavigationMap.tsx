/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import { Platform, StyleSheet } from 'react-native';
import { Camera, GeoJSONSource, Layer, Map, type CameraRef } from '@maplibre/maplibre-react-native';
import type { VenueCoordinate, VenueDataSource } from '../domain/venue';
import type { NavigationMapProps } from '../ui/NavigationScreenTypes';
import { boundsOfPoints, markerCollection, placeCollection, placePoints, routeCollection } from './navigationOverlay';
import { buildOfflineBasemapStyle } from './offlineBasemapStyle';

export interface MapLibreNavigationMapColors {
  route: string;
  routeCasing: string;
  origin: string;
  destination: string;
  position: string;
  place: string;
  halo: string;
}

export const DEFAULT_MAP_COLORS: MapLibreNavigationMapColors = {
  route: '#0B6B4D', routeCasing: '#FFFFFF', origin: '#2E7D32', destination: '#C62828', position: '#1D6FE0', place: '#6B6B6B', halo: '#FFFFFF',
};

/** The overlay on the dark basemap: a bright route over a dark casing, markers that stay visible on dark land. */
export const DEFAULT_MAP_COLORS_DARK: MapLibreNavigationMapColors = {
  route: '#5FD3A5', routeCasing: '#0B1511', origin: '#7BDC86', destination: '#FF7A7A', position: '#5AA9FF', place: '#9BA8A1', halo: '#E8EEEA',
};

export interface MapLibreNavigationMapOptions {
  /** The venue the controller routes over: its places are drawn as small dots. */
  venue: VenueDataSource;
  /** `file://` URI of the installed PMTiles archive. Null draws a plain canvas and reports the basemap unavailable. */
  archiveUri: string | null;
  /** The archive's zoom range (MapLibre zoom levels). */
  archiveZoom: { min: number; max: number };
  /** Where the camera starts before there is a route. */
  initialCenter: VenueCoordinate;
  initialZoom: number;
  /** Overrides for the default overlay colours; they replace the default for BOTH appearances. */
  colors?: Partial<MapLibreNavigationMapColors>;
  /**
   * Space the camera keeps clear at the bottom edge of the MAP VIEW, dp. `NavigationScreen` lays the map out above its panel, so
   * this only clears the Recenter button (default 56); raise it only if the host overlays its own panel on the map.
   */
  bottomPadding?: number;
  /** Keeps the OpenStreetMap attribution (bottom-left) clear of the panel and the navigation bar, dp. Default 8. */
  attributionBottomInset?: number;
  /** MapLibre zoom while following the walker. Default 17. */
  followZoom?: number;
}

const MIN_FIT_SPAN_DEG = 0.001;
const MOVE_MS = 500;
const emptyCollection = { type: 'FeatureCollection', features: [] } as const;

/**
 * The reusable offline MapLibre map for `NavigationScreen`'s `MapComponent`. It renders what it is given (basemap from the
 * local archive, venue places, the route, origin, destination and the walker) and decides nothing. Create it once, outside
 * render, so the component identity stays stable.
 */
export function createMapLibreNavigationMap(options: MapLibreNavigationMapOptions): React.ComponentType<NavigationMapProps> {
  const { venue, archiveUri, archiveZoom, initialCenter, initialZoom, bottomPadding = 56, attributionBottomInset = 8, followZoom = 17 } = options;
  const lightColors = { ...DEFAULT_MAP_COLORS, ...options.colors };
  const darkColors = { ...DEFAULT_MAP_COLORS_DARK, ...options.colors };
  const places = placePoints(venue);
  const placeData = placeCollection(places);
  // Both styles are built once. Switching appearance swaps the style object only: the component, its camera and its sources stay mounted.
  const styles = { light: buildOfflineBasemapStyle(archiveUri, archiveZoom, Platform.OS, 'light'), dark: buildOfflineBasemapStyle(archiveUri, archiveZoom, Platform.OS, 'dark') };
  const initialViewState = { center: [initialCenter.lng, initialCenter.lat] as [number, number], zoom: initialZoom };
  const padding = { top: 48, right: 40, bottom: bottomPadding, left: 40 };
  const circle = (colors: MapLibreNavigationMapColors, id: string, role: string, color: string, radius: number, stroke: number) => (
    <Layer key={id} id={id} type="circle" filter={['==', ['get', 'role'], role] as never}
      paint={{ 'circle-color': color, 'circle-radius': radius, 'circle-stroke-color': colors.halo, 'circle-stroke-width': stroke } as never} />
  );

  return function MapLibreNavigationMap({ phase, route, originId, destinationId, position, onAvailabilityChange, colorScheme = 'light', ref }: NavigationMapProps) {
    const colors = colorScheme === 'dark' ? darkColors : lightColors;
    const cameraRef = useRef<CameraRef>(null);
    const readyRef = useRef(false);
    const latest = useRef({ phase, route, position });
    latest.current = { phase, route, position };

    const routeData = useMemo(() => routeCollection(route), [route]);
    const markerData = useMemo(() => markerCollection(places, originId, destinationId, position), [originId, destinationId, position]);

    // True from the moment the user deliberately pans/zooms the map while live until Recenter (or a new route or phase). While true the
    // map no longer chases the walker; the controller, the live route and the walker marker are unaffected.
    const browsingRef = useRef(false);
    const shapeRef = useRef({ route, phase });

    // Follows the walker while live, frames the whole route otherwise, and does nothing when there is nothing to frame.
    // `force` is the Recenter control: it always follows/frames again.
    const frame = useCallback((force = false) => {
      const camera = cameraRef.current;
      if (!readyRef.current || !camera) return;
      const { phase: p, route: r, position: pos } = latest.current;
      if (force) browsingRef.current = false;
      else if (p === 'live' && browsingRef.current) return;
      const stop = p === 'live' && pos
        ? { center: [pos.lng, pos.lat], zoom: followZoom, duration: MOVE_MS, easing: 'ease' }
        : (() => {
            const bounds = boundsOfPoints(r?.line?.points ?? [], MIN_FIT_SPAN_DEG);
            return bounds ? { bounds, padding, bearing: 0, pitch: 0, duration: MOVE_MS, easing: 'ease' } : null;
          })();
      // A native rejection (view torn down mid-flight) must never become an unhandled promise rejection.
      if (stop) void Promise.resolve(camera.setStop(stop as never)).catch(() => undefined);
    }, []);

    useImperativeHandle(ref, () => ({ recenter: () => frame(true) }), [frame]);
    useEffect(() => {
      // A different route or phase is a new thing to look at: follow again.
      if (shapeRef.current.route !== route || shapeRef.current.phase !== phase) { browsingRef.current = false; shapeRef.current = { route, phase }; }
      frame();
    }, [frame, route, phase, position]);
    // Only gestures count: MapLibre reports our own camera commands as programmatic (userInteraction false).
    const onRegionWillChange = useCallback((event: { nativeEvent?: { userInteraction?: boolean } }) => {
      if (event.nativeEvent?.userInteraction === true && latest.current.phase === 'live') browsingRef.current = true;
    }, []);

    // No archive: the plain canvas still draws the route, but the user is told the basemap is missing.
    // Only a change is reported, so a style reload that succeeds again does not re-render the screen for nothing.
    const availableRef = useRef<boolean | null>(null);
    const reportAvailable = useCallback((available: boolean) => {
      if (availableRef.current === available) return;
      availableRef.current = available;
      onAvailabilityChange(available);
    }, [onAvailabilityChange]);
    useEffect(() => { if (archiveUri === null) reportAvailable(false); }, [reportAvailable]);

    return (
      <Map
        style={StyleSheet.absoluteFill}
        mapStyle={styles[colorScheme] as never}
        androidView="texture"
        logo={false}
        attribution
        attributionPosition={{ bottom: attributionBottomInset, left: 8 }}
        compass={false}
        touchPitch={false}
        onDidFinishLoadingMap={() => {
          // Availability follows every native outcome (a later success clears an earlier failure); only the camera framing is once-per-map.
          if (archiveUri !== null) reportAvailable(true);
          if (readyRef.current) return;
          readyRef.current = true;
          frame();
        }}
        onRegionWillChange={onRegionWillChange as never}
        onDidFailLoadingMap={() => reportAvailable(false)}
      >
        <Camera ref={cameraRef} initialViewState={initialViewState} />
        <GeoJSONSource id="sdk-places" data={placeData as never}>
          <Layer id="sdk-places-dot" type="circle" minzoom={15}
            paint={{ 'circle-color': colors.place, 'circle-radius': 3.5, 'circle-stroke-color': colors.halo, 'circle-stroke-width': 1 } as never} />
        </GeoJSONSource>
        <GeoJSONSource id="sdk-route" data={(routeData.features.length ? routeData : emptyCollection) as never}>
          <Layer id="sdk-route-casing" type="line" layout={{ 'line-cap': 'round', 'line-join': 'round' } as never}
            paint={{ 'line-color': colors.routeCasing, 'line-width': 9 } as never} />
          <Layer id="sdk-route-line" type="line" layout={{ 'line-cap': 'round', 'line-join': 'round' } as never}
            paint={{ 'line-color': colors.route, 'line-width': 5.5 } as never} />
        </GeoJSONSource>
        <GeoJSONSource id="sdk-markers" data={markerData as never}>
          {circle(colors, 'sdk-origin', 'origin', colors.origin, 8, 3)}
          {circle(colors, 'sdk-destination', 'destination', colors.destination, 9, 3)}
          {circle(colors, 'sdk-position', 'position', colors.position, 8, 3)}
        </GeoJSONSource>
      </Map>
    );
  };
}

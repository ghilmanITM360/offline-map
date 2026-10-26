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
  const colors = { ...DEFAULT_MAP_COLORS, ...options.colors };
  const places = placePoints(venue);
  const placeData = placeCollection(places);
  const mapStyle = buildOfflineBasemapStyle(archiveUri, archiveZoom, Platform.OS);
  const initialViewState = { center: [initialCenter.lng, initialCenter.lat] as [number, number], zoom: initialZoom };
  const padding = { top: 48, right: 40, bottom: bottomPadding, left: 40 };
  const circle = (id: string, role: string, color: string, radius: number, stroke: number) => (
    <Layer key={id} id={id} type="circle" filter={['==', ['get', 'role'], role] as never}
      paint={{ 'circle-color': color, 'circle-radius': radius, 'circle-stroke-color': colors.halo, 'circle-stroke-width': stroke } as never} />
  );

  return function MapLibreNavigationMap({ phase, route, originId, destinationId, position, onAvailabilityChange, ref }: NavigationMapProps) {
    const cameraRef = useRef<CameraRef>(null);
    const readyRef = useRef(false);
    const latest = useRef({ phase, route, position });
    latest.current = { phase, route, position };

    const routeData = useMemo(() => routeCollection(route), [route]);
    const markerData = useMemo(() => markerCollection(places, originId, destinationId, position), [originId, destinationId, position]);

    // Follows the walker while live, frames the whole route otherwise, and does nothing when there is nothing to frame.
    const frame = useCallback(() => {
      const camera = cameraRef.current;
      if (!readyRef.current || !camera) return;
      const { phase: p, route: r, position: pos } = latest.current;
      const stop = p === 'live' && pos
        ? { center: [pos.lng, pos.lat], zoom: followZoom, duration: MOVE_MS, easing: 'ease' }
        : (() => {
            const bounds = boundsOfPoints(r?.line?.points ?? [], MIN_FIT_SPAN_DEG);
            return bounds ? { bounds, padding, bearing: 0, pitch: 0, duration: MOVE_MS, easing: 'ease' } : null;
          })();
      // A native rejection (view torn down mid-flight) must never become an unhandled promise rejection.
      if (stop) void Promise.resolve(camera.setStop(stop as never)).catch(() => undefined);
    }, []);

    useImperativeHandle(ref, () => ({ recenter: frame }), [frame]);
    useEffect(frame, [frame, route, phase, position]);

    // No archive: the plain canvas still draws the route, but the user is told the basemap is missing.
    useEffect(() => { if (archiveUri === null) onAvailabilityChange(false); }, [onAvailabilityChange]);

    return (
      <Map
        style={StyleSheet.absoluteFill}
        mapStyle={mapStyle as never}
        androidView="texture"
        logo={false}
        attribution
        attributionPosition={{ bottom: attributionBottomInset, left: 8 }}
        compass={false}
        touchPitch={false}
        onDidFinishLoadingMap={() => {
          if (readyRef.current) return;
          readyRef.current = true;
          if (archiveUri !== null) onAvailabilityChange(true);
          frame();
        }}
        onDidFailLoadingMap={() => onAvailabilityChange(false)}
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
          {circle('sdk-origin', 'origin', colors.origin, 8, 3)}
          {circle('sdk-destination', 'destination', colors.destination, 9, 3)}
          {circle('sdk-position', 'position', colors.position, 8, 3)}
        </GeoJSONSource>
      </Map>
    );
  };
}

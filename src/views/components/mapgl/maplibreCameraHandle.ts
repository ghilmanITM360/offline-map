/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CameraRef, MapRef } from '@maplibre/maplibre-react-native';
import type { MapCameraHandle } from './MapCameraHandle';

// MapLibre's world is 512px at zoom 0, Google's is 256px, so the same view is one zoom level lower in
// MapLibre. All app-facing zoom numbers (navigation zoom 18, label thresholds) stay in Google terms.
export const googleZoomToMapLibre = (zoom: number) => zoom - 1;
export const mapLibreZoomToGoogle = (zoom: number) => zoom + 1;

/** MapLibre zoom at which `longitudeDelta` degrees span `viewportWidth` dp. */
export function regionToMapLibreZoom(region: { longitudeDelta: number }, viewportWidth: number): number {
  const width = Math.max(viewportWidth, 256);
  return Math.log2((360 * width) / (512 * Math.max(region.longitudeDelta, 1e-6)));
}

// Premium-motion ceiling (#140): never the library default of 2 s "fly".
const FIT_DURATION_MS = 500;

interface Deps {
  getCamera: () => CameraRef | null;
  getMap: () => MapRef | null;
  getViewport: () => { width: number; height: number };
  /** True once the native map has loaded. Before that its native methods dereference a missing MapLibreMap. */
  isReady: () => boolean;
}

export function createMapLibreCameraHandle({ getCamera, getMap, getViewport, isReady }: Deps): MapCameraHandle {
  const readyCamera = () => (isReady() ? getCamera() : null);
  const readyMap = () => (isReady() ? getMap() : null);
  return {
    animateToRegion(region, duration = 500) {
      void readyCamera()?.setStop({
        center: [region.longitude, region.latitude],
        zoom: regionToMapLibreZoom(region, getViewport().width),
        duration,
        easing: 'ease',
      });
    },

    fitToCoordinates(coordinates, options) {
      if (coordinates.length === 0) return;
      let west = Infinity, south = Infinity, east = -Infinity, north = -Infinity;
      for (const c of coordinates) {
        west = Math.min(west, c.longitude);
        east = Math.max(east, c.longitude);
        south = Math.min(south, c.latitude);
        north = Math.max(north, c.latitude);
      }
      void readyCamera()?.setStop({
        bounds: [west, south, east, north],
        padding: options?.edgePadding,
        duration: options?.animated === false ? 0 : FIT_DURATION_MS,
        easing: 'ease',
      });
    },

    animateCamera(camera, options) {
      const stop: Record<string, unknown> = {};
      if (camera.center) stop.center = [camera.center.longitude, camera.center.latitude];
      if (camera.zoom !== undefined) stop.zoom = googleZoomToMapLibre(camera.zoom);
      if (camera.heading !== undefined) stop.bearing = camera.heading;
      if (camera.pitch !== undefined) stop.pitch = camera.pitch;
      void readyCamera()?.setStop({ ...stop, duration: options?.duration ?? 500, easing: 'ease' } as never);
    },

    async getCamera() {
      const m = readyMap();
      if (!m) throw new Error('Map not ready');
      const view = await m.getViewState();
      return {
        center: { latitude: view.center[1], longitude: view.center[0] },
        zoom: mapLibreZoomToGoogle(view.zoom),
        heading: view.bearing,
        pitch: view.pitch,
      };
    },

    async pointForCoordinate(coordinate) {
      const m = readyMap();
      if (!m) throw new Error('Map not ready');
      const [x, y] = await m.project([coordinate.longitude, coordinate.latitude]);
      return { x, y };
    },
  };
}

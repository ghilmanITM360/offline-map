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
}

export function createMapLibreCameraHandle({ getCamera, getMap, getViewport }: Deps): MapCameraHandle {
  return {
    animateToRegion(region, duration = 500) {
      void getCamera()?.setStop({
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
      void getCamera()?.setStop({
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
      void getCamera()?.setStop({ ...stop, duration: options?.duration ?? 500, easing: 'ease' } as never);
    },

    async getCamera() {
      const map = getMap();
      if (!map) throw new Error('Map not ready');
      const view = await map.getViewState();
      return {
        center: { latitude: view.center[1], longitude: view.center[0] },
        zoom: mapLibreZoomToGoogle(view.zoom),
        heading: view.bearing,
        pitch: view.pitch,
      };
    },

    async pointForCoordinate(coordinate) {
      const map = getMap();
      if (!map) throw new Error('Map not ready');
      const [x, y] = await map.project([coordinate.longitude, coordinate.latitude]);
      return { x, y };
    },
  };
}

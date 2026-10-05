/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Coordinate } from '../../../models/types';

/** A map rectangle: its centre and the latitude/longitude it spans. */
export interface Region {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
}

export interface EdgePadding {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface CameraState {
  center: { latitude: number; longitude: number };
  /** Google-equivalent zoom (256px world), the scale HomeScreen's label/zoom logic was written against. */
  zoom?: number;
  heading?: number;
  pitch?: number;
}

/**
 * The slice of a map's imperative API that `useCameraManager` and `MapLabelOverlay` need. The MapLibre adapter
 * (`maplibreCameraHandle`) implements it, so the camera logic stays independent of the renderer (#140).
 */
export interface MapCameraHandle {
  animateToRegion(region: Region, duration?: number): void;
  fitToCoordinates(coordinates: Coordinate[], options?: { edgePadding?: EdgePadding; animated?: boolean }): void;
  animateCamera(camera: Partial<CameraState> & { center?: { latitude: number; longitude: number } }, options?: { duration?: number }): void;
  getCamera(): Promise<CameraState>;
  pointForCoordinate(coordinate: { latitude: number; longitude: number }): Promise<{ x: number; y: number }>;
}

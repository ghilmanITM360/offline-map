/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Region } from 'react-native-maps';
import type { Coordinate } from '../../../models/types';

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
 * The slice of a map's imperative API that `useCameraManager` and `MapLabelOverlay` need. Both
 * react-native-maps' `MapView` (structurally) and the MapLibre adapter satisfy it, so the camera logic
 * is renderer-agnostic while the renderer is being migrated (#140).
 */
export interface MapCameraHandle {
  animateToRegion(region: Region, duration?: number): void;
  fitToCoordinates(coordinates: Coordinate[], options?: { edgePadding?: EdgePadding; animated?: boolean }): void;
  animateCamera(camera: Partial<CameraState> & { center?: { latitude: number; longitude: number } }, options?: { duration?: number }): void;
  getCamera(): Promise<CameraState>;
  pointForCoordinate(coordinate: { latitude: number; longitude: number }): Promise<{ x: number; y: number }>;
}

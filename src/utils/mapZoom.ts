/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Region } from '../views/components/mapgl/MapCameraHandle';

export const DEFAULT_MAP_ZOOM = 15.5;

/** Single source of truth for region→zoom estimation — used by both Home and Navigation map screens. */
export function estimateZoomFromRegion(region: Region): number {
  const zoom = Math.log2(360 / Math.max(region.longitudeDelta, 0.000001));
  return Number.isFinite(zoom) ? zoom : DEFAULT_MAP_ZOOM;
}

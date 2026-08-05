/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { OfflineMapStatus } from '../models/types';

export type BaseMapMode = 'GOOGLE_BASEMAP' | 'LOCAL_TILES' | 'GRAPH_ONLY';

interface BaseMapModeInputs {
  hasGoogleMapsKey: boolean;
  hasInternet: boolean;
  googleMapLoadFailed: boolean;
  offlineDataDownloaded: boolean;
  offlineMapStatus: OfflineMapStatus;
}

/** Resolves exactly one base-map renderer. A configured online Google map remains
 * selected while its first load is pending; HomeScreen's watchdog changes
 * googleMapLoadFailed only when that attempt demonstrably fails. */
export function resolveBaseMapMode(inputs: BaseMapModeInputs): BaseMapMode {
  if (inputs.hasGoogleMapsKey && inputs.hasInternet && !inputs.googleMapLoadFailed) {
    return 'GOOGLE_BASEMAP';
  }

  const hasValidLocalTiles = inputs.offlineDataDownloaded && inputs.offlineMapStatus === 'downloaded';
  return hasValidLocalTiles ? 'LOCAL_TILES' : 'GRAPH_ONLY';
}

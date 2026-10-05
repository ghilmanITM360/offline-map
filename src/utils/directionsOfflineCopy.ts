/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { OutsideRouteProviderId } from '../models/outsideRouting';

const VENUE_OFFLINE = 'Ijtema routes work without internet.';

/**
 * Offline claim for the Get Directions sheet. The bundled venue graph (and the bundled OSM
 * fallback) is offline; the Google walking leg and the direct guide need no claim from here —
 * OutsideRouteStatusCard already describes them. Never claim "all information".
 *
 * `basemapOffline` is legacy plumbing: the basemap now ships with the app, so it is always false.
 */
export function directionsOfflineCaption(
  provider: OutsideRouteProviderId | undefined,
  basemapOffline: boolean,
): string | null {
  if (provider === 'google' || provider === 'direct-guide' || basemapOffline) return null;
  return VENUE_OFFLINE;
}

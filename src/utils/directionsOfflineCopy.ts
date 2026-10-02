/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { OutsideRouteProviderId } from '../models/outsideRouting';

const VENUE_OFFLINE = 'Venue routes work without internet.';

/**
 * Offline claim for the Get Directions sheet. Only the bundled venue graph (and the
 * bundled OSM fallback) is truly offline: downloaded map imagery is not available in
 * production, and the Google walking leg and the direct guide need no claim from here —
 * OutsideRouteStatusCard already describes them. Never claim "maps" or "all information".
 *
 * When the basemap is offline the map banner already says so (and that venue data still
 * works), so the sheet stays silent rather than repeat it (#222 UX-01).
 */
export function directionsOfflineCaption(
  provider: OutsideRouteProviderId | undefined,
  basemapOffline: boolean,
): string | null {
  if (provider === 'google' || provider === 'direct-guide' || basemapOffline) return null;
  return VENUE_OFFLINE;
}

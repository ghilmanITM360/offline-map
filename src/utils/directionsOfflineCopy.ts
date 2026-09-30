/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { OutsideRouteProviderId } from '../models/outsideRouting';

const VENUE_OFFLINE = 'Venue routes work without internet.';
const BASEMAP_OFFLINE = 'The background map picture may not load offline.';

/**
 * Offline claim for the Get Directions sheet. Only the bundled venue graph (and the
 * bundled OSM fallback) is truly offline: downloaded map imagery is not available in
 * production, and the Google walking leg and the direct guide need no claim from here —
 * OutsideRouteStatusCard already describes them. Never claim "maps" or "all information".
 */
export function directionsOfflineCaption(
  provider: OutsideRouteProviderId | undefined,
  basemapOffline: boolean,
): string | null {
  if (provider === 'google' || provider === 'direct-guide') return null;
  return basemapOffline ? `${VENUE_OFFLINE} ${BASEMAP_OFFLINE}` : VENUE_OFFLINE;
}

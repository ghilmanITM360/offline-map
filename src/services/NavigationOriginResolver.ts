/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Coordinate, LocationSource, Place } from '../models/types';
import { LocationAccessService } from './LocationAccessService';
import { SearchService } from './SearchService';

const CANONICAL_FALLBACK_PLACE_ID = 'B2';

export type NavigationOrigin =
  | { kind: 'current_location'; coordinate: Coordinate; source: Extract<LocationSource, 'live' | 'device_last_known'> }
  | { kind: 'fallback_place'; place: Place };

/**
 * Single owner of "where does navigation start from". Prefers the accepted-location
 * service's live/last-known GPS; falls back to the canonical Block 2 / Main Mosque
 * place otherwise. Never trusts raw store currentLocation or invents a second
 * GPS-usability definition (see LocationAccessService.resolveCurrentLocation).
 */
export async function resolveNavigationOrigin(allowPrompt = true): Promise<NavigationOrigin> {
  const result = await LocationAccessService.resolveCurrentLocation(allowPrompt);

  if (result.ok && result.coordinate && result.source) {
    return { kind: 'current_location', coordinate: result.coordinate, source: result.source };
  }

  const fallbackPlace = SearchService.getPlaceById(CANONICAL_FALLBACK_PLACE_ID);
  if (!fallbackPlace) {
    throw new Error(`Canonical fallback origin ${CANONICAL_FALLBACK_PLACE_ID} is missing from location data`);
  }
  return { kind: 'fallback_place', place: fallbackPlace };
}

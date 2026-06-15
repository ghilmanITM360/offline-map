/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { MapBounds } from './types';

// Broad rectangular bounds for the v2 manually marked Ijtema dataset.
// TODO: replace this with a venue polygon geofence once a verified source exists.
export const IJTEMA_MAP_BOUNDS: MapBounds = {
  minLat: 24.963,
  maxLat: 24.9758,
  minLng: 66.9974,
  maxLng: 67.0155,
};

export const IJTEMA_MAP_REGION = {
  latitude: (IJTEMA_MAP_BOUNDS.minLat + IJTEMA_MAP_BOUNDS.maxLat) / 2,
  longitude: (IJTEMA_MAP_BOUNDS.minLng + IJTEMA_MAP_BOUNDS.maxLng) / 2,
  latitudeDelta: IJTEMA_MAP_BOUNDS.maxLat - IJTEMA_MAP_BOUNDS.minLat,
  longitudeDelta: IJTEMA_MAP_BOUNDS.maxLng - IJTEMA_MAP_BOUNDS.minLng,
};

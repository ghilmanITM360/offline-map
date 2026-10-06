/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Place } from '../models/types';

/**
 * What the system Sharesheet receives for a place: its name first, then one tappable map link. The app has no
 * verified App Links (and no scheme to claim), so the link is a plain OpenStreetMap URL — it opens in any browser
 * or map app and matches the app's own basemap. Coordinates are encoded in the link only, never written out.
 * Returns null when the place has no usable coordinate (the caller says it is unavailable).
 */
export function buildPlaceShare(place: Place): { title: string; message: string } | null {
  const c = place.coordinate;
  if (!c || !Number.isFinite(c.latitude) || !Number.isFinite(c.longitude)) return null;
  const lat = c.latitude.toFixed(6);
  const lon = c.longitude.toFixed(6);
  const link = `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=19/${lat}/${lon}`;
  return { title: place.name, message: `${place.name} — Karachi Ijtema\n${link}` };
}

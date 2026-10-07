/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Place } from '../models/types';

/** Default share heading; pass a translated string from the caller once the app is localized. */
export const DEFAULT_SHARE_PREFIX = 'Karachi Ijtema';

/**
 * What the system Sharesheet receives for a place: "📍 <display name> — <prefix>" then one tappable map link. The app
 * has no verified owned-domain App Link (and no scheme to claim), so the link is a plain OpenStreetMap URL — it opens
 * in any browser or map app and matches the app's own basemap; no Google SDK/API/key is involved. Coordinates are
 * encoded in the link only, never written out as text. `url` is returned separately for callers/tests; `message`
 * already contains it (Android's Sharesheet ignores a separate `url`). Returns null when the place has no usable
 * coordinate (the caller says it is unavailable).
 * Future: when an assetlinks.json-verified domain exists, swap `url` for its https place link; nothing else changes.
 */
export function buildPlaceShareMessage(
  place: Place,
  prefix: string = DEFAULT_SHARE_PREFIX,
): { title: string; message: string; url: string } | null {
  const c = place.coordinate;
  if (!c || !Number.isFinite(c.latitude) || !Number.isFinite(c.longitude)) return null;
  const lat = c.latitude.toFixed(6);
  const lon = c.longitude.toFixed(6);
  const url = `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=19/${lat}/${lon}`;
  return { title: place.name, message: `📍 ${place.name} — ${prefix}\n${url}`, url };
}

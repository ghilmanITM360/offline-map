/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Sharing a place sends the person's name for it first, then one tappable map link. Coordinates live only inside
// the link, never as the human-facing message, and nothing internal (ids, "undefined") leaks into the text.

import { buildPlaceShare } from '../utils/placeShare';
import { PublicDestinationsService } from '../services/PublicDestinationsService';
import type { Place } from '../models/types';

const allPublicPlaces: Place[] = PublicDestinationsService.getCategories().flatMap((c) => PublicDestinationsService.getByCategory(c.id));

describe('buildPlaceShare', () => {
  test('there are places in every supported category to check', () => {
    expect(PublicDestinationsService.getCategories().length).toBeGreaterThanOrEqual(4);
    expect(allPublicPlaces.length).toBeGreaterThan(20);
  });

  test.each(allPublicPlaces.map((p) => [p.name, p] as const))('%s: name first, one map link, no raw coordinates or debug text', (_name, place) => {
    const share = buildPlaceShare(place);
    expect(share).not.toBeNull();
    const [firstLine, link, ...rest] = share!.message.split('\n');
    expect(firstLine).toBe(`${place.name} — Karachi Ijtema`);
    expect(link).toMatch(/^https:\/\/www\.openstreetmap\.org\/\?mlat=-?\d+\.\d+&mlon=-?\d+\.\d+#map=\d+\/-?\d+\.\d+\/-?\d+\.\d+$/);
    expect(rest).toEqual([]);
    // Coordinates are encoded in the link only.
    expect(firstLine).not.toMatch(/\d+\.\d{3,}/);
    expect(share!.message).not.toMatch(/Location:|undefined|null|NaN|\[object/);
    expect(share!.message).not.toContain(place.id); // no internal ids
    expect(share!.title).toBe(place.name);
  });

  test('the link points at the place', () => {
    const share = buildPlaceShare({ id: 'x', name: 'Gate 12', category: 'Gate', coordinate: { latitude: 24.963676, longitude: 67.006339 }, sourceVersion: 'v2' } as Place);
    expect(share!.message).toContain('mlat=24.963676&mlon=67.006339');
  });

  test('a place with no usable coordinate cannot be shared', () => {
    expect(buildPlaceShare({ id: 'x', name: 'Nowhere', category: 'Block', sourceVersion: 'v2' } as Place)).toBeNull();
    expect(buildPlaceShare({ id: 'x', name: 'Bad', category: 'Block', coordinate: { latitude: NaN, longitude: 1 }, sourceVersion: 'v2' } as Place)).toBeNull();
  });
});

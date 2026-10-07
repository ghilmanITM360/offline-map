/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Sharing a place sends a human-readable "📍 <name> — Karachi Ijtema" line, then one map link. Coordinates live only
// inside the link; nothing internal (ids, "undefined") leaks; no Google SDK/API is involved.

import { readFileSync } from 'fs';
import { join } from 'path';
import { buildPlaceShareMessage } from '../utils/placeShare';
import { PublicDestinationsService } from '../services/PublicDestinationsService';
import type { Place } from '../models/types';

const categories = PublicDestinationsService.getCategories();
const allPublicPlaces: Place[] = categories.flatMap((c) => PublicDestinationsService.getByCategory(c.id));
const byCategory = (id: string): Place[] => PublicDestinationsService.getByCategory(id as never);

// A decimal pair like "24.96, 67.00" / "24.963676 67.006339" / "(24.96,67.00)".
const RAW_LAT_LNG_PAIR = /-?\d{1,3}\.\d+\s*[,;/ ]\s*-?\d{1,3}\.\d+/;

function expectGoodShare(place: Place, expectedName: string): void {
  const share = buildPlaceShareMessage(place);
  expect(share).not.toBeNull();
  const lines = share!.message.split('\n');
  expect(lines).toHaveLength(2);
  const [firstLine, link] = lines;
  expect(firstLine).toBe(`📍 ${expectedName} — Karachi Ijtema`);
  expect(link).toBe(share!.url);
  expect(share!.title).toBe(expectedName);
  // no raw lat/lng text in the visible body (only the URL may carry coordinates)
  expect(firstLine).not.toMatch(RAW_LAT_LNG_PAIR);
  expect(firstLine).not.toMatch(/\d+\.\d{3,}/);
  // safe https link with the encoded coordinates
  const c = place.coordinate!;
  expect(share!.url).toMatch(/^https:\/\//);
  expect(share!.url).toContain(`mlat=${c.latitude.toFixed(6)}&mlon=${c.longitude.toFixed(6)}`);
  // no internal id / debug text leaks into the visible text
  expect(firstLine).not.toContain(place.id);
  expect(share!.message).not.toMatch(/Location:|undefined|null|NaN|\[object/);
}

describe('buildPlaceShareMessage', () => {
  test('there are places in every supported category to check', () => {
    expect(categories.map((c) => c.id)).toEqual(expect.arrayContaining(['blocks', 'gates', 'rastas', 'special_routes']));
    expect(allPublicPlaces.length).toBeGreaterThan(20);
  });

  test.each(['blocks', 'gates', 'rastas', 'special_routes'])('every %s place shares by its display name', (cat) => {
    const places = byCategory(cat);
    expect(places.length).toBeGreaterThan(0);
    places.forEach((p) => expectGoodShare(p, p.name));
  });

  test('gates, rastas and special routes read as user-facing names, not ids', () => {
    byCategory('gates').forEach((p) => expect(p.name).toMatch(/^Gate \d+/));
    byCategory('rastas').forEach((p) => expect(p.name).toMatch(/^Rasta \d+/));
    byCategory('special_routes').forEach((p) => expect(p.name).toMatch(/\s/));
    allPublicPlaces.forEach((p) => expect(p.name).not.toMatch(/^[a-z]+[_-][a-z0-9_-]+$/)); // no snake/kebab ids
  });

  test('worked examples', () => {
    const block = { id: 'b14', name: 'Block 14', category: 'Block', coordinate: { latitude: 24.96, longitude: 67.0 }, sourceVersion: 'v2' } as Place;
    expect(buildPlaceShareMessage(block)!.message.split('\n')[0]).toBe('📍 Block 14 — Karachi Ijtema');
    const gate = { id: 'g14', name: 'Gate 14', category: 'Gate', coordinate: { latitude: 24.965516, longitude: 67.007675 }, sourceVersion: 'v2' } as Place;
    expect(buildPlaceShareMessage(gate)!.url).toBe('https://www.openstreetmap.org/?mlat=24.965516&mlon=67.007675#map=19/24.965516/67.007675');
  });

  test('facility and parking go through the same path', () => {
    for (const [name, category] of [['Wudu Area', 'Facility'], ['Parking Zone A', 'Parking']] as const) {
      expectGoodShare({ id: 'f-1', name, category, coordinate: { latitude: 24.9641, longitude: 67.0072 }, sourceVersion: 'v2' } as Place, name);
    }
  });

  test('the heading is a localizable argument', () => {
    const place = { id: 'x', name: 'Block 1', category: 'Block', coordinate: { latitude: 24.96, longitude: 67.0 }, sourceVersion: 'v2' } as Place;
    expect(buildPlaceShareMessage(place, 'کراچی اجتماع')!.message.split('\n')[0]).toBe('📍 Block 1 — کراچی اجتماع');
  });

  test('a place with no usable coordinate cannot be shared', () => {
    expect(buildPlaceShareMessage({ id: 'x', name: 'Nowhere', category: 'Block', sourceVersion: 'v2' } as Place)).toBeNull();
    expect(buildPlaceShareMessage({ id: 'x', name: 'Bad', category: 'Block', coordinate: { latitude: NaN, longitude: 1 }, sourceVersion: 'v2' } as Place)).toBeNull();
  });

  test('the builder has no Google Maps/Places dependency', () => {
    const src = readFileSync(join(__dirname, '../utils/placeShare.ts'), 'utf8');
    const imports = src.split('\n').filter((l) => /^\s*import\b|require\(/.test(l)).join('\n');
    expect(imports).not.toMatch(/google|react-native-maps/i);
    expect(src).not.toMatch(/maps\.googleapis|google\.com\/maps|AIza/);
  });
});

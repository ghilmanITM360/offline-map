/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { getLocale } from './localeStore';
import type { MessageKey } from './messages';
import { translate } from './translate';
import type { Locale } from './types';

type Params = Record<string, string>;
type Rule = [pattern: RegExp, key: MessageKey, params: (m: RegExpMatchArray, say: (key: MessageKey) => string) => Params];

const ADJECTIVE: Record<string, MessageKey> = {
  North: 'places.dirNorth',
  South: 'places.dirSouth',
  East: 'places.dirEast',
  West: 'places.dirWest',
};

const COMPASS: Record<string, MessageKey> = {
  North: 'places.compassNorth',
  South: 'places.compassSouth',
  East: 'places.compassEast',
  West: 'places.compassWest',
};

/** Facilities and landmarks, by their exact name in the older venue data (LANDMARK_PLACES). */
const FACILITIES: Record<string, MessageKey> = {
  'Main Masjid': 'places.mainMasjid',
  'North Masjid': 'places.northMasjid',
  'Main North Gate': 'places.mainNorthGate',
  'Main South Gate': 'places.mainSouthGate',
  'East Gate': 'places.eastGate',
  'Food Distribution Area': 'places.foodArea',
  'Water Point (North)': 'places.waterNorth',
  'Water Point (South)': 'places.waterSouth',
  'Medical Camp': 'places.medicalCamp',
  'Lost & Found': 'places.lostFound',
  'Volunteer Coordination Tent': 'places.volunteerTent',
  'Parking Area': 'places.parking',
};

/** The name patterns that exist in the venue data (src/data/ijtema, src/constants/data.ts, block entrances). */
const DIR = 'North|South|East|West';
const RULES: Rule[] = [
  [/^Block\s+(\d+)$/, 'places.block', (m) => ({ n: m[1] })],
  [/^Gate\s+(\d+)$/, 'places.gate', (m) => ({ n: m[1] })],
  [/^Rasta\s+(\d+)$/, 'places.rasta', (m) => ({ n: m[1] })],
  [new RegExp(`^Shahr-e-Pindal (${DIR}) Point (\\d+)$`), 'places.pindalPoint', (m, say) => ({ dir: say(COMPASS[m[1]]), n: m[2] })],
  [new RegExp(`^Shahr-e-Pindal (${DIR})$`), 'places.pindal', (m, say) => ({ dir: say(COMPASS[m[1]]) })],
  [/^Central Junction (\d+)$/, 'places.junction', (m) => ({ n: m[1] })],
  [new RegExp(`^(${DIR}) Bus Terminal$`), 'places.busTerminal', (m, say) => ({ dir: say(ADJECTIVE[m[1]]) })],
  [new RegExp(`^(${DIR}) Boundary Road$`), 'places.boundaryRoad', (m, say) => ({ dir: say(ADJECTIVE[m[1]]) })],
  [/^West Terminal Road$/, 'places.westTerminalRoad', () => ({})],
  [new RegExp(`^(${DIR}) Rasta-(\\d+) End$`), 'places.rastaEnd', (m, say) => ({ dir: say(ADJECTIVE[m[1]]), n: m[2] })],
  [/^East Mid-Rasta End$/, 'places.eastMidRastaEnd', () => ({})],
  [/^North-East Corner$/, 'places.cornerNorthEast', () => ({})],
  [/^South-East Corner$/, 'places.cornerSouthEast', () => ({})],
  [/^Member Masjid Gate (\w+)$/, 'places.memberMasjidGate', (m) => ({ n: m[1] })],
  [new RegExp(`^(${DIR}) Entrance (\\d+)$`), 'places.entranceNumbered', (m, say) => ({ dir: say(ADJECTIVE[m[1]]), n: m[2] })],
  [new RegExp(`^(${DIR}) Entrance$`), 'places.entrance', (m, say) => ({ dir: say(ADJECTIVE[m[1]]) })],
];

/**
 * The one place a venue place name (Block 14, Gate 12, Rasta 7, Shahr-e-Pindal, bus terminals, entrances...) is
 * turned into the chosen language. Views, view models and route instructions all call this instead of printing
 * `place.name`, so a name reads the same everywhere.
 *
 * English is the identity. A name this does not know (or one already in another language) is returned as given, so
 * it never throws and never comes back empty. Numbers stay Western digits exactly as the data writes them, and in
 * Urdu they sit inside bidi isolates so "گیٹ 12" reads correctly right-to-left.
 */
export function localizeVenueName(name: string, locale: Locale = getLocale()): string {
  if (locale === 'en' || !name) return name;
  const trimmed = name.trim();
  if (Object.prototype.hasOwnProperty.call(FACILITIES, trimmed)) return translate(locale, FACILITIES[trimmed]) || name;
  for (const [pattern, key, params] of RULES) {
    const match = trimmed.match(pattern);
    if (!match) continue;
    const text = translate(locale, key, params(match, (k) => translate(locale, k)));
    return text.trim() ? text : name;
  }
  return name;
}

const BIDI_MARKS = /[⁦-⁩‎‏؜]/g;

/** The localized name without invisible direction marks, for matching what a person typed against it. */
export function venueNameForSearch(name: string, locale: Locale = getLocale()): string {
  return localizeVenueName(name, locale).replace(BIDI_MARKS, '');
}

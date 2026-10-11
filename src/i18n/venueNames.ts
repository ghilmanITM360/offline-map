/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { getLocale } from './localeStore';
import { translate } from './translate';
import type { Locale } from './types';

/**
 * The one place a venue place name (Block 14, Gate 12, Rasta 7, Special Route, Shahr-e-Pindal, facilities...) is
 * turned into the chosen language. Views, view models and route instructions all call this instead of printing
 * `place.name`, so a name reads the same everywhere. English is the identity.
 * Owned by the Directory/places localization work; the English fallback keeps every caller safe until then.
 */
export function localizeVenueName(name: string, locale: Locale = getLocale()): string {
  const numbered = /^(Block|Gate|Rasta)\s+(\d+)$/i.exec(name);
  if (numbered) {
    const kind = numbered[1].toLowerCase() as 'block' | 'gate' | 'rasta';
    return translate(locale, `places.${kind}`, { number: numbered[2] });
  }
  const direction = /^Shahr-e-Pindal (North|South|West)$/i.exec(name);
  if (direction) return translate(locale, `places.${direction[1].toLowerCase() as 'north' | 'south' | 'west'}`);
  const entrance = /^(North|South|East|West) Entrance(?: (\d+))?$/i.exec(name);
  if (entrance) return translate(locale, `journeyResidual.${entrance[1].toLowerCase()}Entrance${entrance[2] ? 'Number' : ''}`, entrance[2] ? { number: entrance[2] } : undefined);
  const rastaEnd = /^(North|South|East|West) Rasta-(\d+) End$/i.exec(name);
  if (rastaEnd) return translate(locale, `journeyNames.${rastaEnd[1].toLowerCase()}RastaEnd`, { number: rastaEnd[2] });
  const memberGate = /^Member Masjid Gate (C\d+)$/i.exec(name);
  if (memberGate) return translate(locale, 'journeyNames.memberGateCode', { code: memberGate[1] });
  // Canonical name identity stays in data and search. Exact catalog matches localize known venue names only.
  const fixedNames = ['journeyNames.mainMasjid', 'journeyNames.northMasjid', 'journeyNames.mainNorthGate', 'journeyNames.mainSouthGate', 'journeyNames.eastGate', 'journeyNames.food', 'journeyNames.northWater', 'journeyNames.southWater', 'journeyNames.medical', 'journeyNames.lostFound', 'journeyNames.volunteer', 'journeyNames.northTerminal', 'journeyNames.southTerminal', 'journeyNames.parking', 'journeyNames.northEast', 'journeyNames.southEast', 'journeyNames.eastMid', 'journeyNames.memberMasjid', 'journeyNames.memberGate'];
  for (const key of fixedNames) if (name === translate('en', key)) return translate(locale, key);
  return name;
}

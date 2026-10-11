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
  return name;
}

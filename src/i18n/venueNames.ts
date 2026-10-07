/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { getLocale } from './localeStore';
import type { Locale } from './types';

/**
 * The one place a venue place name (Block 14, Gate 12, Rasta 7, Special Route, Shahr-e-Pindal, facilities...) is
 * turned into the chosen language. Views, view models and route instructions all call this instead of printing
 * `place.name`, so a name reads the same everywhere. English is the identity.
 * Owned by the Directory/places localization work; the English fallback keeps every caller safe until then.
 */
export function localizeVenueName(name: string, _locale: Locale = getLocale()): string {
  return name;
}

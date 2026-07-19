/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { LocalizedLabel } from '../data/ijtema/types';

export type MapLanguage = 'en' | 'ur';

// Thin wrapper over the already-bilingual LocalizedLabel data (blocks.ts/gates.ts/
// rastas.ts/specialRoutes.ts/centralPoints.ts) — see docs/MAP_EXPERIENCE_AUDIT.md
// section 3: no data migration needed, only a rendering-layer consumer.
export class MapLocalizationService {
  static getLocalizedName(name: LocalizedLabel, language: MapLanguage = 'en'): string {
    if (language === 'ur' && name.ur) return name.ur;
    return name.en;
  }

  /** The other language's text, for a bilingual EN+UR map badge — undefined when there's nothing to add. */
  static getSecondaryLabel(name: LocalizedLabel, primaryLanguage: MapLanguage = 'en'): string | undefined {
    if (primaryLanguage === 'ur') {
      return name.en && name.en !== name.ur ? name.en : undefined;
    }
    return name.ur && name.ur !== name.en ? name.ur : undefined;
  }
}

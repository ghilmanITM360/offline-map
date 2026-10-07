/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { t } from '../i18n';
import type { MessageKey } from '../i18n';

// Raw `Place.category` values are data enums, not copy. Each reads as a short label in the chosen language
// (the Directory has always called SpecialRoute "Shahr-e-Pindal").
const CATEGORY_LABEL: Record<string, MessageKey> = {
  Block: 'directory.categoryBlock',
  Gate: 'directory.categoryGate',
  Rasta: 'directory.categoryRasta',
  SpecialRoute: 'directory.categorySpecialRoute',
  Masjid: 'directory.categoryMasjid',
  Terminal: 'directory.categoryTerminal',
  Help: 'directory.categoryHelp',
  Intersection: 'directory.categoryIntersection',
  RoadEndpoint: 'directory.categoryRoadEndpoint',
  Landmark: 'directory.categoryLandmark',
  CustomPoint: 'directory.categoryCustomPoint',
};

export function placeCategoryLabel(category: string): string {
  const key = CATEGORY_LABEL[category];
  return key ? t(key) : category;
}

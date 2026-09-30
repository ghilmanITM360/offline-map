/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Raw `Place.category` values are data enums, not copy. Only SpecialRoute differs from its
// enum spelling — the Directory has always called it Shahr-e-Pindal.
const CATEGORY_LABEL: Record<string, string> = {
  SpecialRoute: 'Shahr-e-Pindal',
};

export function placeCategoryLabel(category: string): string {
  return CATEGORY_LABEL[category] ?? category;
}

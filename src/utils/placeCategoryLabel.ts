/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { getLocale } from '../i18n/localeStore';
import { translate } from '../i18n/translate';
const categories = ['Block', 'Gate', 'Rasta', 'SpecialRoute', 'MemberMasjidGate', 'Facility'] as const;
export function placeCategoryLabel(category: string): string {
  const known = categories.find(value => value === category);
  return known ? translate(getLocale(), `places.${known}`) : category;
}

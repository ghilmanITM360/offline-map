/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { MessageSet } from './types';

/**
 * Declares one area's messages. Keys are `<area>.<name>`; every locale must define every key, so a missing
 * translation is a compile error here and a failing completeness test in CI.
 *   - {name} placeholders are filled by t(key, { name }); every locale must use the same placeholders.
 *   - Counts: define `<key>_one` and `<key>_other` and call tn(key, count).
 */
export function defineMessages<K extends string>(messages: MessageSet<K>): MessageSet<K> {
  return messages;
}

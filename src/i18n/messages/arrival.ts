/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { defineMessages } from '../defineMessages';

/** The arrival card, its screen-reader announcement and the spoken arrival prompt. */
export default defineMessages({
  en: {
    'arrival.title': "You've Arrived!",
    'arrival.announcement': 'Arrived at {place}',
    'arrival.spoken': 'You have arrived at {place}.',
    'arrival.recenter': 'Recenter',
    'arrival.done': 'Done',
    'arrival.doneA11y': 'Done, return to map',
  },
  'ur-Latn': {
    'arrival.title': 'Aap pohanch gaye!',
    'arrival.announcement': '{place} par pohanch gaye',
    'arrival.spoken': 'Aap {place} par pohanch gaye hain.',
    'arrival.recenter': 'Meri location',
    'arrival.done': 'Ho gaya',
    'arrival.doneA11y': 'Ho gaya, naqshe par wapas jayein',
  },
  ur: {
    'arrival.title': 'آپ پہنچ گئے!',
    'arrival.announcement': '{place} پر پہنچ گئے',
    'arrival.spoken': 'آپ {place} پر پہنچ گئے ہیں۔',
    'arrival.recenter': 'میری لوکیشن',
    'arrival.done': 'مکمل',
    'arrival.doneA11y': 'مکمل، نقشے پر واپس جائیں',
  },
});

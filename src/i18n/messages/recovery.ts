/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { defineMessages } from '../defineMessages';

/** The card offered after a journey did not finish (the app was closed or the phone restarted mid-walk). */
export default defineMessages({
  en: {
    'recovery.title': "Your last navigation didn't finish",
    'recovery.bodyWithPlace': 'You were heading to {place}. Want a new route from where you are now?',
    'recovery.bodyGeneric': "Your last navigation didn't finish. Want a new route from where you are now?",
    'recovery.getNewRoute': 'Get new route',
    'recovery.dismiss': 'Dismiss',
  },
  'ur-Latn': {
    'recovery.title': 'Aap ki pichli rehnumai mukammal nahi hui',
    'recovery.bodyWithPlace': 'Aap {place} ja rahe the. Kya aap apni maujooda jagah se naya raasta chahte hain?',
    'recovery.bodyGeneric': 'Aap ki pichli rehnumai mukammal nahi hui. Kya aap apni maujooda jagah se naya raasta chahte hain?',
    'recovery.getNewRoute': 'Naya raasta lein',
    'recovery.dismiss': 'Hata dein',
  },
  ur: {
    'recovery.title': 'آپ کی پچھلی رہنمائی مکمل نہیں ہوئی',
    'recovery.bodyWithPlace': 'آپ {place} جا رہے تھے۔ کیا آپ اپنی موجودہ جگہ سے نیا راستہ چاہتے ہیں؟',
    'recovery.bodyGeneric': 'آپ کی پچھلی رہنمائی مکمل نہیں ہوئی۔ کیا آپ اپنی موجودہ جگہ سے نیا راستہ چاہتے ہیں؟',
    'recovery.getNewRoute': 'نیا راستہ لیں',
    'recovery.dismiss': 'ہٹا دیں',
  },
});

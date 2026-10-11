import { messages, type MessageKey } from '../i18n/messages';
import { localizeVenueName } from '../i18n/venueNames';
import { t } from '../i18n/translate';
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The place adapters describe an unroutable gate in the data team's words ("needs connector
 * verification before routing"). Visitors need to know what happened and what to do, so the views
 * show this wording instead (#128 E). The adapters and their tests keep the original reason.
 */
export function unavailableReasonCopy(reason: string | undefined): string | undefined {
  const match = reason?.match(/^(.*?)\s+needs connector verification before (?:routing|navigation)\.?$/i);
  if (match) return t('journeyCopy.placeNotReady', { place: localizeVenueName(match[1]) });
  if (!reason) return reason;
  // These descriptions remain canonical in cached Place records. Match only known catalog templates,
  // then resolve the current language when rendering; arbitrary owner-provided descriptions pass through.
  const keys: MessageKey[] = ['journeyResidual.fallback', 'journeyResidual.missingCoordinate', 'journeyResidual.verification', 'journeyResidual.block', 'journeyResidual.gate', 'journeyResidual.rasta', 'journeyResidual.corridor', 'journeyResidual.notReady', 'journeyResidual.legacyRasta', 'journeyResidual.legacyMasjid', 'journeyResidual.legacyBlock', 'journeyResidual.legacyGate', 'journeyResidual.legacyPrayer', 'journeyResidual.legacyJunction', 'journeyResidual.landmark.mainPrayer', 'journeyResidual.landmark.northMasjid', 'journeyResidual.landmark.northGate', 'journeyResidual.landmark.southGate', 'journeyResidual.landmark.eastGate', 'journeyResidual.landmark.food', 'journeyResidual.landmark.northWater', 'journeyResidual.landmark.southWater', 'journeyResidual.landmark.medical', 'journeyResidual.landmark.lostFound', 'journeyResidual.landmark.volunteer', 'journeyResidual.landmark.northBus', 'journeyResidual.landmark.southBus', 'journeyResidual.landmark.parking'];
  for (const key of keys) {
    const template = messages.en[key];
    const pieces = template.split('{place}');
    if (pieces.length === 1 && reason === template) return t(key);
    if (pieces.length === 2 && reason.startsWith(pieces[0]) && reason.endsWith(pieces[1])) {
      const place = reason.slice(pieces[0].length, pieces[1].length ? -pieces[1].length : undefined);
      if (place) return t(key, { place: localizeVenueName(place) });
    }
  }
  return localizeVenueName(reason);
}

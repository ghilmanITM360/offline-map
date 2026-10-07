/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { t } from '../i18n';
import { localizeVenueName } from '../i18n/venueNames';

/**
 * Place reasons made by the place adapters are already worded for visitors, in the chosen language. An older
 * English reason in the data team's words ("needs connector verification before routing") still reaches the views
 * from saved or hand-built places; visitors need to know what happened and what to do, so it is reworded here (#128 E).
 */
export function unavailableReasonCopy(reason: string | undefined): string | undefined {
  const dataTeamReason = reason?.match(/^(.*?)\s+needs connector verification before (?:routing|navigation)\.?$/i);
  return dataTeamReason ? t('directory.reasonNotReady', { name: localizeVenueName(dataTeamReason[1]) }) : reason;
}

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { LOCALE_CODES, Locale } from '../types';
import about from './about';
import arrival from './arrival';
import common from './common';
import directions from './directions';
import directory from './directory';
import drawer from './drawer';
import errors from './errors';
import help from './help';
import map from './map';
import navigation from './navigation';
import onboarding from './onboarding';
import place from './place';
import places from './places';
import recovery from './recovery';
import routeGuide from './routeGuide';
import settings from './settings';
import instructions from './instructions';
import journeyMessages from './journeyMessages';

/** One file per area, so areas can be worked on side by side. Register a new area here. */
export const MESSAGE_AREAS = {
  about, arrival, common, directions, directory, drawer, errors, help, map, instructions, journeyMessages,
  navigation, onboarding, place, places, recovery, routeGuide, settings,
};

type Areas = typeof MESSAGE_AREAS;
export type MessageKey = { [A in keyof Areas]: keyof Areas[A]['en'] & string }[keyof Areas];

/** Every key in one table per language. A key defined in two areas is caught by the completeness test. */
export const messages = Object.fromEntries(
  LOCALE_CODES.map((locale) => [
    locale,
    Object.assign({}, ...Object.values(MESSAGE_AREAS).map((area) => (area as Record<Locale, object>)[locale])),
  ]),
) as Record<Locale, Record<MessageKey, string>>;

import type { Locale } from './types';
import { getLocale } from './localeStore';
import { translate } from './translate';
import { localizeVenueName } from './venueNames';
import catalog from './messages/instructions';

export interface SemanticInstruction {
  key: keyof typeof catalog.en;
  params?: Record<string, string | number>;
  maneuver?: 'straight' | 'slight_left' | 'slight_right' | 'left' | 'right' | 'sharp_left' | 'sharp_right' | 'u_turn' | 'arrival';
  arrivalName?: string;
  urduNames?: Record<string, string>;
}
/** Names here are generated venue labels, never provider sentences or route identity. */
export function localizeInstructionName(name: string, locale: Locale = getLocale()): string {
  if (locale === 'en') return name;
  const known: Record<string, keyof typeof catalog.en> = {
    'Middle Road': 'instructions.middleRoad', 'the path': 'instructions.path', 'the junction': 'instructions.junctionLabel', 'destination': 'instructions.destination', 'central junction': 'instructions.centralJunction', 'the route': 'instructions.route',
    'Member Masjid south-west gate': 'instructions.mosqueGateSW', 'Member Masjid south-east gate': 'instructions.mosqueGateSE', 'Member Masjid north-west gate': 'instructions.mosqueGateNW', 'Member Masjid north-east gate': 'instructions.mosqueGateNE',
  };
  if (known[name]) return translate(locale, known[name]);
  const junction = /^(.*?) & (.*?) Junction$/.exec(name);
  if (junction) return translate(locale, 'instructions.junction', { first: localizeInstructionName(junction[1], locale), second: localizeInstructionName(junction[2], locale) });
  const entrance = /^(.*?) Entrance$/.exec(name);
  if (entrance) return translate(locale, 'instructions.entrance', { name: localizeVenueName(entrance[1], locale) });
  return localizeVenueName(name, locale);
}

/** Generated steps carry meaning; arbitrary provider prose is retained verbatim. English stays contract-compatible. */
export function localizeInstruction(step: { text: string; semantic?: SemanticInstruction }, locale: Locale = getLocale()): string {
  if (locale === 'en' || !step.semantic) return step.text;
  const data = step.semantic;
  const params = { ...data.params };
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === 'string') params[key] = locale === 'ur' && data.urduNames?.[key] && data.urduNames[key] !== value ? data.urduNames[key] : localizeInstructionName(value, locale);
  }
  if (data.key.startsWith('instructions.street')) {
    params.road = params.road ? translate(locale, 'instructions.road', {name: params.road}) : '';
  }
  if (data.maneuver) params.maneuver = translate(locale, `instructions.maneuver_${data.maneuver}`);
  return translate(locale, data.key, params) + (data.arrivalName ? translate(locale, 'instructions.streetArrival', {name: localizeInstructionName(data.arrivalName, locale)}) : '');
}

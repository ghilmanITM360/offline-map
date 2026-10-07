import type { OutsideRouteProviderId } from '../models/outsideRouting';
import type { Locale, MessageKey } from '../i18n';
import { getLocale, tIn } from './serviceI18n';

export type OutsideRouteMessageKey =
  | 'provider.google'
  | 'provider.offlineOsm'
  | 'provider.directGuide'
  | 'fallback.googleUnavailable'
  | 'direct.warning'
  | 'direct.notRoadRoute'
  | 'direct.heading'
  | 'action.retryRoadRoute'
  | 'action.chooseGate'
  | 'retrying';

/** The wording lives in the navigation catalog; this maps the outside-route message ids to it. */
const CATALOG_KEYS: Record<OutsideRouteMessageKey, MessageKey> = {
  'provider.google': 'navigation.outsideProviderWalking',
  'provider.offlineOsm': 'navigation.outsideProviderWalking',
  'provider.directGuide': 'navigation.outsideProviderDirect',
  'fallback.googleUnavailable': 'navigation.outsideFallbackSimpler',
  'direct.warning': 'navigation.outsideDirectWarning',
  'direct.notRoadRoute': 'navigation.outsideDirectNotRoad',
  'direct.heading': 'navigation.outsideDirectHeading',
  'action.retryRoadRoute': 'navigation.outsideRetry',
  'action.chooseGate': 'navigation.outsideChooseGate',
  retrying: 'navigation.outsideRetrying',
};

/** In the chosen language unless a language is asked for (the straight-line warning also shows an Urdu copy). */
export function outsideRouteMessage(
  key: OutsideRouteMessageKey,
  language: Locale = getLocale(),
  values: Readonly<Record<string, string>> = {},
): string {
  return tIn(language, CATALOG_KEYS[key], values);
}

export function outsideRouteProviderLabel(provider: OutsideRouteProviderId, language: Locale = getLocale()): string {
  const key: OutsideRouteMessageKey = provider === 'google'
    ? 'provider.google'
    : provider === 'offline-osm'
      ? 'provider.offlineOsm'
      : 'provider.directGuide';
  return outsideRouteMessage(key, language);
}

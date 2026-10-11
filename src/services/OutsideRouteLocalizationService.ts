import type { OutsideRouteProviderId } from '../models/outsideRouting';
import type { Locale } from '../i18n/types';
import { getLocale } from '../i18n/localeStore';
import { translate } from '../i18n/translate';

export type OutsideRouteMessageKey = 'provider.google' | 'provider.offlineOsm' | 'provider.directGuide' | 'fallback.googleUnavailable' | 'direct.warning' | 'direct.notRoadRoute' | 'direct.heading' | 'action.retryRoadRoute' | 'action.chooseGate' | 'retrying';

export function outsideRouteMessage(key: OutsideRouteMessageKey, language: Locale = getLocale(), values: Readonly<Record<string, string>> = {}): string {
  return translate(language, `outside.${key}`, { ...values });
}

export function outsideRouteProviderLabel(provider: OutsideRouteProviderId, language: Locale = getLocale()): string {
  return outsideRouteMessage(provider === 'google' ? 'provider.google' : provider === 'offline-osm' ? 'provider.offlineOsm' : 'provider.directGuide', language);
}

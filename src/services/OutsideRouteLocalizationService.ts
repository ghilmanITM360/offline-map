import type { OutsideRouteProviderId } from '../models/outsideRouting';

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

interface BilingualMessage {
  en: string;
  ur: string;
}

const MESSAGES: Record<OutsideRouteMessageKey, BilingualMessage> = {
  'provider.google': {
    en: 'Google walking route',
    ur: 'گوگل کا پیدل راستہ',
  },
  'provider.offlineOsm': {
    en: 'Offline walking route',
    ur: 'آف لائن پیدل راستہ',
  },
  'provider.directGuide': {
    en: 'Direct gate guide',
    ur: 'گیٹ کی سیدھی سمت کی رہنمائی',
  },
  'fallback.googleUnavailable': {
    en: 'Google walking route unavailable. Using offline walking roads.',
    ur: 'گوگل کا پیدل راستہ دستیاب نہیں۔ آف لائن پیدل سڑکوں کا راستہ استعمال ہو رہا ہے۔',
  },
  'direct.warning': {
    en: 'Direct guidance only. This path may not follow roads.',
    ur: 'سڑک کے مطابق نیویگیشن اس وقت دستیاب نہیں۔ یہ رہنمائی منتخب گیٹ کی سیدھی سمت دکھاتی ہے اور ضروری نہیں کہ پیدل چلنے کے قابل سڑکوں کے مطابق ہو۔',
  },
  'direct.notRoadRoute': {
    en: 'Direct guide — not a road route',
    ur: 'سیدھی سمت کی رہنمائی — یہ سڑک کا راستہ نہیں',
  },
  'direct.heading': {
    en: 'Follow the direction line toward {gate}.',
    ur: 'دکھائی گئی سیدھی سمت میں {gate} کی طرف جائیں۔',
  },
  'action.retryRoadRoute': {
    en: 'Retry road route',
    ur: 'سڑک کے مطابق راستہ دوبارہ تلاش کریں',
  },
  'action.chooseGate': {
    en: 'Choose another gate',
    ur: 'دوسرا گیٹ منتخب کریں',
  },
  retrying: {
    en: 'Checking for a road route…',
    ur: 'سڑک کے مطابق راستہ دوبارہ تلاش ہو رہا ہے…',
  },
};

export function outsideRouteMessage(
  key: OutsideRouteMessageKey,
  language: keyof BilingualMessage = 'en',
  values: Readonly<Record<string, string>> = {},
): string {
  return Object.entries(values).reduce(
    (message, [name, value]) => message.replaceAll(`{${name}}`, value),
    MESSAGES[key][language],
  );
}

export function outsideRouteProviderLabel(provider: OutsideRouteProviderId, language: keyof BilingualMessage = 'en'): string {
  const key: OutsideRouteMessageKey = provider === 'google'
    ? 'provider.google'
    : provider === 'offline-osm'
      ? 'provider.offlineOsm'
      : 'provider.directGuide';
  return outsideRouteMessage(key, language);
}

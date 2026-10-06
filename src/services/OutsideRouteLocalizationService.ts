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
    en: 'Walking route',
    ur: 'پیدل راستہ',
  },
  'provider.offlineOsm': {
    en: 'Walking route',
    ur: 'پیدل راستہ',
  },
  'provider.directGuide': {
    en: 'Straight-line guide',
    ur: 'سیدھی سمت کی رہنمائی',
  },
  'fallback.googleUnavailable': {
    en: 'Using a simpler route. It may be less exact.',
    ur: 'سادہ راستہ استعمال ہو رہا ہے۔ یہ کم درست ہو سکتا ہے۔',
  },
  'direct.warning': {
    en: "We can't find a road route. The arrow points straight to the gate and may not follow walkable roads. Look around as you walk.",
    ur: 'سڑک کا راستہ نہیں مل سکا۔ تیر سیدھا گیٹ کی طرف اشارہ کرتا ہے اور ضروری نہیں کہ پیدل چلنے کے راستوں پر ہو۔ چلتے وقت اردگرد دیکھ لیں۔',
  },
  'direct.notRoadRoute': {
    en: 'Straight-line guide, not a road route',
    ur: 'سیدھی سمت کی رہنمائی، سڑک کا راستہ نہیں',
  },
  'direct.heading': {
    en: 'Walk toward {gate}.',
    ur: '{gate} کی طرف جائیں۔',
  },
  'action.retryRoadRoute': {
    en: 'Try again',
    ur: 'دوبارہ کوشش کریں',
  },
  'action.chooseGate': {
    en: 'Choose another gate',
    ur: 'دوسرا گیٹ منتخب کریں',
  },
  retrying: {
    en: 'Looking for a better route…',
    ur: 'بہتر راستہ تلاش ہو رہا ہے…',
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

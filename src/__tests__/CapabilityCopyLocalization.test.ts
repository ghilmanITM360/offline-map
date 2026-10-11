import { ROUTE_NOT_FOUND, outsideGuideHeadline } from '../utils/routeCopy';
import { useLocaleStore } from '../i18n/localeStore';
import { liveBlockerMessage } from '../services/LocationCapability';
import { resolveStartAction } from '../services/LocationNavigationCapability';
import { outsideRouteMessage } from '../services/OutsideRouteLocalizationService';

afterEach(() => useLocaleStore.getState().setLocale('en'));
it('resolves capability and fallback copy in the current locale after imports', () => {
  const action = () => resolveStartAction({ startSource: 'manual_place', liveFix: null, permission: { granted: false, precision: 'none' } });
  const english = [liveBlockerMessage('weak_fix'), action().primaryLabel, outsideRouteMessage('direct.warning'), ROUTE_NOT_FOUND(), outsideGuideHeadline('Gate 12')];
  for (const locale of ['ur-Latn', 'ur'] as const) {
    useLocaleStore.getState().setLocale(locale);
    const localized = [liveBlockerMessage('weak_fix'), action().primaryLabel, outsideRouteMessage('direct.warning'), ROUTE_NOT_FOUND(), outsideGuideHeadline('Gate 12')];
    localized.forEach((value, index) => expect(value).not.toBe(english[index]));
    expect(action().kind).toBe('route_guide');
  }
});

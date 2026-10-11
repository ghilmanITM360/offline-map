import { IJTEMA_DATA } from '../constants/data';
import { LANDMARK_PLACES } from '../constants/data';
import { useLocaleStore } from '../i18n/localeStore';
import { unavailableReasonCopy } from '../utils/unavailableReasonCopy';
import { SearchService } from '../services/SearchService';
import { MapFeatureFlagsService } from '../services/MapFeatureFlagsService';
import { PlaceDetailService } from '../services/PlaceDetailService';
import { localizeVenueName } from '../i18n/venueNames';

afterEach(() => { jest.restoreAllMocks(); useLocaleStore.getState().setLocale('en'); });
it('translates canonical legacy search descriptions after selection without changing identity', () => {
  jest.spyOn(MapFeatureFlagsService, 'useIjtemaV2Map').mockReturnValue(false);
  const places = [SearchService.search('block 1')[0], SearchService.searchByCategory('rastas')[0], ...SearchService.searchByCategory('gates').slice(0, 1), ...SearchService.searchByCategory('masjids').slice(0, 1), ...LANDMARK_PLACES];
  expect(places.length).toBeGreaterThan(2);
  for (const place of places) {
    expect(place).toBeDefined();
    const canonical = place.description;
    const id = place.id;
    for (const locale of ['ur-Latn', 'ur'] as const) {
      useLocaleStore.getState().setLocale(locale);
      expect(unavailableReasonCopy(canonical)).not.toBe(canonical);
      expect(place.description).toBe(canonical);
      expect(place.id).toBe(id);
    }
  }
});
it('renders cached entrance names in both Urdu forms without changing node order', () => {
  const entries = PlaceDetailService.getEntryPoints('B1');
  expect(entries.length).toBeGreaterThan(0);
  const ids = entries.map((entry) => entry.nodeId);
  for (const locale of ['ur-Latn', 'ur'] as const) {
    useLocaleStore.getState().setLocale(locale);
    entries.forEach((entry) => expect(localizeVenueName(entry.friendlyName)).not.toBe(entry.friendlyName));
    expect(PlaceDetailService.getEntryPoints('B1').map((entry) => entry.nodeId)).toEqual(ids);
  }
});

it('localizes legacy named nodes while retaining every canonical source name and ID', () => {
  const nodes = Object.entries(IJTEMA_DATA.nodes).filter(([, node]) => node.name);
  for (const [id, node] of nodes) {
    const canonical = node.name!;
    expect(localizeVenueName(canonical, 'en')).toBe(canonical);
    expect(localizeVenueName(canonical, 'ur-Latn')).not.toBe(canonical);
    expect(localizeVenueName(canonical, 'ur')).not.toBe(canonical);
    expect(IJTEMA_DATA.nodes[id].name).toBe(canonical);
  }
  expect(localizeVenueName('Owner supplied place', 'ur')).toBe('Owner supplied place');
});

import { useLocaleStore } from '../i18n/localeStore';
import { unavailableReasonCopy } from '../utils/unavailableReasonCopy';
import { localizeVenueName } from '../i18n/venueNames';
import { V2PlaceAdapter } from '../services/V2PlaceAdapter';

afterEach(() => useLocaleStore.getState().setLocale('en'));
it('translates cached descriptions, gate warnings and canonical reasons at display time', () => {
  const places = V2PlaceAdapter.getAllPlaces({ includeUnavailableGates: true });
  const block = places.find((place) => place.sourceKind === 'block')!;
  const description = block.description;
  const english = unavailableReasonCopy(description);
  for (const locale of ['ur-Latn', 'ur'] as const) {
    useLocaleStore.getState().setLocale(locale);
    expect(V2PlaceAdapter.getAllPlaces({ includeUnavailableGates: true })).toBe(places);
    expect(block.description).toBe(description);
    expect(unavailableReasonCopy(description)).not.toBe(english);
    expect(unavailableReasonCopy('Directions to this gate may be less exact.')).not.toBe('Directions to this gate may be less exact.');
    expect(localizeVenueName('North Entrance 2')).not.toBe('North Entrance 2');
  }
});

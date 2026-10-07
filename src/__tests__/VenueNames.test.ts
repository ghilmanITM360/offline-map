/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { IJTEMA_DATA, LANDMARK_PLACES } from '../constants/data';
import { IJTEMA_CENTRAL_POINTS, IJTEMA_SPECIAL_ROUTES } from '../data/ijtema';
import { useLocaleStore } from '../i18n';
import { localizeVenueName, venueNameForSearch } from '../i18n/venueNames';
import { PlaceDetailService } from '../services/PlaceDetailService';
import { PublicDestinationsService } from '../services/PublicDestinationsService';
import { SearchService } from '../services/SearchService';
import { V2PlaceAdapter } from '../services/V2PlaceAdapter';

const ARABIC = /[؀-ۿ]/;
const FSI = '⁨';
const PDI = '⁩';
const digitsOf = (name: string) => name.match(/\d+/g) ?? [];

// Every public place name, and every other name the venue data can show a person.
const publicNames = V2PlaceAdapter.getAllPlaces({ includeUnavailableGates: true }).map((p) => p.name);
const legacyNames = [
  ...(Object.values(IJTEMA_DATA.nodes) as Array<{ name?: string }>).flatMap((n) => (n.name ? [n.name] : [])),
  ...(IJTEMA_DATA.edges as Array<{ name?: string }>).flatMap((e) => (e.name ? [e.name] : [])),
  ...LANDMARK_PLACES.map((p) => p.name),
];
const junctionNames = IJTEMA_CENTRAL_POINTS.map((p) => p.name.en);
const pindalPointNames = IJTEMA_SPECIAL_ROUTES.flatMap((r) => r.points.map((p) => p.name.en));
const entranceNames = ['B1', 'B2', 'B14', 'B24']
  .flatMap((id) => PlaceDetailService.getEntryPoints(id).map((e) => e.friendlyName));
const everyName = [...new Set([...publicNames, ...legacyNames, ...junctionNames, ...pindalPointNames, ...entranceNames])];

afterEach(() => useLocaleStore.setState({ locale: 'en' }));

describe('venue names cover the data', () => {
  test('the sweep sees every kind of name (guards against it silently matching nothing)', () => {
    expect(publicNames.length).toBeGreaterThan(70);
    expect(everyName.length).toBeGreaterThan(130);
    expect(publicNames).toEqual(expect.arrayContaining(['Block 14', 'Gate 01', 'Rasta 07', 'Shahr-e-Pindal North']));
  });

  test.each(everyName)('English keeps %s exactly as the data writes it', (name) => {
    expect(localizeVenueName(name, 'en')).toBe(name);
  });

  test.each(everyName)('Roman Urdu: %s is non-empty, Latin only and keeps its numbers', (name) => {
    const text = localizeVenueName(name, 'ur-Latn');
    expect(text.trim()).not.toBe('');
    expect(ARABIC.test(text)).toBe(false);
    for (const digits of digitsOf(name)) expect(text).toContain(digits);
  });

  test.each(everyName)('Urdu: %s is in Urdu script and keeps its numbers in Western digits', (name) => {
    const text = localizeVenueName(name, 'ur');
    expect(ARABIC.test(text)).toBe(true);
    expect(text).not.toMatch(/[۰-۹]/);
    for (const digits of digitsOf(name)) expect(text).toContain(digits);
  });

  test.each(everyName)('%s is stable: asking twice, or asking again of the answer, changes nothing', (name) => {
    for (const locale of ['en', 'ur-Latn', 'ur'] as const) {
      const once = localizeVenueName(name, locale);
      expect(localizeVenueName(name, locale)).toBe(once);
      expect(localizeVenueName(once, locale)).toBe(once);
    }
  });

  test('every public place is translated, not just passed through', () => {
    for (const name of publicNames) {
      expect(localizeVenueName(name, 'ur')).not.toBe(name);
    }
  });
});

describe('venue name wording', () => {
  test('the common patterns read naturally and keep the data number as written', () => {
    expect(localizeVenueName('Block 14', 'ur')).toBe(`بلاک ${FSI}14${PDI}`);
    expect(localizeVenueName('Gate 01', 'ur')).toBe(`گیٹ ${FSI}01${PDI}`);
    expect(localizeVenueName('Gate 12', 'ur')).toBe(`گیٹ ${FSI}12${PDI}`);
    expect(localizeVenueName('Rasta 07', 'ur')).toBe(`رستہ ${FSI}07${PDI}`);
    expect(localizeVenueName('Block 14', 'ur-Latn')).toBe('Block 14');
    expect(localizeVenueName('Gate 12', 'ur-Latn')).toBe('Gate 12');
    expect(localizeVenueName('Rasta 07', 'ur-Latn')).toBe('Rasta 07');
    expect(venueNameForSearch('Gate 12', 'ur')).toBe('گیٹ 12');
  });

  test('Shahr-e-Pindal, bus terminals, entrances and facilities', () => {
    expect(localizeVenueName('Shahr-e-Pindal North', 'ur-Latn')).toBe('Shahr-e-Pindal Shumal');
    expect(venueNameForSearch('Shahr-e-Pindal South', 'ur')).toBe('شہرِ پنڈال جنوب');
    expect(venueNameForSearch('North Bus Terminal', 'ur')).toBe('شمالی بس ٹرمینل');
    expect(venueNameForSearch('Member Masjid Gate C1', 'ur')).toBe('ممبر مسجد گیٹ C1');
    expect(venueNameForSearch('North Rasta-01 End', 'ur')).toBe('شمالی رستہ 01 کا سرا');
    expect(venueNameForSearch('Medical Camp', 'ur')).toBe('طبی مرکز');
    expect(localizeVenueName('Parking Area', 'ur-Latn')).toBe('Parking');
  });

  test('uses the current language when none is given', () => {
    useLocaleStore.setState({ locale: 'ur' });
    expect(venueNameForSearch('Block 3')).toBe('بلاک 3');
  });

  test('a name it does not know is shown as given: never empty, never an error', () => {
    for (const unknown of ['Lahore Gate', 'Block', 'Gate X', 'constructor', '  ', '']) {
      for (const locale of ['en', 'ur-Latn', 'ur'] as const) {
        expect(() => localizeVenueName(unknown, locale)).not.toThrow();
        expect(localizeVenueName(unknown, locale)).toBe(unknown);
      }
    }
  });
});

describe('places in the chosen language', () => {
  test('directory category chips and a place reason follow the language', () => {
    expect(PublicDestinationsService.getCategories().map((c) => c.label)).toEqual(['Blocks', 'Gates', 'Rastas', 'Shahr-e-Pindal']);
    useLocaleStore.setState({ locale: 'ur' });
    const labels = PublicDestinationsService.getCategories().map((c) => c.label);
    expect(labels).toEqual(['بلاکس', 'گیٹس', 'رستے', 'شہرِ پنڈال']);
    const gate18 = V2PlaceAdapter.getPlaceById('GATE_18');
    expect(ARABIC.test(gate18?.unavailableReason ?? '')).toBe(true);
    expect(gate18?.unavailableReason).toContain('گیٹ');
    useLocaleStore.setState({ locale: 'ur-Latn' });
    expect(V2PlaceAdapter.getPlaceById('GATE_18')?.unavailableReason).toBe(
      'Gate 18 abhi rehnumai ke liye tayyar nahi. Koi aur maqam chunein.',
    );
  });

  test('the unavailable reason is cached per language, never left in the wrong one', () => {
    const english = V2PlaceAdapter.getAllPlaces({ includeUnavailableGates: true }).find((p) => p.id === 'GATE_18');
    useLocaleStore.setState({ locale: 'ur' });
    const urdu = V2PlaceAdapter.getAllPlaces({ includeUnavailableGates: true }).find((p) => p.id === 'GATE_18');
    expect(english?.unavailableReason).toBe("Gate 18 isn't ready for directions yet. Choose another place.");
    expect(urdu?.unavailableReason).not.toBe(english?.unavailableReason);
    useLocaleStore.setState({ locale: 'en' });
    expect(V2PlaceAdapter.getAllPlaces({ includeUnavailableGates: true }).find((p) => p.id === 'GATE_18')?.unavailableReason).toBe(
      english?.unavailableReason,
    );
  });

  test('block entrances are named in the chosen language and keep their order numbers', () => {
    const [first] = PlaceDetailService.getEntryPoints('B1');
    expect(first.friendlyName).toMatch(/^(North|South|East|West) Entrance( \d)?$/);
    expect(first.urduName).toMatch(ARABIC);
    useLocaleStore.setState({ locale: 'ur' });
    const urdu = PlaceDetailService.getEntryPoints('B1')[0];
    expect(urdu.friendlyName).toMatch(ARABIC);
    // The Urdu line under the name is for English readers only.
    expect(urdu.urduName).toBe('');
  });
});

describe('search finds places by the English name and by the name in the user language', () => {
  const ids = (query: string) => SearchService.search(query).map((p) => p.id);

  test('English names work in every language', () => {
    for (const locale of ['en', 'ur-Latn', 'ur'] as const) {
      useLocaleStore.setState({ locale });
      expect(ids('Gate 12')[0]).toBe('GATE_12');
      expect(ids('Block 14')[0]).toBe('B14');
      expect(ids('Rasta 07')).toContain('R7');
    }
  });

  test('Urdu: the Urdu name (and its spelling in the venue wording) finds the place', () => {
    useLocaleStore.setState({ locale: 'ur' });
    expect(ids('گیٹ 12')[0]).toBe('GATE_12');
    expect(ids('بلاک 14')[0]).toBe('B14');
    expect(ids('رستہ 07')).toContain('R7');
    expect(ids('شہرِ پنڈال شمال')[0]).toBe('SHAHR_E_PINDAL_NORTH');
  });

  test('Roman Urdu: the Roman Urdu name finds the place', () => {
    useLocaleStore.setState({ locale: 'ur-Latn' });
    expect(ids('Shahr-e-Pindal Shumal')[0]).toBe('SHAHR_E_PINDAL_NORTH');
    expect(ids('Shahr-e-Pindal Junoob')[0]).toBe('SHAHR_E_PINDAL_SOUTH');
  });

  test('search chips are labelled in the chosen language', () => {
    useLocaleStore.setState({ locale: 'ur' });
    expect(SearchService.getAvailableCategoryChips().map((c) => c.label)).toContain('سب');
  });
});

import { useAppStore } from '../store/useAppStore';
import type { FavoritePlace } from '../models/types';
import { V2PlaceAdapter } from '../services/V2PlaceAdapter';

const initial = useAppStore.getState();
const options = useAppStore.persist.getOptions();
const place = V2PlaceAdapter.getPlaceById('GATE_13')!;
const favorite = { id: 'favorite-13', placeId: place.id, name: place.name,
  category: place.category, coordinate: place.coordinate, savedAt: '2026-10-01T00:00:00Z' } satisfies FavoritePlace;

afterEach(() => {
  useAppStore.persist.setOptions(options);
  useAppStore.setState(initial, true);
});

async function hydrate(state: Record<string, unknown>, version = 2) {
  useAppStore.setState(initial, true);
  useAppStore.persist.setOptions({ storage: {
    getItem: async () => ({ state, version }), setItem: async () => {}, removeItem: async () => {},
  } });
  await useAppStore.persist.rehydrate();
  return useAppStore.getState();
}

describe('persisted place collection validation', () => {
  test.each([null, 'invalid', 42, {}])('current-version non-array collections %j cannot break consumers', async value => {
    const state = await hydrate({ recentSearches: value, favorites: value });
    expect(state.recentSearches.map(item => item.id)).toEqual([]);
    expect(state.favorites.some(item => item.placeId === place.id)).toBe(false);
    expect(() => state.addRecentSearch(place)).not.toThrow();
  });

  test.each([1, 2, 999])('version %i keeps valid entries beside malformed ones and preserves preferences', async version => {
    const state = await hydrate({ recentSearches: [null, place], favorites: [null, favorite],
      settings: { distanceUnit: 'feet' } }, version);
    expect(state.recentSearches).toEqual([place]);
    expect(state.favorites).toEqual([favorite]);
    expect(state.settings.distanceUnit).toBe('feet');
    expect(() => state.updateSettings({ darkMode: true })).not.toThrow();
  });

  test.each([1, 2, 999])('version %i missing collection keys preserve live collections on explicit hydration', async version => {
    useAppStore.setState({ recentSearches: [place], favorites: [favorite] });
    useAppStore.persist.setOptions({ storage: {
      getItem: async () => ({ state: { settings: { darkMode: true } }, version }),
      setItem: async () => {}, removeItem: async () => {},
    } });
    await useAppStore.persist.rehydrate();
    expect(useAppStore.getState().recentSearches).toEqual([place]);
    expect(useAppStore.getState().favorites).toEqual([favorite]);
  });
});

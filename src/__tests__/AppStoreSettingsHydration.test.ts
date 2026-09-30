import { useAppStore } from '../store/useAppStore';

const initial = useAppStore.getState();
const options = useAppStore.persist.getOptions();

afterEach(() => {
  useAppStore.persist.setOptions(options);
  useAppStore.setState(initial, true);
});

async function hydrate(settings: unknown, version = 2) {
  useAppStore.setState(initial, true);
  useAppStore.persist.setOptions({ storage: {
    getItem: async () => ({ state: { settings }, version }),
    setItem: async () => {},
    removeItem: async () => {},
  } });
  await useAppStore.persist.rehydrate();
  return useAppStore.getState().settings;
}

describe('persisted settings validation', () => {
  it.each([2, 1, 999])('keeps settings usable when version %i stores null', async version => {
    const settings = await hydrate(null, version);
    expect(settings).toEqual(initial.settings);
    expect(settings.distanceUnit).toBe('meters');
  });

  it.each(['invalid', [], 42])('rejects non-record settings %j', async payload => {
    expect(await hydrate(payload)).toEqual(initial.settings);
  });

  it('fills missing fields while retaining valid preferences', async () => {
    const settings = await hydrate({ distanceUnit: 'feet', voiceInstructions: false });
    expect(settings).toEqual({ ...initial.settings, distanceUnit: 'feet', voiceInstructions: false });
  });

  it('rejects invalid fields without losing valid preferences', async () => {
    const settings = await hydrate({ mapMode: 'invalid', walkingSpeed: -1, mapSize: 0,
      distanceUnit: 'miles', language: 'invalid', autoFollowLocation: 'yes', darkMode: true,
      unknownField: true });
    expect(settings).toEqual({ ...initial.settings, darkMode: true });
  });

  it.each([NaN, Infinity, 0])('rejects unusable walking speed %j', async walkingSpeed => {
    expect((await hydrate({ walkingSpeed })).walkingSpeed).toBe(1.4);
  });
});
